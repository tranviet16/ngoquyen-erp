/**
 * Báo cáo "In A4 – DT-HĐ": dự toán ↔ hóa đơn theo đầu mối → mã nhóm → dòng dự toán → "↳" dòng HĐ.
 *
 * File của đội lập khối theo NCC pháp nhân; ở đây khối theo ĐẦU MỐI (NCC gộp), trùng với file khi
 * đầu mối có một NCC. Nhóm không có NCC phụ trách (hoặc phụ trách là tổ / khoản khác) nằm trong khối
 * "Chưa có đầu mối". Cột khối: G dự toán, N HĐ do NCC của đầu mối xuất, L thực tế chốt gồm VAT,
 * M = L / (1 + VAT), S = HĐ của đầu mối nằm trong nhóm của mình, T = HĐ của đầu mối ngoài dự toán,
 * O = N − S − T (HĐ gán chéo sang nhóm khối khác), P = M − N (còn phải lấy HĐ so thực tế).
 * Dòng đối soát khối: Σ HĐ trong các nhóm của khối = N → "✓ Khớp sổ Hóa Đơn", lệch → "⚠ Lệch".
 * Kiểm tổng: Σ HĐ trong nhóm của mọi khối + Phần B (ngoài dự toán / chưa gán) = Σ mọi dòng HĐ.
 */

import { actualByCounterparty } from "./actual-per-counterparty";
import { buildBookIndex, convertedQty, type BookIndex, type Placement } from "./book-index";
import { dtHdStatus, statusCounts, type DtHdStatus } from "./dt-hd-status";
import { sum, tieOut, compareCounterparties, type ReportInputs, type TieOut } from "./report-inputs";

export interface DtHdInvoiceRow {
  invoiceLineId: number;
  supplierName: string;
  invoiceNo: string;
  itemName: string;
  unit: string;
  qty: number | null;
  factor: number | null;
  qtyConverted: number | null;
  amount: number;
}

export interface DtHdLineRow {
  key: string;
  itemName: string;
  unit: string;
  qtyDt: number;
  qtyHd: number | null;
  qtyShort: number | null;
  qtyOver: number | null;
  valueDt: number;
  valueHd: number;
  balance: number;
  status: DtHdStatus;
  invoices: DtHdInvoiceRow[];
}

export interface DtHdGroupRow {
  groupCodeId: number | null;
  code: string;
  name: string;
  valueDt: number;
  valueHd: number;
  balance: number;
  statusSummary: string;
  lines: DtHdLineRow[];
  groupOnly: DtHdInvoiceRow[];
}

export interface DtHdBlock {
  counterpartyId: number | null;
  name: string;
  valueDt: number;
  invoiceTotal: number;
  balance: number;
  actual: number | null;
  actualExVat: number | null;
  inOwnGroups: number;
  outsideDt: number;
  crossAssigned: number;
  remainingVsActual: number | null;
  groupsHd: number;
  groups: DtHdGroupRow[];
  tieOut: TieOut;
}

export interface DtHdReport {
  blocks: DtHdBlock[];
  partB: { supplierId: number; supplierName: string; lines: DtHdInvoiceRow[]; total: number }[];
  partBTotal: number;
  grandCheck: TieOut;
}

const NO_GROUP = -1;

export function buildDtHdReport(inp: ReportInputs, index: BookIndex = buildBookIndex(inp)): DtHdReport {
  const actual = actualByCounterparty(inp, index);
  const vat = inp.settings.vatPct;
  const blockOfGroup = (groupCodeId: number | null): number | null => {
    const owner = groupCodeId === null ? null : index.groups.get(groupCodeId)?.counterpartyId ?? null;
    return owner !== null && index.counterparties.get(owner)?.kind === "ncc" ? owner : null;
  };
  const blockOfSupplier = (supplierId: number): number | null => {
    const owner = index.supplierLink.get(supplierId)?.counterpartyId ?? null;
    return owner !== null && index.counterparties.get(owner)?.kind === "ncc" ? owner : null;
  };

  // Đặt từng dòng HĐ.
  const byLine = new Map<string, DtHdInvoiceRow[]>();
  const byGroupOnly = new Map<number, DtHdInvoiceRow[]>();
  const partB = new Map<number, DtHdInvoiceRow[]>();
  const placements: { row: DtHdInvoiceRow; place: Placement; supplierId: number }[] = [];
  for (const l of inp.invoiceLines) {
    const place = index.placeInvoice(l.itemKey);
    const factor = place.kind === "outside" ? null : place.factor;
    const row: DtHdInvoiceRow = {
      invoiceLineId: l.id, supplierName: index.supplierName.get(l.supplierId) ?? `NCC #${l.supplierId}`,
      invoiceNo: l.invoiceNo, itemName: l.itemName, unit: l.unit, qty: l.qty, factor,
      qtyConverted: convertedQty(l.qty, factor), amount: l.amountVnd,
    };
    placements.push({ row, place, supplierId: l.supplierId });
    if (place.kind === "dt_line") byLine.set(place.dtKey, [...(byLine.get(place.dtKey) ?? []), row]);
    else if (place.kind === "group_only") byGroupOnly.set(place.groupCodeId, [...(byGroupOnly.get(place.groupCodeId) ?? []), row]);
    else partB.set(l.supplierId, [...(partB.get(l.supplierId) ?? []), row]);
  }

  // Dòng dự toán → nhóm.
  const linesByGroup = new Map<number, DtHdLineRow[]>();
  for (const dt of index.dtRows.values()) {
    const invoices = byLine.get(dt.key) ?? [];
    const valueHd = sum(invoices.map((i) => i.amount));
    const withFactor = invoices.filter((i) => i.qtyConverted !== null);
    const qtyHd = withFactor.length > 0 ? sum(withFactor.map((i) => i.qtyConverted!)) : null;
    const known = qtyHd ?? 0;
    const measurable = dt.qty > 0 && !(known === 0 && valueHd > 0);
    const line: DtHdLineRow = {
      key: dt.key, itemName: dt.itemName, unit: dt.unit, qtyDt: dt.qty, qtyHd,
      qtyShort: measurable ? Math.max(0, dt.qty - known) : null,
      qtyOver: measurable ? Math.max(0, known - dt.qty) : null,
      valueDt: dt.value, valueHd, balance: dt.value - valueHd,
      status: dtHdStatus({ qtyDt: dt.qty, valueDt: dt.value, qtyHd: known, valueHd, missingFactor: invoices.some((i) => i.factor === null) }),
      invoices,
    };
    const g = dt.groupCodeId ?? NO_GROUP;
    linesByGroup.set(g, [...(linesByGroup.get(g) ?? []), line]);
  }

  const groupRow = (groupCodeId: number): DtHdGroupRow => {
    const lines = (linesByGroup.get(groupCodeId) ?? []).sort((a, b) => a.itemName.localeCompare(b.itemName, "vi"));
    const groupOnly = groupCodeId === NO_GROUP ? [] : byGroupOnly.get(groupCodeId) ?? [];
    const valueDt = sum(lines.map((l) => l.valueDt));
    const valueHd = sum(lines.map((l) => l.valueHd)) + sum(groupOnly.map((i) => i.amount));
    const g = groupCodeId === NO_GROUP ? null : index.groups.get(groupCodeId) ?? null;
    return {
      groupCodeId: g?.id ?? null, code: g?.code ?? "", name: g?.name ?? "(dòng dự toán chưa có mã nhóm)",
      valueDt, valueHd, balance: valueDt - valueHd, statusSummary: statusCounts(lines.map((l) => l.status)), lines, groupOnly,
    };
  };

  const groupIds = [...new Set([...index.groups.keys(), ...linesByGroup.keys()])];
  const blockKeys: (number | null)[] = [
    ...inp.counterparties.filter((c) => c.kind === "ncc").sort(compareCounterparties).map((c) => c.id),
    null,
  ];
  const blocks: DtHdBlock[] = [];
  for (const cpId of blockKeys) {
    const groups = groupIds
      .filter((g) => (g === NO_GROUP ? null : blockOfGroup(g)) === cpId)
      .map(groupRow)
      .filter((g) => g.lines.length > 0 || g.groupOnly.length > 0)
      .sort((a, b) => (index.groups.get(a.groupCodeId ?? 0)?.sortOrder ?? 1e9) - (index.groups.get(b.groupCodeId ?? 0)?.sortOrder ?? 1e9) || a.code.localeCompare(b.code));
    const own = placements.filter((p) => blockOfSupplier(p.supplierId) === cpId);
    const invoiceTotal = sum(own.map((p) => p.row.amount));
    if (groups.length === 0 && own.length === 0) continue;
    const ownGroupIds = new Set(groups.map((g) => g.groupCodeId));
    const inOwnGroups = sum(own.filter((p) => p.place.kind !== "outside" && ownGroupIds.has(p.place.groupCodeId)).map((p) => p.row.amount));
    const outsideDt = sum(own.filter((p) => p.place.kind === "outside").map((p) => p.row.amount));
    const groupsHd = sum(groups.map((g) => g.valueHd));
    const valueDt = sum(groups.map((g) => g.valueDt));
    const a = cpId === null ? null : actual.get(cpId) ?? null;
    const actualExVat = a === null ? null : a / (1 + vat);
    blocks.push({
      counterpartyId: cpId, name: cpId === null ? "Chưa có đầu mối" : index.counterparties.get(cpId)!.name,
      valueDt, invoiceTotal, balance: valueDt - invoiceTotal, actual: a, actualExVat,
      inOwnGroups, outsideDt, crossAssigned: invoiceTotal - inOwnGroups - outsideDt,
      remainingVsActual: actualExVat === null ? null : actualExVat - invoiceTotal,
      groupsHd, groups, tieOut: tieOut("TỔNG HĐ DO NCC XUẤT", invoiceTotal, groupsHd),
    });
  }

  const partBRows = [...partB.entries()]
    .map(([supplierId, lines]) => ({ supplierId, supplierName: index.supplierName.get(supplierId) ?? `NCC #${supplierId}`, lines, total: sum(lines.map((l) => l.amount)) }))
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "vi"));
  const partBTotal = sum(partBRows.map((r) => r.total));
  return {
    blocks,
    partB: partBRows,
    partBTotal,
    grandCheck: tieOut("Σ HĐ trong nhóm + Phần B = sổ Hóa Đơn", sum(inp.invoiceLines.map((l) => l.amountVnd)), sum(blocks.map((b) => b.groupsHd)) + partBTotal),
  };
}
