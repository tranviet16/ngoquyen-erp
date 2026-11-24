"use server";

/**
 * Bảng đối chiếu công nợ theo cặp NCC × công trình (phép tính ở reconciliation-compute.ts).
 * Ký → đông cứng snapshot (4 cột số + JSONB); gỡ ký chỉ xét kỳ sau của cùng cặp.
 * Marker kỳ chuyển đổi (importRunId khác NULL) không gỡ ký được — chỉ hoàn tác import.
 */

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { periodLabel } from "./period";
import { addDays, monthlySlices } from "./period-bounds";
import { requireProjectId } from "./pair-scope";
import {
  assertPeriodBounds,
  CUTOVER_MARKER_LOCKED_MESSAGE,
  isCutoverMarker,
  lockSuppliers,
} from "./period-lock";
import {
  computeReconciliation,
  freezeReconciliationSnapshot,
  headerNames,
  type ReconComputed,
  type ReconSnapshot,
} from "./reconciliation-compute";

export type {
  ReconComputed,
  ReconDetailRow,
  ReconPaymentRow,
  ReconSubtotal,
  ReconTaxRow,
} from "./reconciliation-compute";

export interface ReconView extends ReconComputed {
  id: number;
  supplierId: number;
  projectId: number;
  supplierName: string;
  supplierTaxCode: string | null;
  supplierAddress: string | null;
  periodFrom: string;
  periodTo: string;
  periodLabel: string;
  entityNames: string[];
  projectNames: string[];
  signedBySupplier: boolean;
  signedDate: string | null;
  note: string | null;
  fromSnapshot: boolean;
  /** Marker kỳ chuyển đổi từ Excel — không gỡ ký/sửa/xoá được. */
  cutoverMarker: boolean;
  /**
   * Đang xem MỘT THÁNG (27→26) của kỳ dài hơn một tháng (vd. kỳ chuyển đổi 01/01 – 26/10): nhãn kỳ
   * gốc. null khi xem nguyên kỳ.
   */
  parentPeriodLabel: string | null;
}

export interface ReconListItem {
  id: number;
  projectId: number;
  /** Tháng hiển thị (27→26; kỳ lẻ đầu tiên có thể ngắn hơn). */
  periodFrom: string;
  periodTo: string;
  /** Dòng là một tháng của kỳ dài hơn một tháng — mở bảng đối chiếu của riêng tháng đó. */
  monthOfLongerPeriod: boolean;
  /** Tháng cuối của kỳ (nơi đặt thao tác Xoá / Gỡ ký của cả kỳ). */
  lastMonthOfPeriod: boolean;
  opening: number;
  totalIn: number;
  totalPaid: number;
  closing: number;
  /** Thuế hoá đơn + điều chỉnh: closing − opening − totalIn + totalPaid. */
  otherAmount: number;
  signedBySupplier: boolean;
  signedDate: string | null;
  note: string | null;
  cutoverMarker: boolean;
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];
const num = (v: Prisma.Decimal | number | string | null | undefined) => (v == null ? 0 : Number(v));

function assertSupplierId(supplierId: unknown): asserts supplierId is number {
  if (typeof supplierId !== "number" || !Number.isInteger(supplierId) || supplierId <= 0) {
    throw new Error("Mã NCC không hợp lệ");
  }
}

async function loadRecon(id: number) {
  const recon = await prisma.supplierReconciliation.findFirst({
    where: { id, deletedAt: null },
  });
  if (!recon) throw new Error(`Kỳ đối chiếu #${id} không tồn tại`);
  return recon;
}

/** Chi tiết bảng đối chiếu: kỳ đã ký đọc snapshot đông cứng, kỳ chưa ký tính động theo cặp. */
export async function getReconciliationView(id: number): Promise<ReconView> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const recon = await loadRecon(id);
  const supplier = await prisma.supplier.findFirst({
    where: { id: recon.supplierId },
    select: { name: true, taxCode: true, address: true },
  });

  const fromSnapshot = recon.signedBySupplier && recon.signedSnapshotJson != null;
  // Snapshot ký trước khi có thuế hoá đơn / tên tiêu đề có thể thiếu vài trường.
  const snapshot = fromSnapshot
    ? (recon.signedSnapshotJson as unknown as ReconComputed & Partial<Pick<ReconSnapshot, "entityNames" | "projectNames">>)
    : null;
  const computed: ReconComputed =
    snapshot ?? (await computeReconciliation(recon.supplierId, recon.projectId, recon.periodFrom, recon.periodTo));

  let entityNames: string[] = [];
  let projectNames: string[] = [];
  if (snapshot?.entityNames) {
    entityNames = snapshot.entityNames;
    projectNames = snapshot.projectNames ?? [];
  } else {
    ({ entityNames, projectNames } = await headerNames(
      recon.supplierId,
      recon.projectId,
      recon.periodFrom,
      recon.periodTo,
    ));
  }

  return {
    ...computed,
    // Snapshot ký trước khi có thuế hoá đơn không chứa hai trường này.
    taxRows: computed.taxRows ?? [],
    totalTax: computed.totalTax ?? 0,
    id: recon.id,
    supplierId: recon.supplierId,
    projectId: recon.projectId,
    supplierName: supplier?.name ?? `NCC #${recon.supplierId}`,
    supplierTaxCode: supplier?.taxCode ?? null,
    supplierAddress: supplier?.address ?? null,
    periodFrom: isoDate(recon.periodFrom),
    periodTo: isoDate(recon.periodTo),
    periodLabel: periodLabel(recon.periodFrom, recon.periodTo),
    entityNames,
    projectNames,
    signedBySupplier: recon.signedBySupplier,
    signedDate: recon.signedDate ? isoDate(recon.signedDate) : null,
    note: recon.note,
    fromSnapshot,
    cutoverMarker: isCutoverMarker(recon),
    parentPeriodLabel: null,
  };
}

/**
 * Bảng đối chiếu của MỘT THÁNG thuộc kỳ dài hơn một tháng (vd. kỳ chuyển đổi 01/01 – 26/10): số tính
 * từ sổ cho đúng tháng đó (chỉ xem / in; trạng thái ký là của kỳ gốc). `from`/`to` phải đúng một
 * tháng trong `monthlySlices` của kỳ.
 */
export async function getReconciliationMonthView(id: number, from: string, to: string): Promise<ReconView> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const recon = await loadRecon(id);
  const month = monthlySlices(recon.periodFrom, recon.periodTo).find(
    (m) => isoDate(m.from) === from && isoDate(m.to) === to,
  );
  if (!month) throw new Error(`Tháng ${from} – ${to} không thuộc kỳ đối chiếu #${id}`);
  const [supplier, computed, names] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: recon.supplierId }, select: { name: true, taxCode: true, address: true } }),
    computeReconciliation(recon.supplierId, recon.projectId, month.from, month.to),
    headerNames(recon.supplierId, recon.projectId, month.from, month.to),
  ]);
  return {
    ...computed,
    taxRows: computed.taxRows ?? [],
    totalTax: computed.totalTax ?? 0,
    id: recon.id,
    supplierId: recon.supplierId,
    projectId: recon.projectId,
    supplierName: supplier?.name ?? `NCC #${recon.supplierId}`,
    supplierTaxCode: supplier?.taxCode ?? null,
    supplierAddress: supplier?.address ?? null,
    periodFrom: isoDate(month.from),
    periodTo: isoDate(month.to),
    periodLabel: periodLabel(month.from, month.to),
    entityNames: names.entityNames,
    projectNames: names.projectNames,
    signedBySupplier: recon.signedBySupplier,
    signedDate: recon.signedDate ? isoDate(recon.signedDate) : null,
    note: recon.note,
    fromSnapshot: false,
    cutoverMarker: isCutoverMarker(recon),
    parentPeriodLabel: periodLabel(recon.periodFrom, recon.periodTo),
  };
}

const isEmptyRow = (r: Pick<ReconListItem, "opening" | "totalIn" | "totalPaid" | "otherAmount" | "closing">) =>
  r.opening === 0 && r.totalIn === 0 && r.totalPaid === 0 && r.otherAmount === 0 && r.closing === 0;

/**
 * Danh sách kỳ của cặp, luôn theo tháng 27→26: kỳ đúng một tháng đọc như cũ (đã ký → cột snapshot,
 * chưa ký → tính động); kỳ dài hơn (kỳ chuyển đổi, kỳ cũ gộp tháng) tách thành từng tháng, số tính từ
 * sổ cho từng tháng (cùng sổ nên tháng cuối khớp số cuối kỳ). Bỏ các tháng trống trước tháng đầu tiên
 * có phát sinh. Mới nhất trước.
 */
export async function listReconciliationsDerived(supplierId: number, projectId: number): Promise<ReconListItem[]> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  assertSupplierId(supplierId);
  const pid = requireProjectId(projectId);
  const recons = await prisma.supplierReconciliation.findMany({
    where: { supplierId, projectId: pid, deletedAt: null },
    orderBy: { periodFrom: "asc" },
  });
  const perMarker = await Promise.all(
    recons.map(async (r): Promise<ReconListItem[]> => {
      const base = {
        id: r.id,
        projectId: r.projectId,
        note: r.note,
        cutoverMarker: isCutoverMarker(r),
        signedBySupplier: r.signedBySupplier,
        signedDate: r.signedDate ? isoDate(r.signedDate) : null,
      };
      const months = monthlySlices(r.periodFrom, r.periodTo);
      if (months.length === 1) {
        const whole = { ...base, periodFrom: isoDate(r.periodFrom), periodTo: isoDate(r.periodTo), monthOfLongerPeriod: false, lastMonthOfPeriod: true };
        if (r.signedBySupplier && r.openingBalance != null) {
          return [{
            ...whole,
            opening: num(r.openingBalance),
            totalIn: num(r.totalIn),
            totalPaid: num(r.totalPaid),
            closing: num(r.closingBalance),
            otherAmount: otherAmountOf(num(r.closingBalance), num(r.openingBalance), num(r.totalIn), num(r.totalPaid)),
          }];
        }
        const c = await computeReconciliation(supplierId, pid, r.periodFrom, r.periodTo);
        return [{ ...whole, signedBySupplier: false, signedDate: null, ...amountsOf(c) }];
      }
      return Promise.all(
        months.map(async (m, i) => ({
          ...base,
          periodFrom: isoDate(m.from),
          periodTo: isoDate(m.to),
          monthOfLongerPeriod: true,
          lastMonthOfPeriod: i === months.length - 1,
          ...amountsOf(await computeReconciliation(supplierId, pid, m.from, m.to)),
        })),
      );
    }),
  );
  const rows = perMarker.flat();
  const firstActive = rows.findIndex((row) => !isEmptyRow(row));
  return (firstActive < 0 ? [] : rows.slice(firstActive)).reverse();
}

/** Thuế/ĐC suy ra bằng phép trừ số thực — làm tròn tới đồng và bỏ "-0". */
const otherAmountOf = (closing: number, opening: number, totalIn: number, totalPaid: number) =>
  Math.round(closing - opening - totalIn + totalPaid) || 0;

function amountsOf(c: ReconComputed) {
  return {
    opening: c.opening,
    totalIn: c.totalIn,
    totalPaid: c.totalPaid,
    closing: c.closing,
    otherAmount: otherAmountOf(c.closing, c.opening, c.totalIn, c.totalPaid),
  };
}

/** NCC ký xác nhận: đông cứng số + dòng chi tiết của cặp, khóa mọi ghi mới trong kỳ của cặp. */
export async function signReconciliation(id: number) {
  const actor = await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const recon = await loadRecon(id);

  await prisma.$transaction(async (tx) => {
    // Khoá NCC (cùng khoá với chốt kỳ, phiếu ngày, sổ cái vật tư, đợt thanh toán): mọi ghi
    // đồng thời hoặc xong trước và nằm trong snapshot, hoặc chờ rồi bị khoá kỳ từ chối.
    // Re-check cờ ký trong transaction để chặn 2 lần ký đồng thời.
    await lockSuppliers(tx, [recon.supplierId]);
    const current = await tx.supplierReconciliation.findFirst({
      where: { id, deletedAt: null },
      select: { signedBySupplier: true, periodFrom: true, periodTo: true, projectId: true },
    });
    if (!current) throw new Error(`Kỳ đối chiếu #${id} không tồn tại`);
    if (current.signedBySupplier) throw new Error("Kỳ này đã được ký.");
    const from = toBusinessDateUtc(current.periodFrom);
    const to = toBusinessDateUtc(current.periodTo);
    const label = periodLabel(from, to);

    // Ký marker đã có: không bắt chuẩn tháng (marker cũ lệch tháng vẫn ký được); kỳ mới / sửa kỳ mới bắt.
    await assertPeriodBounds(recon.supplierId, current.projectId, { from, to }, tx, id, { requireMonthly: false });

    // Ký sẽ khoá vĩnh viễn ngày trong kỳ của cặp — phiếu của cặp chưa có phát sinh trong sổ cái
    // lúc này sẽ không bao giờ vào sổ được nữa, nên bắt buộc chốt đủ.
    const missingWhere = {
      supplierId: recon.supplierId,
      projectId: current.projectId,
      deletedAt: null,
      date: { gte: from, lt: addDays(to, 1) },
      ledgerTransactions: { none: { deletedAt: null } },
    };
    const [missingCount, missingSample] = await Promise.all([
      tx.supplierDeliveryDaily.count({ where: missingWhere }),
      tx.supplierDeliveryDaily.findMany({
        where: missingWhere,
        orderBy: [{ date: "asc" }, { id: "asc" }],
        take: 10,
        select: { id: true, date: true },
      }),
    ]);
    if (missingCount > 0) {
      const detail = missingSample.map((d) => `#${d.id} (${isoDate(d.date)})`).join(", ");
      throw new Error(
        `Không thể ký kỳ ${label}: ${missingCount} phiếu trong kỳ chưa được chốt vào sổ cái — ${detail}. ` +
          `Chốt lại kỳ trước khi ký.`,
      );
    }

    await freezeReconciliationSnapshot(tx, id, { auditUserId: actor?.userId ?? null });
  }, { timeout: 60_000, maxWait: 10_000 }); // đọc snapshot toàn kỳ dưới khoá NCC — vượt mặc định 5s
  revalidatePath(`/vat-tu-ncc/${recon.supplierId}/doi-chieu`);
}

/**
 * Gỡ ký (admin): chỉ cho gỡ kỳ ký MỚI NHẤT của cặp — nếu kỳ sau của cùng cặp đã ký thì phải
 * gỡ từ kỳ mới nhất về, bảo toàn chuỗi carry-over closing(k) = opening(k+1).
 * Marker kỳ chuyển đổi không gỡ được.
 */
export async function unsignReconciliation(id: number) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  await requireActiveAdmin();
  const recon = await loadRecon(id);
  if (isCutoverMarker(recon)) throw new Error(CUTOVER_MARKER_LOCKED_MESSAGE);
  if (!recon.signedBySupplier) throw new Error("Kỳ này chưa ký.");

  await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [recon.supplierId]);
    const current = await tx.supplierReconciliation.findFirst({
      where: { id, deletedAt: null },
      select: { signedBySupplier: true, importRunId: true, projectId: true, periodFrom: true },
    });
    if (!current?.signedBySupplier) throw new Error("Kỳ này chưa ký.");
    if (isCutoverMarker(current)) throw new Error(CUTOVER_MARKER_LOCKED_MESSAGE);
    const laterSigned = await tx.supplierReconciliation.findFirst({
      where: {
        supplierId: recon.supplierId,
        projectId: current.projectId,
        signedBySupplier: true,
        deletedAt: null,
        periodFrom: { gt: current.periodFrom },
      },
      select: { periodFrom: true, periodTo: true },
    });
    if (laterSigned) {
      throw new Error(
        `Không thể gỡ ký: kỳ sau (${periodLabel(laterSigned.periodFrom, laterSigned.periodTo)}) đã ký. Gỡ từ kỳ mới nhất trước.`,
      );
    }

    await tx.supplierReconciliation.update({
      where: { id },
      data: {
        openingBalance: null,
        totalIn: null,
        totalPaid: null,
        closingBalance: null,
        signedBySupplier: false,
        signedDate: null,
        signedSnapshotJson: Prisma.DbNull,
        updatedAt: new Date(),
      },
    });
  });
  revalidatePath(`/vat-tu-ncc/${recon.supplierId}/doi-chieu`);
}
