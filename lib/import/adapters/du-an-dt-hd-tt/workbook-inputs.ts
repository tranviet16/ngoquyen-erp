/**
 * Dựng `ReportInputs` từ workbook của đội (chưa ghi DB) — dùng cho cổng kiểm của import (tính lại
 * ba báo cáo trong bộ nhớ rồi so với số trong file) và cho smoke test file thật.
 *
 * Quy tắc gắn:
 *   - mã nhóm → đầu mối: "NCC áp dụng" của 'Đề Xuất NCC' → dòng Phần II qua 'Ánh Xạ Tên NCC' (T:U),
 *     hoặc trùng tên một dòng Phần II (vd. "Vật tư phụ");
 *   - NCC → đầu mối: 'Ánh Xạ Tên NCC' cột U; NCC không có U (Chương Dương, LPP, Phương Minh) không
 *     thuộc đầu mối nào — đúng như file (HĐ-TT cột Q trống → thực tế 0);
 *   - thực tế nhập → đầu mối: các dòng mà công thức cột H Phần II cộng; còn lại không gắn;
 *   - chi thực tế → NCC theo "đầu mối chuẩn" (cột I) trùng tên chuẩn NCC; → tổ nhân công khi trùng tên.
 * `supplierIdOf` trả id NCC (thật khi import, giả khi test) cho một NCC theo MST / tên chuẩn.
 */

import { Prisma } from "@prisma/client";
import { dtLineKeyOf, itemKeyOf, type DtLine } from "@/lib/du-an/dt-hd-tt/keys";
import { normVtName } from "@/lib/text/norm-vt-name";
import type { AliasIn, ReportInputs } from "@/lib/du-an/dt-hd-tt/report-inputs";
import type { DtHdTtWorkbook } from "./workbook-types";

export type SupplierIdOf = (s: { mst: string; name: string }) => number | null;

/** Dòng dự toán của file thành `DtLine` (cộng các dòng trùng khóa, như ERP gom dự toán). */
export function workbookDtLines(wb: DtHdTtWorkbook): DtLine[] {
  const lines = new Map<string, DtLine>();
  wb.dtLines.forEach((d, i) => {
    const key = dtLineKeyOf(d.name, d.unit, d.kind);
    const cur = lines.get(key);
    const qty = new Prisma.Decimal(d.qty);
    const value = new Prisma.Decimal(d.value);
    if (cur) {
      cur.qty = cur.qty.add(qty);
      cur.value = cur.value.add(value);
      return;
    }
    lines.set(key, {
      key, kind: d.kind, itemName: d.name, unit: d.unit, qty, value, unitPrice: null, estimateIds: [-(i + 1)],
      primary: { estimateId: -(i + 1), categoryId: 0, itemCode: d.stt },
    });
  });
  for (const l of lines.values()) l.unitPrice = l.qty.isZero() ? null : l.value.div(l.qty);
  return [...lines.values()];
}

export function buildWorkbookInputs(wb: DtHdTtWorkbook, supplierIdOf: SupplierIdOf, dtLines: DtLine[] = workbookDtLines(wb)): ReportInputs {
  const norm = (s: string) => normVtName(s);
  // Đầu mối: id = số dòng Phần II (duy nhất trong file); thứ tự = STT.
  const cpByStt = new Map(wb.counterparties.filter((c) => c.kind === "ncc").map((c) => [c.stt, c]));
  const cpByName = new Map(wb.counterparties.map((c) => [norm(c.name), c]));
  const supplierByCanonical = new Map(wb.suppliers.map((s) => [norm(s.canonical), s]));

  const ownerOf = (ownerName: string | null): number | null => {
    if (!ownerName) return null;
    const sup = supplierByCanonical.get(norm(ownerName));
    if (sup?.dtTtStt != null) return cpByStt.get(sup.dtTtStt)?.row ?? null;
    return cpByName.get(norm(ownerName))?.row ?? null;
  };

  const codes = new Set([...wb.groups.map((g) => g.code), ...wb.dtLines.flatMap((d) => (d.groupCode ? [d.groupCode] : []))]);
  const groupId = new Map([...codes].map((code, i) => [code, i + 1]));
  const dtKeyByStt = new Map(wb.dtLines.map((d) => [d.stt, dtLineKeyOf(d.name, d.unit, d.kind)]));
  const groupOfDtKey = new Map(wb.dtLines.map((d) => [dtLineKeyOf(d.name, d.unit, d.kind), d.groupCode]));

  const aliases: AliasIn[] = [];
  const seen = new Set<string>();
  for (const d of wb.dtLines) {
    const key = dtLineKeyOf(d.name, d.unit, d.kind);
    if (seen.has(`dt|${key}`)) continue;
    seen.add(`dt|${key}`);
    aliases.push({ source: "dt", itemKey: key, groupCodeId: d.groupCode ? groupId.get(d.groupCode) ?? null : null, kind: d.kind, dtKey: null, factor: null, status: "xac_nhan" });
  }
  for (const a of wb.aliases) {
    const key = itemKeyOf(a.name, a.unit);
    if (seen.has(`${a.source}|${key}`)) continue;
    seen.add(`${a.source}|${key}`);
    const dtKey = a.sttDt ? dtKeyByStt.get(a.sttDt) ?? null : null;
    const code = a.groupCode ?? (dtKey ? groupOfDtKey.get(dtKey) ?? null : null);
    aliases.push({ source: a.source, itemKey: key, groupCodeId: code ? groupId.get(code) ?? null : null, kind: null, dtKey, factor: a.factor, status: a.status });
  }
  const mainGroups = new Set(aliases.filter((a) => a.source === "tt" && a.dtKey).map((a) => groupOfDtKey.get(a.dtKey!)));

  const supplierId = (mst: string, name: string) => {
    const id = supplierIdOf({ mst, name });
    if (id === null) throw new Error(`Chưa xác định được NCC "${name}" (MST ${mst || "—"})`);
    return id;
  };
  const hdTtByName = new Map(wb.hdTtRows.map((r) => [norm(r.supplierName), r]));
  const receiptOwner = new Map(wb.counterparties.flatMap((c) => c.receiptRows.map((r) => [r, c.row] as const)));

  return {
    settings: { ...wb.goldens.rates, missing: false },
    dtLines,
    dtWithoutKindValue: 0,
    groupCodes: [...codes].map((code) => {
      const g = wb.groups.find((x) => x.code === code);
      return { id: groupId.get(code)!, code, name: g?.name ?? code, counterpartyId: ownerOf(g?.ownerName ?? null), isMainMaterial: mainGroups.has(code), sortOrder: groupId.get(code)! };
    }),
    aliases,
    counterparties: wb.counterparties.map((c) => ({
      id: c.row, name: c.name, kind: c.kind, sortGroup: null, sortOrder: c.row,
      actualBasis: c.basis, actualManualVnd: c.manual, paymentSection: c.paymentSection,
    })),
    counterpartySuppliers: wb.suppliers.map((s, i) => {
      const r = hdTtByName.get(norm(s.canonical));
      return {
        id: i + 1, supplierId: supplierId(s.mst, s.canonical),
        counterpartyId: s.dtTtStt != null ? cpByStt.get(s.dtTtStt)?.row ?? null : null,
        splitActualVnd: r?.split ?? null, paidOverrideVnd: r?.paidOverride ?? null, recoveredVnd: r?.recovered ?? null, todoNote: r?.todo ?? null,
      };
    }),
    suppliers: wb.suppliers.map((s) => ({ id: supplierId(s.mst, s.canonical), name: s.canonical })),
    invoiceLines: wb.invoices.map((l) => ({
      id: l.row, supplierId: supplierId(l.mst, l.supplierName), invoiceNo: l.invoiceNo, invoiceDate: l.date, itemName: l.itemName,
      unit: l.unit, itemKey: itemKeyOf(l.itemName, l.unit), qty: l.qty, amountVnd: l.amount, vatVnd: l.vat,
    })),
    receipts: wb.receipts.map((r) => ({ id: r.row, itemKey: itemKeyOf(r.itemName, r.unit), qty: r.qty, amountVnd: r.amount, counterpartyId: receiptOwner.get(r.row) ?? null })),
    payments: wb.payments.map((p) => {
      const sup = supplierByCanonical.get(norm(p.payee));
      const cp = cpByName.get(norm(p.payee));
      return {
        id: p.row, bankVnd: p.bank, cashVnd: p.cash, section: p.section,
        counterpartyId: cp && cp.kind !== "ncc" ? cp.row : null, supplierId: sup ? supplierId(sup.mst, sup.canonical) : null,
      };
    }),
  };
}
