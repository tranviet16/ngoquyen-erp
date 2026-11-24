/**
 * Đồng bộ dự toán ERP theo file của đội (người dùng chốt 17/11/2026: dự toán lấy theo file).
 * So theo khóa dòng dự toán (tên|ĐVT|loại):
 *   - keep:    ERP và file bằng nhau (KL lệch ≤ 0,1 %, giá trị lệch ≤ 1 đ);
 *   - replace: cùng khóa nhưng khác số → thay các dòng ERP bằng MỘT dòng theo file, giữ hạng mục +
 *              mã vật tư của dòng ERP lớn nhất (các tab cũ vẫn khớp), chép nhóm thay thế / ghi đè HĐ;
 *   - add:     file có, ERP không. Có dòng ERP cùng loại, cùng KL, cùng giá trị nhưng khác tên →
 *              coi là đổi tên (thay dòng đó, giữ hạng mục + mã); còn lại thêm vào hạng mục đầu tiên
 *              của loại, mã `DT-<STT file>`;
 *   - remove:  ERP có, file không → thay (xóa mềm, hoàn tác khôi phục được).
 * Dòng ERP thuộc hạng mục không phải VL / NC / MTC không bị đụng tới.
 */

import { Prisma } from "@prisma/client";
import { groupEstimatesByKey, kindOfCategoryCode, type CostKind, type DtLine, type EstimateRowInput } from "@/lib/du-an/dt-hd-tt/keys";

export interface ErpEstimate extends EstimateRowInput {
  materialGroupId: number | null;
  remainingInvoiceOverrideVnd: Prisma.Decimal | null;
}

export interface NewEstimate {
  key: string;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  totalVnd: Prisma.Decimal;
  materialGroupId: number | null;
  remainingInvoiceOverrideVnd: Prisma.Decimal | null;
}

export interface DtSyncOp {
  op: "replace" | "add" | "rename" | "remove";
  key: string;
  name: string;
  unit: string;
  kind: CostKind;
  erpQty: number;
  erpValue: number;
  fileQty: number;
  fileValue: number;
}

export interface DtSyncPlan {
  ops: DtSyncOp[];
  supersedeEstimateIds: number[];
  insert: NewEstimate[];
  erpTotal: number;
  fileTotal: number;
  kept: number;
}

const same = (a: DtLine, b: DtLine) =>
  a.value.sub(b.value).abs().lessThanOrEqualTo(1) && a.qty.sub(b.qty).abs().lessThanOrEqualTo(Prisma.Decimal.max(1, b.qty.abs()).mul(0.001));

export function planDtSync(fileLines: DtLine[], erp: ErpEstimate[], categories: { id: number; code: string }[]): DtSyncPlan {
  const erpLines = groupEstimatesByKey(erp);
  const byId = new Map(erp.map((e) => [e.id, e]));
  const firstCategory = new Map<CostKind, number>();
  for (const c of [...categories].sort((a, b) => a.id - b.id)) {
    const k = kindOfCategoryCode(c.code);
    if (k && !firstCategory.has(k)) firstCategory.set(k, c.id);
  }
  const usedCodes = new Set(erp.map((e) => `${e.categoryId}|${e.itemCode}`));
  const ops: DtSyncOp[] = [];
  const supersede: number[] = [];
  const insert: NewEstimate[] = [];
  let kept = 0;

  const newRow = (f: DtLine, categoryId: number, itemCode: string, template?: ErpEstimate): NewEstimate => ({
    key: f.key, categoryId, itemCode, itemName: f.itemName, unit: f.unit, qty: f.qty,
    unitPrice: f.qty.isZero() ? f.value : f.value.div(f.qty), totalVnd: f.value,
    materialGroupId: template?.materialGroupId ?? null, remainingInvoiceOverrideVnd: template?.remainingInvoiceOverrideVnd ?? null,
  });
  const op = (o: DtSyncOp["op"], f: DtLine | null, e: DtLine | null): DtSyncOp => ({
    op: o, key: (f ?? e)!.key, name: (f ?? e)!.itemName, unit: (f ?? e)!.unit, kind: (f ?? e)!.kind,
    erpQty: e?.qty.toNumber() ?? 0, erpValue: e?.value.toNumber() ?? 0, fileQty: f?.qty.toNumber() ?? 0, fileValue: f?.value.toNumber() ?? 0,
  });

  const unmatchedErp = new Map([...erpLines].filter(([k]) => !fileLines.some((f) => f.key === k)));
  for (const f of fileLines) {
    const e = erpLines.get(f.key);
    if (e && same(f, e)) {
      kept++;
      continue;
    }
    if (e) {
      supersede.push(...e.estimateIds);
      insert.push(newRow(f, e.primary.categoryId, e.primary.itemCode, byId.get(e.primary.estimateId)));
      ops.push(op("replace", f, e));
      continue;
    }
    const renamed = [...unmatchedErp.values()].find((x) => x.kind === f.kind && same(f, x));
    if (renamed) {
      unmatchedErp.delete(renamed.key);
      supersede.push(...renamed.estimateIds);
      insert.push(newRow(f, renamed.primary.categoryId, renamed.primary.itemCode, byId.get(renamed.primary.estimateId)));
      ops.push(op("rename", f, renamed));
      continue;
    }
    const categoryId = firstCategory.get(f.kind) ?? firstCategory.get("VL");
    if (categoryId === undefined) throw new Error("Công trình chưa có hạng mục VL / NC / MTC để thêm dòng dự toán.");
    let itemCode = `DT-${f.primary.itemCode || f.itemName.slice(0, 20)}`;
    for (let i = 2; usedCodes.has(`${categoryId}|${itemCode}`); i++) itemCode = `DT-${f.primary.itemCode}-${i}`;
    usedCodes.add(`${categoryId}|${itemCode}`);
    insert.push(newRow(f, categoryId, itemCode));
    ops.push(op("add", f, null));
  }
  for (const e of unmatchedErp.values()) {
    supersede.push(...e.estimateIds);
    ops.push(op("remove", null, e));
  }
  const total = (lines: Iterable<DtLine>) => [...lines].reduce((a, l) => a + l.value.toNumber(), 0);
  return { ops, supersedeEstimateIds: supersede.sort((a, b) => a - b), insert, erpTotal: total(erpLines.values()), fileTotal: total(fileLines), kept };
}
