"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { prisma } from "@/lib/prisma";
import { getChiTieuReport } from "@/lib/sl-dt/report-service";
import { suggestMonthlySlDtTargets } from "@/lib/sl-dt/compute";
import { progressStatusSchema, type ProgressStatusInput } from "@/lib/sl-dt/schemas";
import {
  recomputeLuyKeForRow,
  refreshAutoTarget,
  cascadeFutureMonths,
  findFutureMonths,
  prevMonth as prevMonthRef,
} from "@/lib/sl-dt/recompute";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

const D = (n: number | null | undefined): Prisma.Decimal | null =>
  n == null ? null : new Prisma.Decimal(n);
const toN = (v: unknown): number => (v == null || v === "" ? 0 : Number(v));

const CUR_NUM_FIELDS = new Set([
  "estimateValue",
  "slKeHoachKy",
  "slThucKyTho",
  "dtKeHoachKy",
  "dtThoKy",
  "slTrat",
  "dtTratKy",
]);
const PREV_NUM_FIELDS = new Set(["prevSlLuyKeTho", "prevDtThoLuyKe"]);
const PREV_TO_DB_FIELD: Record<string, "slLuyKeTho" | "dtThoLuyKe"> = {
  prevSlLuyKeTho: "slLuyKeTho",
  prevDtThoLuyKe: "dtThoLuyKe",
};

/**
 * Admin-only: edit any numeric cell on Chỉ tiêu báo cáo.
 * - Current-month fields (kỳ values, estimate, slTrat) → write to slDtMonthlyInput (year, month).
 * - Prev luỹ kế fields → write to slDtMonthlyInput (prev month).
 * - After write, AUTO-RECOMPUTE current-month lũy kế from prev + kỳ.
 * - Returns count of FUTURE months that may also need cascade (caller decides whether to apply).
 */
export async function adminPatchChiTieuRow(
  year: number,
  month: number,
  lotId: number,
  patch: Record<string, unknown>,
): Promise<{ futureMonthsCount: number }> {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "sl-dt", "admin");

  const curData: Record<string, Prisma.Decimal | null> = {};
  const prevData: Record<string, Prisma.Decimal | null> = {};

  for (const k of Object.keys(patch)) {
    if (CUR_NUM_FIELDS.has(k)) {
      curData[k] = D(toN(patch[k]));
    } else if (PREV_NUM_FIELDS.has(k)) {
      prevData[PREV_TO_DB_FIELD[k]] = D(toN(patch[k]));
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(curData).length > 0) {
      const existing = await tx.slDtMonthlyInput.findUnique({
        where: { lotId_year_month: { lotId, year, month } },
      });
      if (existing) {
        await tx.slDtMonthlyInput.update({ where: { id: existing.id }, data: curData });
      } else {
        await tx.slDtMonthlyInput.create({
          data: {
            lotId, year, month,
            slKeHoachKy: curData.slKeHoachKy ?? new Prisma.Decimal(0),
            slThucKyTho: curData.slThucKyTho ?? new Prisma.Decimal(0),
            slLuyKeTho: new Prisma.Decimal(0),
            slTrat: curData.slTrat ?? new Prisma.Decimal(0),
            dtKeHoachKy: curData.dtKeHoachKy ?? new Prisma.Decimal(0),
            dtThoKy: curData.dtThoKy ?? new Prisma.Decimal(0),
            dtThoLuyKe: new Prisma.Decimal(0),
            qtTratChua: new Prisma.Decimal(0),
            dtTratKy: curData.dtTratKy ?? new Prisma.Decimal(0),
            dtTratLuyKe: new Prisma.Decimal(0),
            estimateValue: curData.estimateValue ?? null,
            contractValue: null,
          },
        });
      }
    }

    if (Object.keys(prevData).length > 0) {
      const p = prevMonthRef({ year, month });
      const existing = await tx.slDtMonthlyInput.findUnique({
        where: { lotId_year_month: { lotId, year: p.year, month: p.month } },
      });
      if (existing) {
        await tx.slDtMonthlyInput.update({ where: { id: existing.id }, data: prevData });
      } else {
        await tx.slDtMonthlyInput.create({
          data: {
            lotId, year: p.year, month: p.month,
            slKeHoachKy: new Prisma.Decimal(0),
            slThucKyTho: new Prisma.Decimal(0),
            slLuyKeTho: prevData.slLuyKeTho ?? new Prisma.Decimal(0),
            slTrat: new Prisma.Decimal(0),
            dtKeHoachKy: new Prisma.Decimal(0),
            dtThoKy: new Prisma.Decimal(0),
            dtThoLuyKe: prevData.dtThoLuyKe ?? new Prisma.Decimal(0),
            qtTratChua: new Prisma.Decimal(0),
            dtTratKy: new Prisma.Decimal(0),
            dtTratLuyKe: new Prisma.Decimal(0),
            estimateValue: null,
            contractValue: null,
          },
        });
      }
    }

    // Always recompute lũy kế for current month after any kỳ/prev edit.
    await recomputeLuyKeForRow(tx, lotId, year, month);
    await refreshAutoTarget(tx, lotId, year, month);
  });

  // Detect future months affected — caller asks user before cascading.
  const futures = await findFutureMonths(prisma, lotId, year, month);

  revalidatePath("/sl-dt/chi-tieu");
  revalidatePath("/sl-dt/nhap-thang-moi");
  revalidatePath("/sl-dt/bao-cao-sl");
  revalidatePath("/sl-dt/bao-cao-dt");

  return { futureMonthsCount: futures.length };
}

/**
 * Admin-only: cascade recompute lũy kế for all months > (year, month) of a lot.
 * Walks forward in chronological order; each step uses prev's freshly-updated lũy kế.
 * Also refreshes auto-target for each cascaded month.
 */
export async function cascadeRecomputeLuyKe(
  lotId: number,
  year: number,
  month: number,
): Promise<{ cascaded: number }> {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "sl-dt", "admin");

  const cascaded = await prisma.$transaction(async (tx) => {
    return cascadeFutureMonths(tx, lotId, year, month);
  });

  revalidatePath("/sl-dt/chi-tieu");
  revalidatePath("/sl-dt/nhap-thang-moi");
  revalidatePath("/sl-dt/bao-cao-sl");
  revalidatePath("/sl-dt/bao-cao-dt");

  return { cascaded };
}

export async function calculateMonthlyTargets(
  year: number,
  month: number,
): Promise<{ updated: number; skipped: number }> {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "sl-dt", "admin");

  const reportRows = (await getChiTieuReport(year, month)).filter((r) => r.kind === "lot" && r.lotId != null);
  const lots = await prisma.slDtLot.findMany({
    where: { id: { in: reportRows.map((r) => r.lotId!) } },
    include: { paymentPlan: true },
  });
  const planByLotId = new Map(lots.map((lot) => [lot.id, lot.paymentPlan]));

  let updated = 0;
  let skipped = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of reportRows) {
      const plan = planByLotId.get(row.lotId!);
      if (!plan) {
        skipped += 1;
        continue;
      }
      const targetMilestone = row.targetMilestone ?? row.suggestedTarget;
      const suggestion = suggestMonthlySlDtTargets({
        estimateValue: row.estimateValue,
        slStartCumulative: row.prevSlLuyKeTho,
        dtStartCumulative: row.prevDtThoLuyKe,
        targetMilestone,
        hoSoQuyetToan: row.hoSoQuyetToan,
        plan: {
          dot1Amount: toN(plan.dot1Amount), dot1Milestone: plan.dot1Milestone,
          dot2Amount: toN(plan.dot2Amount), dot2Milestone: plan.dot2Milestone,
          dot3Amount: toN(plan.dot3Amount), dot3Milestone: plan.dot3Milestone,
          dot4Amount: toN(plan.dot4Amount), dot4Milestone: plan.dot4Milestone,
        },
      });
      if (suggestion.reasonCode === "target_not_in_plan") {
        skipped += 1;
        continue;
      }
      const existing = await tx.slDtMonthlyInput.findUnique({
        where: { lotId_year_month: { lotId: row.lotId!, year, month } },
      });
      const data = {
        slKeHoachKy: new Prisma.Decimal(suggestion.slTargetKy),
        dtKeHoachKy: new Prisma.Decimal(suggestion.dtTargetKy),
      };
      if (existing) {
        await tx.slDtMonthlyInput.update({ where: { id: existing.id }, data });
      } else {
        await tx.slDtMonthlyInput.create({
          data: {
            lotId: row.lotId!, year, month,
            ...data,
            slThucKyTho: new Prisma.Decimal(0),
            slLuyKeTho: new Prisma.Decimal(row.prevSlLuyKeTho),
            slTrat: new Prisma.Decimal(0),
            dtThoKy: new Prisma.Decimal(0),
            dtThoLuyKe: new Prisma.Decimal(row.prevDtThoLuyKe),
            qtTratChua: new Prisma.Decimal(0),
            dtTratKy: new Prisma.Decimal(0),
            dtTratLuyKe: new Prisma.Decimal(0),
            estimateValue: null,
            contractValue: null,
          },
        });
      }
      updated += 1;
    }
  });

  revalidatePath("/sl-dt/chi-tieu");
  revalidatePath("/sl-dt/bao-cao-sl");
  revalidatePath("/sl-dt/bao-cao-dt");
  return { updated, skipped };
}

/**
 * Admin-only: override subtotal label (Danh mục) on group/phase/grand rows.
 * scope: "grand" | "phase" | "group"
 * key: "_" for grand, phaseCode for phase, "phaseCode/groupCode" for group
 * Empty label removes the override (revert to auto-generated default).
 */
export async function setSubtotalLabel(
  scope: "grand" | "phase" | "group",
  key: string,
  label: string,
): Promise<void> {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "sl-dt", "admin");
  const trimmed = label.trim();
  const existing = await prisma.slDtSubtotalLabel.findUnique({
    where: { scope_key: { scope, key } },
  });
  if (trimmed === "") {
    if (existing) {
      await prisma.slDtSubtotalLabel.delete({ where: { id: existing.id } });
    }
  } else if (existing) {
    await prisma.slDtSubtotalLabel.update({
      where: { id: existing.id },
      data: { label: trimmed },
    });
  } else {
    await prisma.slDtSubtotalLabel.create({
      data: { scope, key, label: trimmed },
    });
  }
  revalidatePath("/sl-dt/chi-tieu");
}

/**
 * Save progress status (milestoneText, targetMilestone, settlement, ghi chú, tiến độ XD).
 * - targetMilestone === null → user wants AUTO. We persist null then call refreshAutoTarget,
 *   which fills in the suggestion (option ii: result visible immediately on next read).
 * - targetMilestone non-null → user override; preserved as-is.
 */
export async function updateProgressStatus(
  input: ProgressStatusInput,
): Promise<{ resolvedTargetMilestone: string | null; futureMonthsCount: number }> {
  const data = progressStatusSchema.parse(input);
  const fields: Partial<Omit<ProgressStatusInput, "lotId" | "year" | "month">> = {};
  const progressKeys = [
    "milestoneText",
    "targetMilestone",
    "settlementStatus",
    "khungBtct",
    "xayTuong",
    "tratNgoai",
    "xayTho",
    "tratHoanThien",
    "hoSoQuyetToan",
    "ghiChu",
  ] as const;

  for (const key of progressKeys) {
    if (key in data) fields[key] = data[key] ?? null;
  }

  const resolved = await prisma.$transaction(async (tx) => {
    const existing = await tx.slDtProgressStatus.findUnique({
      where: { lotId_year_month: { lotId: data.lotId, year: data.year, month: data.month } },
    });
    if (existing) {
      await tx.slDtProgressStatus.update({
        where: { id: existing.id },
        data: { ...fields, updatedAt: new Date() },
      });
    } else {
      await tx.slDtProgressStatus.create({
        data: { lotId: data.lotId, year: data.year, month: data.month, ...fields },
      });
    }

    // milestoneText (Tiến độ thực tế) drives dtCanThucHien — no lũy kế impact, but
    // targetMilestone === null means "user wants auto" → fill from current DT lũy kế.
    if ("targetMilestone" in fields && fields.targetMilestone == null) {
      await refreshAutoTarget(tx, data.lotId, data.year, data.month);
    }

    const final = await tx.slDtProgressStatus.findUnique({
      where: { lotId_year_month: { lotId: data.lotId, year: data.year, month: data.month } },
      select: { targetMilestone: true },
    });
    return final?.targetMilestone ?? null;
  });

  // milestoneText edits don't change lũy kế, but if downstream months exist we surface
  // the count so the client could optionally cascade other dependencies later.
  const futures = await findFutureMonths(prisma, data.lotId, data.year, data.month);

  revalidatePath("/sl-dt/chi-tieu");
  revalidatePath("/sl-dt/tien-do-xd");

  return { resolvedTargetMilestone: resolved, futureMonthsCount: futures.length };
}
