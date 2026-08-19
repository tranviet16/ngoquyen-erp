/**
 * Rollup định mức theo nhóm vật liệu thay thế — hậu xử lý thuần TS trên
 * NormRow[] sẵn có (KHÔNG sửa vw_project_norm). Quy tắc trung thực:
 * - ĐVT (normVtName) đồng nhất giữa thành viên → so được khối lượng, %SL.
 * - ĐVT khác nhau → chỉ so tiền (est_qty/actual_qty = null), used_pct theo tiền.
 * - KHÔNG quy đổi đơn vị.
 * Cờ nhóm là cờ duy nhất có thẩm quyền; cờ thành viên bị làm mờ ở UI.
 */

import { normVtName } from "@/lib/text/norm-vt-name";

export interface GroupableNormRow {
  estimate_id: number;
  categoryId: number;
  unit: string;
  estimate_qty: number;
  estimate_total_vnd: number;
  actual_qty: number;
  actual_amount_tt: number;
  actual_amount_hd: number;
  materialGroupId?: number | null;
}

export interface GroupNormRow {
  groupId: number;
  groupName: string;
  groupNote: string | null;
  memberEstimateIds: number[];
  categoryId: number;
  unitConsistent: boolean;
  /** ĐVT chung, hoặc null khi hỗn hợp */
  unitLabel: string | null;
  est_qty_sum: number | null;
  actual_qty_sum: number | null;
  est_total_vnd_sum: number;
  actual_amount_tt_sum: number;
  actual_amount_hd_sum: number;
  /** theo lượng khi ĐVT đồng nhất và có SL dự toán; ngược lại theo tiền */
  used_pct: number;
  usedPctBasis: "qty" | "money";
  flag: "green" | "yellow" | "red";
}

export interface MaterialGroupLite {
  id: number;
  name: string;
  note: string | null;
}

export function flagOf(
  usedPct: number,
  thresholds: { yellow: number; red: number },
): "green" | "yellow" | "red" {
  if (usedPct >= thresholds.red) return "red";
  if (usedPct >= thresholds.yellow) return "yellow";
  return "green";
}

export function rollupNormByGroup<T extends GroupableNormRow>(
  rows: T[],
  groups: MaterialGroupLite[],
  thresholds: { yellow: number; red: number },
): { groupRows: GroupNormRow[]; groupedEstimateIds: Set<number> } {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const members = new Map<number, T[]>();
  for (const row of rows) {
    if (row.materialGroupId == null) continue;
    if (!groupById.has(row.materialGroupId)) continue;
    const list = members.get(row.materialGroupId) ?? [];
    list.push(row);
    members.set(row.materialGroupId, list);
  }

  const groupRows: GroupNormRow[] = [];
  const groupedEstimateIds = new Set<number>();

  for (const [groupId, memberRows] of members) {
    if (memberRows.length === 0) continue;
    const group = groupById.get(groupId)!;
    for (const m of memberRows) groupedEstimateIds.add(m.estimate_id);

    const units = new Set(memberRows.map((m) => normVtName(m.unit)));
    const unitConsistent = units.size === 1;
    const estTotal = memberRows.reduce((s, m) => s + m.estimate_total_vnd, 0);
    const actualTt = memberRows.reduce((s, m) => s + m.actual_amount_tt, 0);
    const actualHd = memberRows.reduce((s, m) => s + m.actual_amount_hd, 0);
    const estQty = memberRows.reduce((s, m) => s + m.estimate_qty, 0);
    const actualQty = memberRows.reduce((s, m) => s + m.actual_qty, 0);

    const qtyBasis = unitConsistent && estQty > 0;
    const usedPct = qtyBasis
      ? actualQty / estQty
      : estTotal > 0
        ? actualTt / estTotal
        : 0;

    groupRows.push({
      groupId,
      groupName: group.name,
      groupNote: group.note,
      memberEstimateIds: memberRows.map((m) => m.estimate_id),
      categoryId: memberRows[0].categoryId,
      unitConsistent,
      unitLabel: unitConsistent ? memberRows[0].unit.trim() : null,
      est_qty_sum: unitConsistent ? estQty : null,
      actual_qty_sum: unitConsistent ? actualQty : null,
      est_total_vnd_sum: estTotal,
      actual_amount_tt_sum: actualTt,
      actual_amount_hd_sum: actualHd,
      used_pct: usedPct,
      usedPctBasis: qtyBasis ? "qty" : "money",
      flag: flagOf(usedPct, thresholds),
    });
  }

  groupRows.sort((a, b) => a.groupName.localeCompare(b.groupName, "vi"));
  return { groupRows, groupedEstimateIds };
}
