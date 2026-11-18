/**
 * Báo cáo "In A4 – HĐ-TT": mỗi NCC pháp nhân một dòng (theo đầu mối), như file của đội.
 *   E HĐ gồm VAT; G đã trả theo sổ chi; H thực nộp rà soát (nhập tay); I = H ?? G;
 *   J cần nộp thêm = max(0, E − I); K đã nộp vượt = max(0, I − E); L = I / E;
 *   T thực tế: S (nhập tách) nếu có; đầu mối nhiều NCC → dòng đầu nhận phần còn lại
 *     (thực tế đầu mối − Σ (S ?? E) các NCC khác), các dòng sau = S ?? E; đầu mối một NCC → thực tế
 *     đầu mối; đầu mối chưa chốt thực tế → T = E ("chưa chốt thực tế, tạm = HĐ"); NCC không thuộc
 *     đầu mối nào (vd. Chương Dương, LPP xuất HĐ thay Sobek) → T = 0, như file (cột Q trống);
 *   U = T − E; V nợ thực tế = T − I (không trừ X); W sẽ lấy về = max(0, J − V); X đã lấy về;
 *   Y còn phải lấy về = W − X.
 * Kiểm: Σ E = sổ Hóa Đơn gồm VAT; Σ T = Σ thực tế các đầu mối NCC − đầu mối NCC không có dòng
 * HĐ-TT + phần tạm = HĐ (vd. file 17/11: T34 − H81 = 125.000.040 − 4.537.037).
 */

import { actualByCounterparty } from "./actual-per-counterparty";
import { buildBookIndex, type BookIndex } from "./book-index";
import { compareCounterparties, sum, tieOut, type ReportInputs, type TieOut } from "./report-inputs";

export interface HdTtRow {
  supplierId: number;
  supplierName: string;
  counterpartyId: number | null;
  counterpartyName: string | null;
  invoiceExVat: number;
  invoiceVat: number;
  invoiceTotal: number;
  paidBook: number;
  paidOverride: number | null;
  paid: number;
  toPay: number;
  overpaid: number;
  paidRatio: number | null;
  counterpartyActual: number | null;
  split: number | null;
  actual: number;
  actualIsTemporary: boolean;
  actualMinusInvoice: number;
  debt: number;
  toRecover: number;
  recovered: number | null;
  stillToRecover: number;
  todo: string | null;
}

export interface HdTtReport {
  rows: HdTtRow[];
  totals: Record<"invoiceExVat" | "invoiceVat" | "invoiceTotal" | "paidBook" | "paid" | "toPay" | "overpaid" | "actual" | "actualMinusInvoice" | "debt" | "toRecover" | "recovered" | "stillToRecover", number>;
  checks: TieOut[];
  /** Giải thích Σ T ≠ Σ thực tế đầu mối NCC. */
  actualGap: { temporaryFromInvoices: number; counterpartiesWithoutRows: { name: string; actual: number }[] };
}

export function buildHdTtReport(inp: ReportInputs, index: BookIndex = buildBookIndex(inp)): HdTtReport {
  const actual = actualByCounterparty(inp, index);
  const inv = new Map<number, { net: number; vat: number }>();
  for (const l of inp.invoiceLines) {
    const cur = inv.get(l.supplierId) ?? { net: 0, vat: 0 };
    inv.set(l.supplierId, { net: cur.net + l.amountVnd, vat: cur.vat + l.vatVnd });
  }
  const paidBook = new Map<number, number>();
  for (const p of inp.payments) {
    if (p.supplierId !== null) paidBook.set(p.supplierId, (paidBook.get(p.supplierId) ?? 0) + p.bankVnd + p.cashVnd);
  }
  const invoiceTotal = (supplierId: number) => {
    const v = inv.get(supplierId);
    return v ? v.net + v.vat : 0;
  };

  // Thứ tự dòng: theo đầu mối (như file) rồi NCC theo thứ tự nhập; NCC chưa gắn đầu mối xếp cuối.
  const ordered: { supplierId: number; link: (typeof inp.counterpartySuppliers)[number] | null }[] = [];
  for (const cp of [...inp.counterparties].sort(compareCounterparties)) {
    for (const link of index.suppliersOf.get(cp.id) ?? []) ordered.push({ supplierId: link.supplierId, link });
  }
  const withoutCounterparty = (id: number) => (index.supplierLink.get(id)?.counterpartyId ?? null) === null;
  const unlinked = new Set(
    [...inv.keys(), ...paidBook.keys(), ...inp.counterpartySuppliers.map((l) => l.supplierId)].filter(withoutCounterparty),
  );
  for (const supplierId of [...unlinked].sort((a, b) => (index.supplierName.get(a) ?? "").localeCompare(index.supplierName.get(b) ?? "", "vi"))) {
    ordered.push({ supplierId, link: index.supplierLink.get(supplierId) ?? null });
  }

  const rows: HdTtRow[] = ordered.map(({ supplierId, link }) => {
    const e = invoiceTotal(supplierId);
    const cp = link?.counterpartyId != null ? index.counterparties.get(link.counterpartyId) ?? null : null;
    const cpActual = cp ? actual.get(cp.id) ?? null : null;
    const siblings = cp ? index.suppliersOf.get(cp.id) ?? [] : [];
    const isFirst = siblings[0]?.supplierId === supplierId;
    let t: number;
    let temporary = false;
    if (link?.splitActualVnd != null) t = link.splitActualVnd;
    else if (!cp) t = 0;
    else if (cpActual === null) {
      t = e;
      temporary = true;
    } else if (siblings.length > 1) {
      t = isFirst ? cpActual - sum(siblings.slice(1).map((s) => s.splitActualVnd ?? invoiceTotal(s.supplierId))) : e;
    } else t = cpActual;
    const g = paidBook.get(supplierId) ?? 0;
    const paid = link?.paidOverrideVnd ?? g;
    const toPay = Math.max(0, e - paid);
    const debt = t - paid;
    const toRecover = Math.max(0, toPay - debt);
    const recovered = link?.recoveredVnd ?? null;
    const v = inv.get(supplierId) ?? { net: 0, vat: 0 };
    return {
      supplierId, supplierName: index.supplierName.get(supplierId) ?? `NCC #${supplierId}`,
      counterpartyId: cp?.id ?? null, counterpartyName: cp?.name ?? null,
      invoiceExVat: v.net, invoiceVat: v.vat, invoiceTotal: e,
      paidBook: g, paidOverride: link?.paidOverrideVnd ?? null, paid, toPay, overpaid: Math.max(0, paid - e),
      paidRatio: e === 0 ? null : paid / e,
      counterpartyActual: isFirst ? cpActual : null, split: link?.splitActualVnd ?? null,
      actual: t, actualIsTemporary: temporary, actualMinusInvoice: t - e, debt, toRecover,
      recovered, stillToRecover: toRecover - (recovered ?? 0), todo: link?.todoNote ?? null,
    };
  });

  const total = (f: (r: HdTtRow) => number) => sum(rows.map(f));
  const totals = {
    invoiceExVat: total((r) => r.invoiceExVat), invoiceVat: total((r) => r.invoiceVat), invoiceTotal: total((r) => r.invoiceTotal),
    paidBook: total((r) => r.paidBook), paid: total((r) => r.paid), toPay: total((r) => r.toPay), overpaid: total((r) => r.overpaid),
    actual: total((r) => r.actual), actualMinusInvoice: total((r) => r.actualMinusInvoice), debt: total((r) => r.debt),
    toRecover: total((r) => r.toRecover), recovered: total((r) => r.recovered ?? 0), stillToRecover: total((r) => r.stillToRecover),
  };

  const ncc = inp.counterparties.filter((c) => c.kind === "ncc");
  const counterpartiesWithoutRows = ncc
    .filter((c) => (index.suppliersOf.get(c.id) ?? []).length === 0 && (actual.get(c.id) ?? null) !== null)
    .map((c) => ({ name: c.name, actual: actual.get(c.id)! }));
  const temporaryFromInvoices = total((r) => (r.actualIsTemporary ? r.actual : 0));
  const nccActual = sum(ncc.map((c) => actual.get(c.id) ?? 0));
  const nonNccRows = total((r) => (r.counterpartyId !== null && index.counterparties.get(r.counterpartyId)?.kind !== "ncc" && !r.actualIsTemporary ? r.actual : 0));
  return {
    rows,
    totals,
    checks: [
      tieOut("Σ E = sổ Hóa Đơn gồm VAT", sum(inp.invoiceLines.map((l) => l.amountVnd + l.vatVnd)), totals.invoiceTotal),
      tieOut(
        "Σ T = Σ thực tế đầu mối NCC − đầu mối không có dòng HĐ-TT + phần tạm = HĐ",
        nccActual - sum(counterpartiesWithoutRows.map((c) => c.actual)) + temporaryFromInvoices + nonNccRows,
        totals.actual,
      ),
    ],
    actualGap: { temporaryFromInvoices, counterpartiesWithoutRows },
  };
}
