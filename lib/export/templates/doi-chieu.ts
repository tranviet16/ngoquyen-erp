/**
 * Export template: Đối chiếu công nợ (Supplier reconciliation / Debt summary)
 * Data source: lib/ledger/ledger-aggregations.ts → querySummary
 */

import { createWorkbook, addSheet, workbookToBuffer, type SheetColumn } from "../excel-exporter";
import { querySummary } from "@/lib/ledger/ledger-aggregations";
import { prisma } from "@/lib/prisma";
import type { LedgerType } from "@/lib/ledger/ledger-types";

const COLUMNS: SheetColumn[] = [
  { header: "NCC / Nhà thầu", key: "partyName", width: 30 },
  { header: "Chủ thể", key: "entityName", width: 20 },
  { header: "Dư đầu (TT)", key: "openingTt", width: 18, numFmt: "#,##0" },
  { header: "Dư đầu (HĐ)", key: "openingHd", width: 18, numFmt: "#,##0" },
  { header: "Lấy hàng (TT)", key: "layHangTt", width: 18, numFmt: "#,##0" },
  { header: "Lấy hàng (HĐ)", key: "layHangHd", width: 18, numFmt: "#,##0" },
  { header: "Thanh toán (TT)", key: "thanhToanTt", width: 18, numFmt: "#,##0" },
  { header: "Thanh toán (HĐ)", key: "thanhToanHd", width: 18, numFmt: "#,##0" },
  { header: "Dư cuối (TT)", key: "balanceTt", width: 18, numFmt: "#,##0" },
  { header: "Dư cuối (HĐ)", key: "balanceHd", width: 18, numFmt: "#,##0" },
];

export async function buildDoiChieuExcel(
  ledgerType: LedgerType,
  filter: { entityId?: number; partyId?: number; projectId?: number } = {}
): Promise<Buffer> {
  const [rows, suppliers, contractors, entities] = await Promise.all([
    querySummary(ledgerType, filter),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const contractorMap = new Map(contractors.map((c) => [c.id, c.name]));
  const entityMap = new Map(entities.map((e) => [e.id, e.name]));

  const wb = createWorkbook();
  addSheet(
    wb,
    "Đối chiếu",
    COLUMNS,
    rows.map((r) => ({
      partyName: ledgerType === "material"
        ? (supplierMap.get(r.partyId) ?? `#${r.partyId}`)
        : (contractorMap.get(r.partyId) ?? `#${r.partyId}`),
      entityName: entityMap.get(r.entityId) ?? `#${r.entityId}`,
      openingTt: r.openingTt.toNumber(),
      openingHd: r.openingHd.toNumber(),
      layHangTt: r.layHangTt.toNumber(),
      layHangHd: r.layHangHd.toNumber(),
      thanhToanTt: r.thanhToanTt.toNumber(),
      thanhToanHd: r.thanhToanHd.toNumber(),
      balanceTt: r.balanceTt.toNumber(),
      balanceHd: r.balanceHd.toNumber(),
    })),
    { title: `Đối chiếu Công nợ ${ledgerType === "material" ? "Vật tư" : "Nhân công"}` }
  );

  return workbookToBuffer(wb);
}
