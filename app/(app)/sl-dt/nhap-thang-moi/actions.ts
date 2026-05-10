"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import type { MonthRef } from "./helpers";
import { prevMonth } from "./helpers";
import { refreshAutoTarget } from "@/lib/sl-dt/recompute";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

const NUM_INPUT_FIELDS = new Set([
  "slKeHoachKy", "slThucKyTho", "slTrat", "estimateValue",
  "dtKeHoachKy", "dtThoKy", "qtTratChua", "dtTratKy", "contractValue",
]);
const PROGRESS_FIELDS = new Set([
  "milestoneText", "targetMilestone", "settlementStatus", "ghiChu",
  "khungBtct", "xayTuong", "tratNgoai", "xayTho", "tratHoanThien", "hoSoQuyetToan",
]);

const D = (n: number | null | undefined): Prisma.Decimal | null =>
  n == null ? null : new Prisma.Decimal(n);
const toN = (v: unknown): number => (v == null || v === "" ? 0 : Number(v));

function revalidateMonthly() {
  revalidatePath(`/sl-dt/nhap-thang-moi`);
  revalidatePath(`/sl-dt/bao-cao-sl`);
  revalidatePath(`/sl-dt/bao-cao-dt`);
  revalidatePath(`/sl-dt/chi-tieu`);
  revalidatePath(`/sl-dt/tien-do-xd`);
}

async function getPrevLuyKe(lotId: number, year: number, month: number) {
  const p = prevMonth({ year, month });
  const prev = await prisma.slDtMonthlyInput.findUnique({
    where: { lotId_year_month: { lotId, year: p.year, month: p.month } },
  });
  return {
    prevSlLuyKeTho: Number(prev?.slLuyKeTho ?? 0),
    prevDtThoLuyKe: Number(prev?.dtThoLuyKe ?? 0),
    prevDtTratLuyKe: Number(prev?.dtTratLuyKe ?? 0),
  };
}

export async function patchMonthlyInputCell(
  year: number, month: number, lotId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const inputPatch: Record<string, Prisma.Decimal | null> = {};
  for (const k of Object.keys(patch)) {
    if (NUM_INPUT_FIELDS.has(k)) {
      inputPatch[k] = D(toN(patch[k]));
    }
  }
  if (Object.keys(inputPatch).length === 0) return;

  const existing = await prisma.slDtMonthlyInput.findUnique({
    where: { lotId_year_month: { lotId, year, month } },
  });

  // Recompute luỹ kế if kỳ values touched
  const cur = {
    slThucKyTho: Number(existing?.slThucKyTho ?? 0),
    dtThoKy: Number(existing?.dtThoKy ?? 0),
    dtTratKy: Number(existing?.dtTratKy ?? 0),
  };
  if ("slThucKyTho" in patch) cur.slThucKyTho = toN(patch.slThucKyTho);
  if ("dtThoKy" in patch) cur.dtThoKy = toN(patch.dtThoKy);
  if ("dtTratKy" in patch) cur.dtTratKy = toN(patch.dtTratKy);

  const { prevSlLuyKeTho, prevDtThoLuyKe, prevDtTratLuyKe } =
    await getPrevLuyKe(lotId, year, month);
  inputPatch.slLuyKeTho = D(prevSlLuyKeTho + cur.slThucKyTho);
  inputPatch.dtThoLuyKe = D(prevDtThoLuyKe + cur.dtThoKy);
  inputPatch.dtTratLuyKe = D(prevDtTratLuyKe + cur.dtTratKy);

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.slDtMonthlyInput.update({ where: { id: existing.id }, data: inputPatch });
    } else {
      await tx.slDtMonthlyInput.create({
        data: {
          lotId, year, month,
          slKeHoachKy: inputPatch.slKeHoachKy ?? new Prisma.Decimal(0),
          slThucKyTho: inputPatch.slThucKyTho ?? new Prisma.Decimal(0),
          slLuyKeTho: inputPatch.slLuyKeTho!,
          slTrat: inputPatch.slTrat ?? new Prisma.Decimal(0),
          dtKeHoachKy: inputPatch.dtKeHoachKy ?? new Prisma.Decimal(0),
          dtThoKy: inputPatch.dtThoKy ?? new Prisma.Decimal(0),
          dtThoLuyKe: inputPatch.dtThoLuyKe!,
          qtTratChua: inputPatch.qtTratChua ?? new Prisma.Decimal(0),
          dtTratKy: inputPatch.dtTratKy ?? new Prisma.Decimal(0),
          dtTratLuyKe: inputPatch.dtTratLuyKe!,
          estimateValue: inputPatch.estimateValue ?? null,
          contractValue: inputPatch.contractValue ?? null,
        },
      });
    }
    await refreshAutoTarget(tx, lotId, year, month);
  });
  revalidateMonthly();
}

/**
 * Admin-only raw patch — overrides on persisted monthly_input fields with NO recompute.
 * Allows admin to manually fix slLuyKeTho/dtThoLuyKe/dtTratLuyKe and other raw fields.
 */
const ADMIN_RAW_INPUT_FIELDS = new Set([
  ...NUM_INPUT_FIELDS,
  "slLuyKeTho",
  "dtThoLuyKe",
  "dtTratLuyKe",
]);

export async function adminPatchMonthlyInputCell(
  year: number, month: number, lotId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const data: Record<string, Prisma.Decimal | null> = {};
  for (const k of Object.keys(patch)) {
    if (ADMIN_RAW_INPUT_FIELDS.has(k)) {
      data[k] = D(toN(patch[k]));
    }
  }
  if (Object.keys(data).length === 0) return;

  const existing = await prisma.slDtMonthlyInput.findUnique({
    where: { lotId_year_month: { lotId, year, month } },
  });
  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.slDtMonthlyInput.update({ where: { id: existing.id }, data });
    } else {
      await tx.slDtMonthlyInput.create({
        data: {
          lotId, year, month,
          slKeHoachKy: data.slKeHoachKy ?? new Prisma.Decimal(0),
          slThucKyTho: data.slThucKyTho ?? new Prisma.Decimal(0),
          slLuyKeTho: data.slLuyKeTho ?? new Prisma.Decimal(0),
          slTrat: data.slTrat ?? new Prisma.Decimal(0),
          dtKeHoachKy: data.dtKeHoachKy ?? new Prisma.Decimal(0),
          dtThoKy: data.dtThoKy ?? new Prisma.Decimal(0),
          dtThoLuyKe: data.dtThoLuyKe ?? new Prisma.Decimal(0),
          qtTratChua: data.qtTratChua ?? new Prisma.Decimal(0),
          dtTratKy: data.dtTratKy ?? new Prisma.Decimal(0),
          dtTratLuyKe: data.dtTratLuyKe ?? new Prisma.Decimal(0),
          estimateValue: data.estimateValue ?? null,
          contractValue: data.contractValue ?? null,
        },
      });
    }
    await refreshAutoTarget(tx, lotId, year, month);
  });
  revalidateMonthly();
}

export async function patchProgressStatusCell(
  year: number, month: number, lotId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const data: Record<string, string | null> = {};
  for (const k of Object.keys(patch)) {
    if (PROGRESS_FIELDS.has(k)) {
      const v = patch[k];
      data[k] = v == null || v === "" ? null : String(v);
    }
  }
  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.slDtProgressStatus.findUnique({
      where: { lotId_year_month: { lotId, year, month } },
    });
    if (existing) {
      await tx.slDtProgressStatus.update({ where: { id: existing.id }, data });
    } else {
      await tx.slDtProgressStatus.create({
        data: {
          lotId, year, month,
          milestoneText: data.milestoneText ?? null,
          targetMilestone: data.targetMilestone ?? null,
          settlementStatus: data.settlementStatus ?? null,
          ghiChu: data.ghiChu ?? null,
          khungBtct: data.khungBtct ?? null,
          xayTuong: data.xayTuong ?? null,
          tratNgoai: data.tratNgoai ?? null,
          xayTho: data.xayTho ?? null,
          tratHoanThien: data.tratHoanThien ?? null,
          hoSoQuyetToan: data.hoSoQuyetToan ?? null,
        },
      });
    }
    // If user cleared targetMilestone (set to null), recompute auto suggestion.
    if ("targetMilestone" in data && data.targetMilestone == null) {
      await refreshAutoTarget(tx, lotId, year, month);
    }
  });
  revalidateMonthly();
}

export async function patchLotCell(
  lotId: number, patch: Record<string, unknown>,
): Promise<void> {
  const data: Record<string, Prisma.Decimal | null> = {};
  if ("estimateValue" in patch) data.estimateValue = D(toN(patch.estimateValue));
  if ("contractValue" in patch) data.contractValue = D(toN(patch.contractValue));
  if (Object.keys(data).length === 0) return;
  await prisma.slDtLot.update({ where: { id: lotId }, data });
  revalidateMonthly();
}


/**
 * Find the most recent (year, month) strictly before target that has any monthly_input rows.
 */
async function findLatestMonthBefore(target: MonthRef): Promise<MonthRef | null> {
  const rows = await prisma.slDtMonthlyInput.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  for (const r of rows) {
    if (r.year < target.year || (r.year === target.year && r.month < target.month)) {
      return { year: r.year, month: r.month };
    }
  }
  return null;
}

/**
 * Clone all 64-ish lots' monthly_inputs + progress_statuses from previous month.
 * - Static: estimateValue, contractValue, qtTratChua, slTrat → carry over.
 * - Kỳ resets to 0: slKeHoachKy, slThucKyTho, dtKeHoachKy, dtThoKy, dtTratKy.
 * - Luỹ kế: copies prev luỹ kế as baseline (sẽ tự cộng kỳ mới khi user nhập, ở client).
 * - Progress: copy 8 text cols nguyên trạng.
 * Idempotent: skip lots that already have row for (year, month).
 */
export async function cloneFromPreviousMonth(year: number, month: number): Promise<{
  cloned: number;
  source: MonthRef | null;
  message: string;
}> {
  const target = { year, month };
  const source = await findLatestMonthBefore(target);
  if (!source) {
    return { cloned: 0, source: null, message: "Không tìm thấy tháng nguồn để clone." };
  }

  const [prevInputs, prevProgress, lots, existing] = await Promise.all([
    prisma.slDtMonthlyInput.findMany({ where: { year: source.year, month: source.month } }),
    prisma.slDtProgressStatus.findMany({ where: { year: source.year, month: source.month } }),
    prisma.slDtLot.findMany({ where: { deletedAt: null } }),
    prisma.slDtMonthlyInput.findMany({
      where: { year, month },
      select: { lotId: true },
    }),
  ]);

  const existingLotIds = new Set(existing.map((e) => e.lotId));
  const prevInputByLot = new Map(prevInputs.map((p) => [p.lotId, p]));
  const prevProgressByLot = new Map(prevProgress.map((p) => [p.lotId, p]));

  let cloned = 0;
  await prisma.$transaction(async (tx) => {
    for (const lot of lots) {
      if (existingLotIds.has(lot.id)) continue;
      const pi = prevInputByLot.get(lot.id);
      const pp = prevProgressByLot.get(lot.id);

      await tx.slDtMonthlyInput.create({
        data: {
          lotId: lot.id,
          year,
          month,
          // Kỳ resets
          slKeHoachKy: 0,
          slThucKyTho: 0,
          dtKeHoachKy: 0,
          dtThoKy: 0,
          dtTratKy: 0,
          // Carry-over: trát luỹ kế (ít đổi), QT trát chưa, baselines
          slTrat: pi?.slTrat ?? 0,
          slLuyKeTho: pi?.slLuyKeTho ?? 0,
          dtThoLuyKe: pi?.dtThoLuyKe ?? 0,
          qtTratChua: pi?.qtTratChua ?? 0,
          dtTratLuyKe: pi?.dtTratLuyKe ?? 0,
          // Static
          estimateValue: pi?.estimateValue ?? lot.estimateValue,
          contractValue: pi?.contractValue ?? lot.contractValue,
        },
      });

      // Progress: copy 8 text cols if prev exists. Skip if a row already exists
      // for this lot/month (shouldn't happen since input was missing, but be safe).
      if (pp) {
        const existingProgress = await tx.slDtProgressStatus.findUnique({
          where: { lotId_year_month: { lotId: lot.id, year, month } },
          select: { id: true },
        });
        if (!existingProgress) {
          await tx.slDtProgressStatus.create({
            data: {
              lotId: lot.id,
              year,
              month,
              milestoneText: pp.milestoneText,
              // targetMilestone always starts null on clone → refreshAutoTarget below
              // recomputes the suggestion from the freshly-cloned lũy kế. Keeps the
              // "auto-first" invariant: previous month's override does not leak forward.
              targetMilestone: null,
              settlementStatus: pp.settlementStatus,
              ghiChu: pp.ghiChu,
              khungBtct: pp.khungBtct,
              xayTuong: pp.xayTuong,
              tratNgoai: pp.tratNgoai,
              xayTho: pp.xayTho,
              tratHoanThien: pp.tratHoanThien,
              hoSoQuyetToan: pp.hoSoQuyetToan,
            },
          });
        }
      }
      // Auto-target needs lũy kế to be present; clone copied prev's lũy kế as baseline,
      // so a suggestion can be computed even before any kỳ data is entered.
      await refreshAutoTarget(tx, lot.id, year, month);
      cloned++;
    }
  });

  revalidatePath(`/sl-dt/nhap-thang-moi`);
  revalidatePath(`/sl-dt/bao-cao-sl`);
  revalidatePath(`/sl-dt/bao-cao-dt`);
  revalidatePath(`/sl-dt/chi-tieu`);
  revalidatePath(`/sl-dt/tien-do-xd`);

  return {
    cloned,
    source,
    message: `Đã clone ${cloned} lô từ T${source.month}/${source.year}.`,
  };
}

export interface SaveMonthlyPayload {
  year: number;
  month: number;
  rows: Array<{
    lotId: number;
    // SL
    slKeHoachKy: number;
    slThucKyTho: number;
    slLuyKeTho: number;
    slTrat: number;
    estimateValue: number | null;
    // DT
    dtKeHoachKy: number;
    dtThoKy: number;
    dtThoLuyKe: number;
    qtTratChua: number;
    dtTratKy: number;
    dtTratLuyKe: number;
    contractValue: number | null;
    // Chỉ tiêu
    milestoneText: string | null;
    targetMilestone: string | null;
    settlementStatus: string | null;
    ghiChu: string | null;
    // Tiến độ XD
    khungBtct: string | null;
    xayTuong: string | null;
    tratNgoai: string | null;
    xayTho: string | null;
    tratHoanThien: string | null;
    hoSoQuyetToan: string | null;
  }>;
}

export async function saveMonthlyData(payload: SaveMonthlyPayload): Promise<{ saved: number }> {
  const { year, month, rows } = payload;
  if (year < 2000 || year > 2100) throw new Error("Năm không hợp lệ");
  if (month < 1 || month > 12) throw new Error("Tháng phải 1–12");
  if (!rows.length) return { saved: 0 };

  const D = (n: number | null) => (n == null ? null : new Prisma.Decimal(n));

  let saved = 0;
  await prisma.$transaction(async (tx) => {
    // Pre-fetch existing rows to decide create vs update without per-row roundtrip multiplications
    const lotIds = rows.map((r) => r.lotId);
    const [existingInputs, existingProgress] = await Promise.all([
      tx.slDtMonthlyInput.findMany({
        where: { year, month, lotId: { in: lotIds } },
        select: { id: true, lotId: true },
      }),
      tx.slDtProgressStatus.findMany({
        where: { year, month, lotId: { in: lotIds } },
        select: { id: true, lotId: true },
      }),
    ]);
    const inputIdByLot = new Map(existingInputs.map((e) => [e.lotId, e.id]));
    const progressIdByLot = new Map(existingProgress.map((e) => [e.lotId, e.id]));

    for (const r of rows) {
      const hasProgress =
        r.milestoneText || r.targetMilestone || r.settlementStatus || r.ghiChu ||
        r.khungBtct || r.xayTuong || r.tratNgoai ||
        r.xayTho || r.tratHoanThien || r.hoSoQuyetToan;

      const inputData = {
        slKeHoachKy: D(r.slKeHoachKy)!, slThucKyTho: D(r.slThucKyTho)!,
        slLuyKeTho: D(r.slLuyKeTho)!, slTrat: D(r.slTrat)!,
        dtKeHoachKy: D(r.dtKeHoachKy)!, dtThoKy: D(r.dtThoKy)!,
        dtThoLuyKe: D(r.dtThoLuyKe)!, qtTratChua: D(r.qtTratChua)!,
        dtTratKy: D(r.dtTratKy)!, dtTratLuyKe: D(r.dtTratLuyKe)!,
        estimateValue: D(r.estimateValue),
        contractValue: D(r.contractValue),
      };
      const existingInputId = inputIdByLot.get(r.lotId);
      if (existingInputId) {
        await tx.slDtMonthlyInput.update({ where: { id: existingInputId }, data: inputData });
      } else {
        await tx.slDtMonthlyInput.create({ data: { lotId: r.lotId, year, month, ...inputData } });
      }

      if (hasProgress) {
        const progressData = {
          milestoneText: r.milestoneText, targetMilestone: r.targetMilestone,
          settlementStatus: r.settlementStatus, ghiChu: r.ghiChu,
          khungBtct: r.khungBtct, xayTuong: r.xayTuong, tratNgoai: r.tratNgoai,
          xayTho: r.xayTho, tratHoanThien: r.tratHoanThien, hoSoQuyetToan: r.hoSoQuyetToan,
        };
        const existingProgressId = progressIdByLot.get(r.lotId);
        if (existingProgressId) {
          await tx.slDtProgressStatus.update({ where: { id: existingProgressId }, data: progressData });
        } else {
          await tx.slDtProgressStatus.create({ data: { lotId: r.lotId, year, month, ...progressData } });
        }
      }
      saved++;
    }
  });

  revalidatePath(`/sl-dt/nhap-thang-moi`);
  revalidatePath(`/sl-dt/bao-cao-sl`);
  revalidatePath(`/sl-dt/bao-cao-dt`);
  revalidatePath(`/sl-dt/chi-tieu`);
  revalidatePath(`/sl-dt/tien-do-xd`);

  return { saved };
}
