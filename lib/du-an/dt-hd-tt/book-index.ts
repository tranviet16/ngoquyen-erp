/**
 * Chỉ mục dùng chung cho các báo cáo: tra alias, mã nhóm của dòng dự toán, đầu mối của NCC, và vị
 * trí của từng dòng hóa đơn / thực tế nhập (dòng dự toán, chỉ gán tới nhóm, hay ngoài dự toán).
 *
 * Mapping chỉ quyết định dòng HIỆN ở đâu, không quyết định dòng có được CỘNG hay không: dòng chưa
 * gán vẫn có vị trí ("chưa gán") để mọi tổng và dòng đối soát đều đủ.
 */

import type { CostKind } from "./keys";
import type { AliasIn, CounterpartyIn, CounterpartySupplierIn, GroupCodeIn, ReportInputs } from "./report-inputs";

/** Vị trí của một dòng hóa đơn / thực tế nhập. */
export type Placement =
  | { kind: "dt_line"; dtKey: string; groupCodeId: number | null; factor: number | null }
  | { kind: "group_only"; groupCodeId: number; factor: number | null }
  | { kind: "outside"; reason: "chua_gan" | "ngoai_dt" };

/** Một dòng dự toán cho báo cáo: số liệu kiểu number + mã nhóm / loại từ alias dt. */
export interface DtRow {
  key: string;
  kind: CostKind;
  itemName: string;
  unit: string;
  qty: number;
  value: number;
  unitPrice: number | null;
  groupCodeId: number | null;
}

export interface BookIndex {
  dtRows: Map<string, DtRow>;
  groups: Map<number, GroupCodeIn>;
  counterparties: Map<number, CounterpartyIn>;
  /** NCC pháp nhân → dòng NCC của đầu mối. */
  supplierLink: Map<number, CounterpartySupplierIn>;
  /** Đầu mối → các dòng NCC (theo id tăng dần = thứ tự file). */
  suppliersOf: Map<number, CounterpartySupplierIn[]>;
  supplierName: Map<number, string>;
  placeInvoice(itemKey: string): Placement;
  placeReceipt(itemKey: string): Placement;
}

function aliasMap(aliases: AliasIn[], source: AliasIn["source"]): Map<string, AliasIn> {
  return new Map(aliases.filter((a) => a.source === source).map((a) => [a.itemKey, a]));
}

export function buildBookIndex(inp: ReportInputs): BookIndex {
  const dtAlias = aliasMap(inp.aliases, "dt");
  const dtRows = new Map<string, DtRow>();
  for (const line of inp.dtLines) {
    const alias = dtAlias.get(line.key);
    dtRows.set(line.key, {
      key: line.key,
      kind: alias?.kind ?? line.kind,
      itemName: line.itemName,
      unit: line.unit,
      qty: line.qty.toNumber(),
      value: line.value.toNumber(),
      unitPrice: line.unitPrice ? line.unitPrice.toNumber() : null,
      groupCodeId: alias?.groupCodeId ?? null,
    });
  }

  const suppliersOf = new Map<number, CounterpartySupplierIn[]>();
  for (const link of [...inp.counterpartySuppliers].sort((a, b) => a.id - b.id)) {
    if (link.counterpartyId === null) continue;
    suppliersOf.set(link.counterpartyId, [...(suppliersOf.get(link.counterpartyId) ?? []), link]);
  }

  const place = (source: "hd" | "tt") => {
    const map = aliasMap(inp.aliases, source);
    return (itemKey: string): Placement => {
      const alias = map.get(itemKey);
      if (!alias) return { kind: "outside", reason: "chua_gan" };
      if (alias.status === "ngoai_dt") return { kind: "outside", reason: "ngoai_dt" };
      if (alias.dtKey && dtRows.has(alias.dtKey)) {
        // Nhóm của dòng HĐ / TT gán vào dòng dự toán = nhóm của chính dòng dự toán đó.
        const groupCodeId = dtRows.get(alias.dtKey)!.groupCodeId;
        return { kind: "dt_line", dtKey: alias.dtKey, groupCodeId, factor: alias.factor };
      }
      if (alias.groupCodeId !== null) return { kind: "group_only", groupCodeId: alias.groupCodeId, factor: alias.factor };
      return { kind: "outside", reason: "chua_gan" };
    };
  };

  return {
    dtRows,
    groups: new Map(inp.groupCodes.map((g) => [g.id, g])),
    counterparties: new Map(inp.counterparties.map((c) => [c.id, c])),
    supplierLink: new Map(inp.counterpartySuppliers.map((l) => [l.supplierId, l])),
    suppliersOf,
    supplierName: new Map(inp.suppliers.map((s) => [s.id, s.name])),
    placeInvoice: place("hd"),
    placeReceipt: place("tt"),
  };
}

/** Mã nhóm của một vị trí (null: ngoài dự toán hoặc dòng dự toán chưa có nhóm). */
export function groupOf(p: Placement): number | null {
  return p.kind === "outside" ? null : p.groupCodeId;
}

/** KL quy đổi = SL × hệ số; null khi thiếu SL hoặc hệ số (theo dõi theo giá trị). */
export function convertedQty(qty: number | null, factor: number | null): number | null {
  return qty === null || factor === null ? null : qty * factor;
}
