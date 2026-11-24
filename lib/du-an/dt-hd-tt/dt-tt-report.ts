/**
 * Báo cáo "In A4 – DT-TT" Phần I và Phần II.
 *
 * Phần I — vật tư chính (nhóm `isMainMaterial`), mỗi dòng dự toán: KL dự toán vs KL thực nhận
 * (Σ KL × hệ số của thực tế nhập gán vào dòng), đơn giá DT vs đơn giá TT chưa VAT, giá trị DT vs TT
 * chưa VAT (thực tế nhập gồm VAT ÷ (1 + VAT)). Chênh = DT − TT ("+" tiết kiệm), tách
 *   do KL      = (KL DT − KL TT) × đơn giá DT,
 *   do đơn giá = (đơn giá DT − đơn giá TT) × KL TT          (hai phần cộng lại = chênh).
 * Thực tế nhập chỉ gán tới nhóm đứng ở dòng "↳ Thực nhận chỉ gán tới nhóm".
 *
 * Phần II — mỗi đầu mối một dòng: dự toán trực tiếp của các nhóm đầu mối phụ trách (chưa / gồm VAT)
 * vs thực tế chốt gồm VAT. A = NCC, B = tổ nhân công, C = khoản khác; tổng A + B (C ngoài tổng, như
 * file: H102 = H81 + H95).
 */

import { actualByCounterparty } from "./actual-per-counterparty";
import { buildBookIndex, convertedQty, type BookIndex } from "./book-index";
import { compareCounterparties, sum, tieOut, type CounterpartyKind, type ReportInputs, type TieOut } from "./report-inputs";

export interface PhanIRow {
  label: string;
  unit: string;
  qtyDt: number | null;
  qtyTt: number | null;
  priceDt: number | null;
  priceTt: number | null;
  valueDt: number;
  valueTtExVat: number;
  diff: number;
  diffByQty: number | null;
  diffByPrice: number | null;
  groupOnly: boolean;
}

export interface PhanIGroup {
  groupCodeId: number;
  code: string;
  name: string;
  rows: PhanIRow[];
  valueDt: number;
  valueTtExVat: number;
  diff: number;
}

export interface PhanIIRow {
  counterpartyId: number;
  name: string;
  kind: CounterpartyKind;
  dtExVat: number;
  dtInclVat: number;
  actual: number | null;
  diff: number | null;
}

export interface DtTtReport {
  phanI: PhanIGroup[];
  phanII: { a: PhanIIRow[]; b: PhanIIRow[]; c: PhanIIRow[]; totalA: number; totalB: number; totalAB: number; totalC: number };
  /** Thực tế nhập chưa gắn đầu mối (không vào thực tế của đầu mối tính theo thực tế nhập). */
  untaggedReceipts: number;
  checks: TieOut[];
}

export function buildDtTtReport(inp: ReportInputs, index: BookIndex = buildBookIndex(inp)): DtTtReport {
  const vat = inp.settings.vatPct;
  const actual = actualByCounterparty(inp, index);

  // Thực tế nhập theo dòng dự toán / theo nhóm (chỉ gán tới nhóm).
  const byLine = new Map<string, { qty: number | null; amount: number }[]>();
  const byGroup = new Map<number, { qty: number | null; amount: number }[]>();
  for (const r of inp.receipts) {
    const p = index.placeReceipt(r.itemKey);
    const item = { qty: p.kind === "outside" ? null : convertedQty(r.qty, p.factor), amount: r.amountVnd };
    if (p.kind === "dt_line") byLine.set(p.dtKey, [...(byLine.get(p.dtKey) ?? []), item]);
    else if (p.kind === "group_only") byGroup.set(p.groupCodeId, [...(byGroup.get(p.groupCodeId) ?? []), item]);
  }
  const qtyOf = (items: { qty: number | null }[]) => (items.length === 0 ? 0 : items.some((i) => i.qty === null) ? null : sum(items.map((i) => i.qty!)));

  const phanI: PhanIGroup[] = [];
  for (const g of [...index.groups.values()].filter((x) => x.isMainMaterial).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))) {
    const rows: PhanIRow[] = [];
    for (const dt of [...index.dtRows.values()].filter((d) => d.groupCodeId === g.id).sort((a, b) => a.itemName.localeCompare(b.itemName, "vi"))) {
      const items = byLine.get(dt.key) ?? [];
      const qtyTt = qtyOf(items);
      const valueTtExVat = sum(items.map((i) => i.amount)) / (1 + vat);
      const priceTt = qtyTt ? valueTtExVat / qtyTt : null;
      const diffByQty = dt.unitPrice !== null && qtyTt !== null ? (dt.qty - qtyTt) * dt.unitPrice : null;
      const diffByPrice = dt.unitPrice !== null && priceTt !== null && qtyTt !== null ? (dt.unitPrice - priceTt) * qtyTt : null;
      rows.push({
        label: dt.itemName, unit: dt.unit, qtyDt: dt.qty, qtyTt, priceDt: dt.unitPrice, priceTt,
        valueDt: dt.value, valueTtExVat, diff: dt.value - valueTtExVat, diffByQty, diffByPrice, groupOnly: false,
      });
    }
    const only = byGroup.get(g.id) ?? [];
    if (only.length > 0) {
      const valueTtExVat = sum(only.map((i) => i.amount)) / (1 + vat);
      rows.push({
        label: "↳ Thực nhận chỉ gán tới nhóm", unit: "", qtyDt: null, qtyTt: qtyOf(only), priceDt: null, priceTt: null,
        valueDt: 0, valueTtExVat, diff: -valueTtExVat, diffByQty: null, diffByPrice: null, groupOnly: true,
      });
    }
    if (rows.length === 0) continue;
    const valueDt = sum(rows.map((r) => r.valueDt));
    const valueTtExVat = sum(rows.map((r) => r.valueTtExVat));
    phanI.push({ groupCodeId: g.id, code: g.code, name: g.name, rows, valueDt, valueTtExVat, diff: valueDt - valueTtExVat });
  }

  const dtByCounterparty = new Map<number, number>();
  for (const dt of index.dtRows.values()) {
    const owner = dt.groupCodeId === null ? null : index.groups.get(dt.groupCodeId)?.counterpartyId ?? null;
    if (owner !== null) dtByCounterparty.set(owner, (dtByCounterparty.get(owner) ?? 0) + dt.value);
  }
  const rowsOf = (kind: CounterpartyKind): PhanIIRow[] =>
    inp.counterparties.filter((c) => c.kind === kind).sort(compareCounterparties).map((c) => {
      const dtExVat = dtByCounterparty.get(c.id) ?? 0;
      const a = actual.get(c.id) ?? null;
      const dtInclVat = dtExVat * (1 + vat);
      return { counterpartyId: c.id, name: c.name, kind, dtExVat, dtInclVat, actual: a, diff: a === null ? null : dtInclVat - a };
    });
  const a = rowsOf("ncc");
  const b = rowsOf("to_nhan_cong");
  const c = rowsOf("khac");
  const total = (rows: PhanIIRow[]) => sum(rows.map((r) => r.actual ?? 0));

  const receiptsTotal = sum(inp.receipts.map((r) => r.amountVnd));
  const tagged = sum(inp.receipts.filter((r) => r.counterpartyId !== null).map((r) => r.amountVnd));
  const checks: TieOut[] = [];
  for (const g of phanI) {
    for (const r of g.rows) {
      if (r.diffByQty !== null && r.diffByPrice !== null) {
        checks.push(tieOut(`Phần I ${r.label}: do KL + do đơn giá = chênh`, r.diff, r.diffByQty + r.diffByPrice));
      }
    }
  }
  return {
    phanI,
    phanII: { a, b, c, totalA: total(a), totalB: total(b), totalAB: total(a) + total(b), totalC: total(c) },
    untaggedReceipts: receiptsTotal - tagged,
    checks,
  };
}
