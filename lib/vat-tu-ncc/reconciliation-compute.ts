/**
 * Bảng đối chiếu công nợ của một cặp NCC × công trình, dẫn xuất từ sổ cái công nợ vật tư:
 *   A (dư mang sang) = số dư của cặp tại periodFrom − 1
 *   B (cộng phát sinh) = Σ lay_hang trong kỳ (dòng chi tiết từ phiếu chốt kỳ)
 *   C (chuyển khoản)  = Σ thanh_toan trong kỳ
 *   D (thuế hoá đơn)  = Σ thue_hd trong kỳ (theo ngày ghi sổ; tách dòng riêng)
 *   Tổng nợ = A + B − C + D (± điều chỉnh trong kỳ)
 * `totalIn` chỉ gồm B (hàng); thuế lưu ở taxRows/totalTax trong snapshot JSON.
 * Closing kỳ k tự nhiên = opening kỳ k+1 của cùng cặp vì cả hai cùng đọc một sổ cái.
 *
 * Không "use server": các hàm nhận client transaction (ký kỳ, commit import chuyển đổi).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bypassAudit } from "@/lib/async-context";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { addDays } from "./period-bounds";
import { requireProjectId } from "./pair-scope";
import { pairBalanceAsOf } from "./supplier-balance";

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
  projectId: number | null;
  projectLabel: string;
}

export interface ReconTaxRow {
  id: number;
  date: string;
  amount: number;
  invoiceNo: string | null;
  invoiceDate: string | null;
  content: string | null;
  projectId: number | null;
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

/** Nội dung `signedSnapshotJson` khi ký: số dẫn xuất + tên Bên mua / công trình tại lúc ký. */
export type ReconSnapshot = ReconComputed & { entityNames: string[]; projectNames: string[] };

// Structural Pick thay vì Prisma.TransactionClient vì client đã $extends.
export type ReconComputeClient = Pick<typeof prisma, "$queryRaw" | "ledgerTransaction" | "item" | "project">;
export type ReconFreezeClient = ReconComputeClient & Pick<typeof prisma, "supplierReconciliation" | "auditLog" | "user">;

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export async function computeReconciliation(
  supplierId: number,
  projectId: number,
  from: Date,
  to: Date,
  db: ReconComputeClient = prisma,
): Promise<ReconComputed> {
  const pid = requireProjectId(projectId);
  const dayBefore = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const [opening, transactions] = await Promise.all([
    pairBalanceAsOf(supplierId, pid, dayBefore, db),
    db.ledgerTransaction.findMany({
      where: {
        ledgerType: "material",
        partyId: supplierId,
        projectId: pid,
        deletedAt: null,
        date: { gte: from, lt: addDays(to, 1) },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);

  const itemIds = [...new Set(transactions.map((t) => t.itemId).filter((i): i is number => i != null))];
  const [items, project] = await Promise.all([
    itemIds.length
      ? db.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } })
      : Promise.resolve([]),
    db.project.findUnique({ where: { id: pid }, select: { code: true } }),
  ]);
  const itemMap = new Map(items.map((i) => [i.id, `${i.code} - ${i.name}`]));
  const projectLabel = project?.code ?? String(pid);

  const layHangRows: ReconDetailRow[] = [];
  const thanhToanRows: ReconPaymentRow[] = [];
  const adjustRows: ReconPaymentRow[] = [];
  const taxRows: ReconTaxRow[] = [];
  let totalTax = 0;
  let totalIn = 0;
  let totalPaid = 0;
  let totalAdjust = 0;

  for (const t of transactions) {
    const amount = Number(t.totalTt);
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
        projectId: pid,
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
        projectId: pid,
        projectLabel,
      });
    } else if (t.transactionType === "thanh_toan") {
      totalPaid += amount;
      thanhToanRows.push({ id: t.id, date: isoDate(t.date), amount, content: t.content, projectId: pid, projectLabel });
    } else {
      totalAdjust += amount;
      adjustRows.push({ id: t.id, date: isoDate(t.date), amount, content: t.content, projectId: pid, projectLabel });
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
    byProject: subtotal(layHangRows, (r) => [String(r.projectId ?? ""), r.projectLabel]),
    byItem: subtotal(layHangRows, (r) => [r.itemLabel, r.itemLabel]),
  };
}

/** Tên Chủ thể (Bên mua) và công trình xuất hiện trong kỳ của cặp — tiêu đề bảng đối chiếu. */
export async function headerNames(
  supplierId: number,
  projectId: number,
  from: Date,
  to: Date,
  db: Pick<typeof prisma, "$queryRaw"> = prisma,
) {
  const rows = await db.$queryRaw<{ entity_name: string | null; project_name: string | null }[]>`
    SELECT DISTINCT e.name AS entity_name, p.name AS project_name
    FROM ledger_transactions t
    LEFT JOIN entities e ON e.id = t."entityId"
    LEFT JOIN projects p ON p.id = t."projectId"
    WHERE t."ledgerType" = 'material' AND t."partyId" = ${supplierId}
      AND t."projectId" = ${requireProjectId(projectId)}
      AND t."deletedAt" IS NULL AND t.date >= ${from} AND t.date < ${addDays(to, 1)}
  `;
  return {
    entityNames: [...new Set(rows.map((r) => r.entity_name).filter((n): n is string => !!n))].sort(),
    projectNames: [...new Set(rows.map((r) => r.project_name).filter((n): n is string => !!n))].sort(),
  };
}

/**
 * Đông cứng kỳ đối chiếu `reconId`: tính bảng dẫn xuất cho đúng cặp + biên kỳ của marker, ghi
 * 4 cột tổng, snapshot JSON và đánh dấu đã ký (`signedBySupplier`, `signedDate`).
 * KHÔNG khoá và KHÔNG kiểm điều kiện ký — caller phải đang giữ khoá NCC (`lockSuppliers`) trong
 * transaction `db` và tự kiểm điều kiện của mình (ký tay: signReconciliation; marker chuyển đổi:
 * adapter import, ký ngay trong transaction commit).
 *
 * Mọi ghi đi qua chính client transaction: UPDATE bỏ qua audit extension (extension ghi audit bằng
 * kết nối riêng, không rollback theo transaction — commit import bị huỷ sẽ để lại audit rác), và
 * một dòng `audit_logs` được ghi NGAY TRONG transaction nên rollback là mất cả hai.
 * `opts.auditUserId`: người ký (ký tay); id không còn trong `users` thì ghi null.
 */
export async function freezeReconciliationSnapshot(
  db: ReconFreezeClient,
  reconId: number,
  opts: {
    auditUserId?: string | null;
    /**
     * Đông cứng LẠI một kỳ đã ký sau khi admin sửa phiếu trong giai đoạn khoá: tính lại số từ sổ,
     * GIỮ ngày ký cũ và ghi audit `refrozen_after_admin_edit` kèm số trước / sau và lý do.
     */
    refreeze?: { reason: string };
  } = {},
): Promise<ReconSnapshot> {
  const recon = await db.supplierReconciliation.findFirst({
    where: { id: reconId, deletedAt: null },
    select: {
      supplierId: true,
      projectId: true,
      periodFrom: true,
      periodTo: true,
      importRunId: true,
      signedDate: true,
      openingBalance: true,
      totalIn: true,
      totalPaid: true,
      closingBalance: true,
    },
  });
  if (!recon) throw new Error(`Kỳ đối chiếu #${reconId} không tồn tại`);
  const from = toBusinessDateUtc(recon.periodFrom);
  const to = toBusinessDateUtc(recon.periodTo);

  const computed = await computeReconciliation(recon.supplierId, recon.projectId, from, to, db);
  const names = await headerNames(recon.supplierId, recon.projectId, from, to, db);
  const snapshot: ReconSnapshot = { ...computed, ...names };

  const now = new Date();
  const signedDate = opts.refreeze && recon.signedDate ? recon.signedDate : now;
  const totals = {
    openingBalance: new Prisma.Decimal(computed.opening),
    totalIn: new Prisma.Decimal(computed.totalIn),
    totalPaid: new Prisma.Decimal(computed.totalPaid),
    closingBalance: new Prisma.Decimal(computed.closing),
  };
  const updated = await bypassAudit(() =>
    db.supplierReconciliation.updateMany({
      where: { id: reconId, deletedAt: null },
      data: {
        ...totals,
        signedBySupplier: true,
        signedDate,
        signedSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        updatedAt: now,
      },
    }),
  );
  if (updated.count !== 1) throw new Error(`Kỳ đối chiếu #${reconId} không tồn tại`);

  const auditUser = opts.auditUserId
    ? await db.user.findUnique({ where: { id: opts.auditUserId }, select: { id: true } })
    : null;
  await db.auditLog.create({
    data: {
      userId: auditUser?.id ?? null,
      tableName: "SupplierReconciliation",
      recordId: String(reconId),
      action: "update",
      ...(opts.refreeze
        ? {
            beforeJson: {
              openingBalance: Number(recon.openingBalance ?? 0),
              totalIn: Number(recon.totalIn ?? 0),
              totalPaid: Number(recon.totalPaid ?? 0),
              closingBalance: Number(recon.closingBalance ?? 0),
            },
          }
        : {}),
      afterJson: {
        event: opts.refreeze
          ? "refrozen_after_admin_edit"
          : recon.importRunId != null
            ? "cutover_marker_signed"
            : "signed",
        ...(opts.refreeze ? { reason: opts.refreeze.reason } : {}),
        supplierId: recon.supplierId,
        projectId: recon.projectId,
        importRunId: recon.importRunId,
        openingBalance: computed.opening,
        totalIn: computed.totalIn,
        totalPaid: computed.totalPaid,
        closingBalance: computed.closing,
        signedBySupplier: true,
        signedDate: signedDate.toISOString(),
      },
    },
  });
  return snapshot;
}
