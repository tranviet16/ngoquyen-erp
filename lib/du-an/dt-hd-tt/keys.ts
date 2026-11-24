/**
 * Khóa so khớp của sổ "Đối chiếu DT-HĐ-TT".
 *
 * - `itemKeyOf(tên, ĐVT)` = `normVtName(tên)|normUnit(ĐVT)`: khóa của dòng hóa đơn / thực tế nhập và
 *   khóa ánh xạ hd / tt.
 * - `dtLineKeyOf(tên, ĐVT, loại)` = itemKey + `|loại`: một dòng dự toán. File của đội lặp cùng tên|ĐVT
 *   ở cả VL, NC và MTC (vd. "Bê tông bọt chống nóng mái M75"), nên loại phải nằm trong khóa.
 * - `normUnit`: ĐVT viết khác nhau nhưng cùng nghĩa (m² / m2 / m^2, m³ / m3 / khối…) cho cùng khóa,
 *   m² và m³ không bao giờ trùng. `normVtName` bỏ ký tự ² ³ nên không dùng trực tiếp cho ĐVT.
 *
 * Module thuần (không truy cập DB) — dùng chung cho import, báo cáo và màn nhập liệu.
 */

import { Prisma } from "@prisma/client";
import { normVtName } from "@/lib/text/norm-vt-name";
import { kindOfCategoryCode, type CostKind } from "./cost-kind";

export { kindOfCategoryCode, type CostKind };

/** ĐVT đã chuẩn hóa (sau NFKD + normVtName) → dạng chính tắc. */
const UNIT_ALIASES: Record<string, string> = {
  "m 2": "m2", "m2": "m2", "met vuong": "m2",
  "m 3": "m3", "m3": "m3", "met khoi": "m3", "khoi": "m3",
  "m": "m", "met": "m", "md": "md", "m dai": "md", "met dai": "md",
  "kg": "kg", "kilogam": "kg",
  "t": "tan", "tan": "tan",
  "l": "lit", "lit": "lit",
};

export function normUnit(unit: string | null | undefined): string {
  // NFKD trước để ² → 2, ³ → 3; normVtName sau đó bỏ dấu và ký tự lạ ("m^2" → "m 2").
  const base = normVtName(String(unit ?? "").normalize("NFKD"));
  return UNIT_ALIASES[base] ?? base;
}

export function itemKeyOf(name: string, unit: string | null | undefined): string {
  return `${normVtName(name)}|${normUnit(unit)}`;
}

export function dtLineKeyOf(name: string, unit: string | null | undefined, kind: CostKind): string {
  return `${itemKeyOf(name, unit)}|${kind}`;
}

type Num = Prisma.Decimal | number | string;

export interface EstimateRowInput {
  id: number;
  categoryId: number;
  categoryCode: string;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: Num;
  totalVnd: Num;
}

/** Một dòng dự toán của báo cáo = các dòng ERP cùng khóa (cộng mọi hạng mục). */
export interface DtLine {
  key: string;
  kind: CostKind;
  itemName: string;
  unit: string;
  qty: Prisma.Decimal;
  value: Prisma.Decimal;
  /** Đơn giá bình quân = giá trị / KL; null khi KL = 0 (dòng tính theo %). */
  unitPrice: Prisma.Decimal | null;
  estimateIds: number[];
  /** Dòng ERP giá trị lớn nhất (bằng nhau → id nhỏ nhất): nơi giao dịch HĐ sinh tự động được gán. */
  primary: { estimateId: number; categoryId: number; itemCode: string };
}

/** Gom dòng dự toán ERP theo khóa dòng; dòng thuộc hạng mục không phải VL/NC/MTC bị bỏ qua. */
export function groupEstimatesByKey(rows: readonly EstimateRowInput[]): Map<string, DtLine> {
  const lines = new Map<string, DtLine>();
  const best = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    const kind = kindOfCategoryCode(row.categoryCode);
    if (!kind) continue;
    const key = dtLineKeyOf(row.itemName, row.unit, kind);
    const qty = new Prisma.Decimal(row.qty);
    const value = new Prisma.Decimal(row.totalVnd);
    const line = lines.get(key);
    if (!line) {
      lines.set(key, {
        key, kind, itemName: row.itemName, unit: row.unit, qty, value, unitPrice: null,
        estimateIds: [row.id],
        primary: { estimateId: row.id, categoryId: row.categoryId, itemCode: row.itemCode },
      });
      best.set(key, value);
      continue;
    }
    line.qty = line.qty.add(qty);
    line.value = line.value.add(value);
    line.estimateIds.push(row.id);
    const top = best.get(key)!;
    if (value.greaterThan(top) || (value.equals(top) && row.id < line.primary.estimateId)) {
      line.primary = { estimateId: row.id, categoryId: row.categoryId, itemCode: row.itemCode };
      best.set(key, value);
    }
  }
  for (const line of lines.values()) {
    line.unitPrice = line.qty.isZero() ? null : line.value.div(line.qty);
  }
  return lines;
}
