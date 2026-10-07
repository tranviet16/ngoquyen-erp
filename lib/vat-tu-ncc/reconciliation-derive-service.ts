"use server";

/**
 * Bảng đối chiếu công nợ NCC dẫn xuất từ sổ cái công nợ vật tư:
 *   A (dư mang sang) = số dư tất cả (Chủ Thể, công trình) của NCC tại periodFrom − 1
 *   B (cộng phát sinh) = Σ lay_hang trong kỳ (dòng chi tiết từ phiếu chốt kỳ)
 *   C (chuyển khoản)  = Σ thanh_toan trong kỳ
 *   D (thuế hoá đơn)  = Σ thue_hd trong kỳ (theo ngày ghi sổ; tách dòng riêng)
 *   Tổng nợ = A + B − C + D (± điều chỉnh trong kỳ)
 * `totalIn` chỉ gồm B (hàng); thuế lưu ở taxRows/totalTax trong snapshot JSON.
 * Ký → đông cứng snapshot (4 cột số + JSONB); closing kỳ k tự nhiên = opening kỳ k+1
 * vì cả hai cùng đọc một sổ cái tại hai mốc thời điểm.
 */

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { periodLabel } from "./period";
import { supplierBalanceAsOf } from "./supplier-balance";
import { addDays } from "./period-bounds";
import { assertPeriodBounds, lockSuppliers } from "./period-lock";

export interface ReconDetailRow {
  id: number;
  date: string;
  itemLabel: string;
  qty: number | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number;
  projectId: number | null;
  projectLabel: string;
  content: string | null;
}

export interface ReconPaymentRow {
  id: number;
  date: string;
  amount: number;
  content: string | null;
  projectLabel: string;
}

export interface ReconTaxRow {
  id: number;
  date: string;
  amount: number;
  invoiceNo: string | null;
  invoiceDate: string | null;
  content: string | null;
  projectLabel: string;
}

export interface ReconSubtotal {
  key: string;
  label: string;
  qty: number | null;
  amount: number;
}

export interface ReconComputed {
  opening: number;
  totalIn: number;
  totalPaid: number;
  totalAdjust: number;
  /** Σ thuế hoá đơn trong kỳ (không nằm trong totalIn). */
  totalTax: number;
  closing: number;
  layHangRows: ReconDetailRow[];
  taxRows: ReconTaxRow[];
  thanhToanRows: ReconPaymentRow[];
  adjustRows: ReconPaymentRow[];
  byProject: ReconSubtotal[];
  byItem: ReconSubtotal[];
}

export interface ReconView extends ReconComputed {
  id: number;
  supplierId: number;
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
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];
const num = (v: Prisma.Decimal | number | string | null | undefined) => (v == null ? 0 : Number(v));

// Cho phép chạy trong transaction (ký/gỡ ký cần lock + đọc nhất quán).
// Structural Pick thay vì Prisma.TransactionClient vì client đã $extends.
type DbClient = Pick<typeof prisma, "$queryRaw" | "ledgerTransaction" | "supplierReconciliation" | "item" | "project">;

async function computeReconciliation(
  supplierId: number,
  from: Date,
  to: Date,
  db: DbClient = prisma,
): Promise<ReconComputed> {
  const dayBefore = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const [opening, transactions] = await Promise.all([
    supplierBalanceAsOf(supplierId, dayBefore, db),
    db.ledgerTransaction.findMany({
      where: {
        ledgerType: "material",
        partyId: supplierId,
        deletedAt: null,
        date: { gte: from, lt: addDays(to, 1) },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);

  const itemIds = [...new Set(transactions.map((t) => t.itemId).filter((i): i is number => i != null))];
  const projectIds = [...new Set(transactions.map((t) => t.projectId).filter((p): p is number => p != null))];
  const [items, projects] = await Promise.all([
    itemIds.length
      ? db.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } })
      : Promise.resolve([]),
    projectIds.length
      ? db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, name: true } })
      : Promise.resolve([]),
  ]);
  const itemMap = new Map(items.map((i) => [i.id, `${i.code} - ${i.name}`]));
  const projectMap = new Map(projects.map((p) => [p.id, p.code]));

  const layHangRows: ReconDetailRow[] = [];
  const thanhToanRows: ReconPaymentRow[] = [];
  const adjustRows: ReconPaymentRow[] = [];
  const taxRows: ReconTaxRow[] = [];
  let totalTax = 0;
  let totalIn = 0;
  let totalPaid = 0;
  let totalAdjust = 0;

  for (const t of transactions) {
    const amount = num(t.totalTt);
    const projectLabel = t.projectId != null ? (projectMap.get(t.projectId) ?? String(t.projectId)) : "";
    if (t.transactionType === "lay_hang") {
      totalIn += amount;
      layHangRows.push({
        id: t.id,
        date: isoDate(t.date),
        itemLabel: t.itemId != null ? (itemMap.get(t.itemId) ?? String(t.itemId)) : (t.content ?? ""),
        qty: t.qty == null ? null : Number(t.qty),
        unit: null,
        unitPrice: t.unitPriceSnapshot == null ? null : Number(t.unitPriceSnapshot),
        amount,
        projectId: t.projectId,
        projectLabel,
        content: t.content,
      });
    } else if (t.transactionType === "thue_hd") {
      totalTax += amount;
      taxRows.push({
        id: t.id,
        date: isoDate(t.date),
        amount,
        invoiceNo: t.invoiceNo,
        invoiceDate: t.invoiceDate ? isoDate(t.invoiceDate) : null,
        content: t.content,
        projectLabel,
      });
    } else if (t.transactionType === "thanh_toan") {
      totalPaid += amount;
      thanhToanRows.push({ id: t.id, date: isoDate(t.date), amount, content: t.content, projectLabel });
    } else {
      totalAdjust += amount;
      adjustRows.push({ id: t.id, date: isoDate(t.date), amount, content: t.content, projectLabel });
    }
  }

  const subtotal = (rows: ReconDetailRow[], keyOf: (r: ReconDetailRow) => [string, string]) => {
    const acc = new Map<string, ReconSubtotal>();
    for (const r of rows) {
      const [key, label] = keyOf(r);
      const cur = acc.get(key) ?? { key, label, qty: 0, amount: 0 };
      cur.amount += r.amount;
      cur.qty = r.qty == null || cur.qty == null ? null : cur.qty + r.qty;
      acc.set(key, cur);
    }
    return [...acc.values()].sort((a, b) => a.label.localeCompare(b.label, "vi"));
  };

  return {
    opening,
    totalIn,
    totalPaid,
    totalAdjust,
    totalTax,
    closing: opening + totalIn + totalTax - totalPaid + totalAdjust,
    layHangRows,
    taxRows,
    thanhToanRows,
    adjustRows,
    byProject: subtotal(layHangRows, (r) => [String(r.projectId ?? ""), r.projectLabel || "Không gán công trình"]),
    byItem: subtotal(layHangRows, (r) => [r.itemLabel, r.itemLabel]),
  };
}

async function loadRecon(id: number) {
  const recon = await prisma.supplierReconciliation.findFirst({
    where: { id, deletedAt: null },
  });
  if (!recon) throw new Error(`Kỳ đối chiếu #${id} không tồn tại`);
  return recon;
}

/** Chi tiết bảng đối chiếu: kỳ đã ký đọc snapshot đông cứng, kỳ chưa ký tính động. */
export async function getReconciliationView(id: number): Promise<ReconView> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const recon = await loadRecon(id);
  const supplier = await prisma.supplier.findFirst({
    where: { id: recon.supplierId },
    select: { name: true, taxCode: true, address: true },
  });

  const fromSnapshot = recon.signedBySupplier && recon.signedSnapshotJson != null;
  const computed = fromSnapshot
    ? (recon.signedSnapshotJson as unknown as ReconComputed & { entityNames?: string[]; projectNames?: string[] })
    : await computeReconciliation(recon.supplierId, recon.periodFrom, recon.periodTo);

  let entityNames: string[] = [];
  let projectNames: string[] = [];
  if (fromSnapshot && "entityNames" in computed) {
    entityNames = (computed as { entityNames?: string[] }).entityNames ?? [];
    projectNames = (computed as { projectNames?: string[] }).projectNames ?? [];
  } else {
    ({ entityNames, projectNames } = await headerNames(recon.supplierId, recon.periodFrom, recon.periodTo));
  }

  return {
    ...(computed as ReconComputed),
    // Snapshot ký trước khi có thuế hoá đơn không chứa hai trường này.
    taxRows: (computed as Partial<ReconComputed>).taxRows ?? [],
    totalTax: (computed as Partial<ReconComputed>).totalTax ?? 0,
    id: recon.id,
    supplierId: recon.supplierId,
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
  };
}

async function headerNames(supplierId: number, from: Date, to: Date, db: DbClient = prisma) {
  const rows = await db.$queryRaw<{ entity_name: string | null; project_name: string | null }[]>`
    SELECT DISTINCT e.name AS entity_name, p.name AS project_name
    FROM ledger_transactions t
    LEFT JOIN entities e ON e.id = t."entityId"
    LEFT JOIN projects p ON p.id = t."projectId"
    WHERE t."ledgerType" = 'material' AND t."partyId" = ${supplierId}
      AND t."deletedAt" IS NULL AND t.date >= ${from} AND t.date < ${addDays(to, 1)}
  `;
  return {
    entityNames: [...new Set(rows.map((r) => r.entity_name).filter((n): n is string => !!n))].sort(),
    projectNames: [...new Set(rows.map((r) => r.project_name).filter((n): n is string => !!n))].sort(),
  };
}

/** Danh sách kỳ kèm số: kỳ đã ký đọc cột snapshot, kỳ chưa ký tính động. */
export async function listReconciliationsDerived(supplierId: number) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const recons = await prisma.supplierReconciliation.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: { periodFrom: "desc" },
  });
  return Promise.all(
    recons.map(async (r) => {
      if (r.signedBySupplier && r.openingBalance != null) {
        return {
          id: r.id,
          periodFrom: isoDate(r.periodFrom),
          periodTo: isoDate(r.periodTo),
          opening: num(r.openingBalance),
          totalIn: num(r.totalIn),
          totalPaid: num(r.totalPaid),
          closing: num(r.closingBalance),
          otherAmount: num(r.closingBalance) - num(r.openingBalance) - num(r.totalIn) + num(r.totalPaid),
          signedBySupplier: true,
          signedDate: r.signedDate ? isoDate(r.signedDate) : null,
          note: r.note,
        };
      }
      const c = await computeReconciliation(supplierId, r.periodFrom, r.periodTo);
      return {
        id: r.id,
        periodFrom: isoDate(r.periodFrom),
        periodTo: isoDate(r.periodTo),
        opening: c.opening,
        totalIn: c.totalIn,
        totalPaid: c.totalPaid,
        closing: c.closing,
        otherAmount: c.closing - c.opening - c.totalIn + c.totalPaid,
        signedBySupplier: false,
        signedDate: null,
        note: r.note,
      };
    }),
  );
}

/** NCC ký xác nhận: đông cứng số + dòng chi tiết, khóa mọi ghi mới trong kỳ. */
export async function signReconciliation(id: number) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const recon = await loadRecon(id);

  await prisma.$transaction(async (tx) => {
    // Khoá NCC (cùng khoá với chốt kỳ, phiếu ngày, sổ cái vật tư, đợt thanh toán): mọi ghi
    // đồng thời hoặc xong trước và nằm trong snapshot, hoặc chờ rồi bị khoá kỳ từ chối.
    // Re-check cờ ký trong transaction để chặn 2 lần ký đồng thời.
    await lockSuppliers(tx, [recon.supplierId]);
    const current = await tx.supplierReconciliation.findFirst({
      where: { id, deletedAt: null },
      select: { signedBySupplier: true, periodFrom: true, periodTo: true },
    });
    if (!current) throw new Error(`Kỳ đối chiếu #${id} không tồn tại`);
    if (current.signedBySupplier) throw new Error("Kỳ này đã được ký.");
    const from = toBusinessDateUtc(current.periodFrom);
    const to = toBusinessDateUtc(current.periodTo);
    const label = periodLabel(from, to);

    await assertPeriodBounds(recon.supplierId, { from, to }, tx, id);

    // Ký sẽ khoá vĩnh viễn ngày trong kỳ — phiếu chưa có phát sinh trong sổ cái lúc này
    // sẽ không bao giờ vào sổ được nữa, nên bắt buộc chốt đủ (kể cả phiếu thiếu công trình).
    const missingWhere = {
      supplierId: recon.supplierId,
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

    const computed = await computeReconciliation(recon.supplierId, from, to, tx);
    const names = await headerNames(recon.supplierId, from, to, tx);
    const snapshot = { ...computed, ...names };

    await tx.supplierReconciliation.update({
      where: { id },
      data: {
        openingBalance: new Prisma.Decimal(computed.opening),
        totalIn: new Prisma.Decimal(computed.totalIn),
        totalPaid: new Prisma.Decimal(computed.totalPaid),
        closingBalance: new Prisma.Decimal(computed.closing),
        signedBySupplier: true,
        signedDate: new Date(),
        signedSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }, { timeout: 60_000, maxWait: 10_000 }); // đọc snapshot toàn kỳ dưới khoá NCC — vượt mặc định 5s
  revalidatePath(`/vat-tu-ncc/${recon.supplierId}/doi-chieu`);
}

/**
 * Gỡ ký (admin): chỉ cho gỡ kỳ ký MỚI NHẤT của NCC — nếu kỳ sau đã ký thì phải
 * gỡ từ kỳ mới nhất về, bảo toàn chuỗi carry-over closing(k) = opening(k+1).
 */
export async function unsignReconciliation(id: number) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  await requireActiveAdmin();
  const recon = await loadRecon(id);
  if (!recon.signedBySupplier) throw new Error("Kỳ này chưa ký.");

  await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [recon.supplierId]);
    const current = await tx.supplierReconciliation.findFirst({
      where: { id, deletedAt: null },
      select: { signedBySupplier: true },
    });
    if (!current?.signedBySupplier) throw new Error("Kỳ này chưa ký.");
    const laterSigned = await tx.supplierReconciliation.findFirst({
      where: {
        supplierId: recon.supplierId,
        signedBySupplier: true,
        deletedAt: null,
        periodFrom: { gt: recon.periodFrom },
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
