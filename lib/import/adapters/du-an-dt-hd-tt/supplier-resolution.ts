/**
 * Gắn NCC của file với NCC trong ERP. Khóa ánh xạ `supplier:<MST hoặc tên chuẩn hóa>`:
 *   1. admin đã chọn (mapping) → dùng, nếu NCC đó còn sống;
 *   2. đúng một NCC còn sống có cùng MST (đã chuẩn hóa) → tự gắn;
 *   3. đúng một NCC có tên chuẩn hóa trùng → tự gắn;
 *   4. còn lại → chưa gắn (lỗi chặn), kèm gợi ý theo từ khóa trùng.
 * Không tạo NCC mới: NCC mới do admin tạo ở Dữ liệu nền tảng rồi "Lưu & tính lại".
 * MST trùng nhiều NCC → không tự gắn (phải chọn).
 */

import { normVtName } from "@/lib/text/norm-vt-name";
import type { ImportMapping } from "../adapter-types";
import { normalizeMst } from "./read-mapping-sheets";
import type { DtHdTtWorkbook } from "./workbook-types";

export interface ErpSupplier {
  id: number;
  name: string;
  taxCode: string | null;
}

export interface SupplierResolution {
  key: string;
  name: string;
  mst: string;
  supplierId: number | null;
  how: "chon" | "mst" | "ten" | null;
  suggestions: { id: number; name: string }[];
  /** Có MST trong file mà NCC ERP đã gắn đang để trống MST (sẽ điền khi ghi). */
  fillTaxCode: boolean;
}

const STOP = new Set(["cong", "ty", "tnhh", "co", "phan", "cp", "thuong", "mai", "va", "xay", "dung", "tm", "xd", "dv", "dich", "vu", "san", "xuat", "hp", "hai", "phong"]);
const tokens = (s: string) => new Set(normVtName(s).split(" ").filter((t) => t && !STOP.has(t)));

export const supplierKey = (mst: string, name: string) => `supplier:${mst || normVtName(name)}`;

/** Mọi NCC xuất hiện trong file (danh sách NCC chuẩn + NCC trên hóa đơn), mỗi khóa một lần. */
export function workbookSuppliers(wb: DtHdTtWorkbook): { key: string; name: string; mst: string }[] {
  const out = new Map<string, { key: string; name: string; mst: string }>();
  for (const s of wb.suppliers) out.set(supplierKey(s.mst, s.canonical), { key: supplierKey(s.mst, s.canonical), name: s.canonical, mst: s.mst });
  for (const l of wb.invoices) {
    const key = supplierKey(l.mst, l.supplierName);
    if (!out.has(key)) out.set(key, { key, name: l.supplierName, mst: l.mst });
  }
  return [...out.values()];
}

export function resolveSuppliers(wb: DtHdTtWorkbook, mapping: ImportMapping, erp: ErpSupplier[]): SupplierResolution[] {
  const live = new Map(erp.map((s) => [s.id, s]));
  const byMst = new Map<string, ErpSupplier[]>();
  const byName = new Map<string, ErpSupplier[]>();
  for (const s of erp) {
    const mst = normalizeMst(s.taxCode);
    if (mst) byMst.set(mst, [...(byMst.get(mst) ?? []), s]);
    byName.set(normVtName(s.name), [...(byName.get(normVtName(s.name)) ?? []), s]);
  }
  return workbookSuppliers(wb).map(({ key, name, mst }) => {
    const chosen = mapping[key];
    let hit: ErpSupplier | null = null;
    let how: SupplierResolution["how"] = null;
    if (typeof chosen === "number" && live.has(chosen)) {
      hit = live.get(chosen)!;
      how = "chon";
    } else if (mst && byMst.get(mst)?.length === 1) {
      hit = byMst.get(mst)![0];
      how = "mst";
    } else if (byName.get(normVtName(name))?.length === 1) {
      hit = byName.get(normVtName(name))![0];
      how = "ten";
    }
    const mine = tokens(name);
    const suggestions = hit
      ? []
      : erp
          .map((s) => {
            const theirs = tokens(s.name);
            const common = [...mine].filter((t) => theirs.has(t)).length;
            return { s, score: common / Math.max(1, Math.min(mine.size, theirs.size)) };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((x) => ({ id: x.s.id, name: x.s.name }));
    return { key, name, mst, supplierId: hit?.id ?? null, how, suggestions, fillTaxCode: !!hit && !!mst && !normalizeMst(hit.taxCode) };
  });
}
