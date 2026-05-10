/**
 * Export template: Báo cáo tháng Công nợ Vật tư / Nhân công
 * Pivot: party (NCC / Đội) × 1 month, 10 columns + dòng tổng (matches SOP).
 */

import { createWorkbook, addSheet, workbookToBuffer, type SheetColumn } from "../excel-exporter";
import { queryMonthlyByParty } from "@/lib/ledger/ledger-aggregations";
import { prisma } from "@/lib/prisma";
import type { LedgerType } from "@/lib/ledger/ledger-types";

const COLUMNS: SheetColumn[] = [
  { header: "STT", key: "stt", width: 6 },
  { header: "Danh Mục", key: "partyName", width: 30 },
  { header: "Phải Trả Đầu Kỳ (TT)", key: "openingTt", width: 20, numFmt: "#,##0" },
  { header: "PS Phải Trả (TT)", key: "layHangTt", width: 20, numFmt: "#,##0" },
  { header: "PS Đã Trả (TT)", key: "thanhToanTt", width: 20, numFmt: "#,##0" },
  { header: "Phải Trả Cuối Kỳ (TT)", key: "closingTt", width: 20, numFmt: "#,##0" },
  { header: "Phải Trả Đầu Kỳ (HĐ)", key: "openingHd", width: 20, numFmt: "#,##0" },
  { header: "PS Phải Trả (HĐ)", key: "layHangHd", width: 20, numFmt: "#,##0" },
  { header: "PS Đã Trả (HĐ)", key: "thanhToanHd", width: 20, numFmt: "#,##0" },
  { header: "Phải Trả Cuối Kỳ (HĐ)", key: "closingHd", width: 20, numFmt: "#,##0" },
];

export async function buildCongNoMonthlyExcel(
  ledgerType: LedgerType,
  year: number,
  month: number,
  entityId: number
): Promise<Buffer> {
  const rawRows = await queryMonthlyByParty(ledgerType, year, month, entityId);

  const partyIds = rawRows.map((r) => r.partyId);
  const [parties, entity] = await Promise.all([
    ledgerType === "material"
      ? prisma.supplier.findMany({
          where: { id: { in: partyIds }, deletedAt: null },
          select: { id: true, name: true },
        })
      : prisma.contractor.findMany({
          where: { id: { in: partyIds }, deletedAt: null },
          select: { id: true, name: true },
        }),
    prisma.entity.findUnique({ where: { id: entityId }, select: { name: true } }),
  ]);
  const prefix = ledgerType === "material" ? "NCC" : "Đội";
  const partyMap = new Map(parties.map((p) => [p.id, p.name]));

  const rows = rawRows
    .map((r) => ({ ...r, partyName: partyMap.get(r.partyId) ?? `${prefix} #${r.partyId}` }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName, "vi"));

  const dataRows = rows.map((r, i) => ({
    stt: i + 1,
    partyName: r.partyName,
    openingTt: r.openingTt.toNumber(),
    layHangTt: r.layHangTt.toNumber(),
    thanhToanTt: r.thanhToanTt.toNumber(),
    closingTt: r.closingTt.toNumber(),
    openingHd: r.openingHd.toNumber(),
    layHangHd: r.layHangHd.toNumber(),
    thanhToanHd: r.thanhToanHd.toNumber(),
    closingHd: r.closingHd.toNumber(),
  }));

  const totals = dataRows.reduce(
    (acc, r) => ({
      openingTt: acc.openingTt + r.openingTt,
      layHangTt: acc.layHangTt + r.layHangTt,
      thanhToanTt: acc.thanhToanTt + r.thanhToanTt,
      closingTt: acc.closingTt + r.closingTt,
      openingHd: acc.openingHd + r.openingHd,
      layHangHd: acc.layHangHd + r.layHangHd,
      thanhToanHd: acc.thanhToanHd + r.thanhToanHd,
      closingHd: acc.closingHd + r.closingHd,
    }),
    { openingTt: 0, layHangTt: 0, thanhToanTt: 0, closingTt: 0, openingHd: 0, layHangHd: 0, thanhToanHd: 0, closingHd: 0 }
  );
  const totalRow = { stt: "" as unknown as number, partyName: "TỔNG", ...totals };

  const wb = createWorkbook();
  const label = ledgerType === "material" ? "Vật tư" : "Nhân công";
  addSheet(wb, "Báo cáo tháng", COLUMNS, [...dataRows, totalRow], {
    title: `Báo cáo tháng Công nợ ${label} — Tháng ${month}/${year} — Chủ thể: ${entity?.name ?? `#${entityId}`}`,
  });

  return workbookToBuffer(wb);
}
