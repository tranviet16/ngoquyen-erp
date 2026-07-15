/**
 * Subtotal rollup for SL-DT reports.
 * Groups lot rows by phaseCode → groupCode, sums inputs, recomputes formulas.
 */

import { computeSanLuong, computeDoanhThu } from "./compute";
import { cleanHierarchyLabel, hasHierarchyLabel } from "./hierarchy";

export type RowKind = "lot" | "group" | "phase" | "grand";

export interface SanLuongRow {
  kind: RowKind;
  lotId?: number;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  // Inputs
  estimateValue: number;
  slKeHoachKy: number;
  slThucKyTho: number;
  slLuyKeTho: number;
  slTrat: number;
  // Computed
  tongThoTrat: number;
  conPhaiTH: number;
  pctKy: number;
  pctLuyKe: number;
  ghiChu?: string | null;
}

export interface DoanhThuRow {
  kind: RowKind;
  lotId?: number;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  // Inputs
  contractValue: number;
  dtKeHoachKy: number;
  dtThoKy: number;
  dtThoLuyKe: number;
  qtTratChua: number;
  dtTratKy: number;
  dtTratLuyKe: number;
  // Computed
  cnTho: number;
  cnTrat: number;
  dtKy: number;
  dtLuyKe: number;
  cnTong: number;
  pctKeHoach: number;
  pctLuyKe: number;
}

function sumSanLuong(rows: SanLuongRow[]): Omit<SanLuongRow, "kind" | "code" | "lotName" | "phaseCode" | "groupCode" | "sortOrder"> {
  const s = { estimateValue: 0, slKeHoachKy: 0, slThucKyTho: 0, slLuyKeTho: 0, slTrat: 0 };
  for (const r of rows) {
    s.estimateValue += r.estimateValue;
    s.slKeHoachKy += r.slKeHoachKy;
    s.slThucKyTho += r.slThucKyTho;
    s.slLuyKeTho += r.slLuyKeTho;
    s.slTrat += r.slTrat;
  }
  const c = computeSanLuong({ estimateValue: s.estimateValue, slKeHoachKy: s.slKeHoachKy, slThucKyTho: s.slThucKyTho, slLuyKeTho: s.slLuyKeTho, slTrat: s.slTrat });
  return { ...s, ...c };
}

function sumDoanhThu(rows: DoanhThuRow[]): Omit<DoanhThuRow, "kind" | "code" | "lotName" | "phaseCode" | "groupCode" | "sortOrder"> {
  const s = { contractValue: 0, dtKeHoachKy: 0, dtThoKy: 0, dtThoLuyKe: 0, qtTratChua: 0, dtTratKy: 0, dtTratLuyKe: 0 };
  for (const r of rows) {
    s.contractValue += r.contractValue;
    s.dtKeHoachKy += r.dtKeHoachKy;
    s.dtThoKy += r.dtThoKy;
    s.dtThoLuyKe += r.dtThoLuyKe;
    s.qtTratChua += r.qtTratChua;
    s.dtTratKy += r.dtTratKy;
    s.dtTratLuyKe += r.dtTratLuyKe;
  }
  const c = computeDoanhThu(s);
  return { ...s, ...c };
}

function orderValue(orderMap: Map<string, number>, key: string) {
  return orderMap.get(key) ?? 999999;
}

export function rollupSanLuong(lotRows: SanLuongRow[], orderMap: Map<string, number> = new Map()): SanLuongRow[] {
  const result: SanLuongRow[] = [];

  const byPhase = new Map<string, Map<string, SanLuongRow[]>>();
  for (const r of lotRows) {
    if (!byPhase.has(r.phaseCode)) byPhase.set(r.phaseCode, new Map());
    const byGroup = byPhase.get(r.phaseCode)!;
    if (!byGroup.has(r.groupCode)) byGroup.set(r.groupCode, []);
    byGroup.get(r.groupCode)!.push(r);
  }

  const phaseSums: SanLuongRow[] = [];

  const phaseEntries = [...byPhase.entries()].sort((a, b) =>
    orderValue(orderMap, `phase:${a[0]}`) - orderValue(orderMap, `phase:${b[0]}`) || a[0].localeCompare(b[0], "vi"),
  );

  for (const [phaseCode, byGroup] of phaseEntries) {
    const groupSums: SanLuongRow[] = [];
    const pendingGroups: Array<{ row: SanLuongRow; lots: SanLuongRow[] }> = [];

    const groupEntries = [...byGroup.entries()].sort((a, b) =>
      orderValue(orderMap, `group:${phaseCode}/${a[0]}`) - orderValue(orderMap, `group:${phaseCode}/${b[0]}`) || a[0].localeCompare(b[0], "vi"),
    );
    for (const [groupCode, lots] of groupEntries) {
      const sorted = [...lots].sort((a, b) => a.sortOrder - b.sortOrder);
      const gs = sumSanLuong(sorted);
      const groupRow: SanLuongRow = {
        kind: "group",
        code: "",
        lotName: cleanHierarchyLabel(groupCode),
        phaseCode,
        groupCode,
        sortOrder: 9999,
        ...gs,
      };
      groupSums.push(groupRow);
      pendingGroups.push({ row: groupRow, lots: sorted });
    }

    const ps = sumSanLuong(groupSums);
    const phaseRow: SanLuongRow = {
      kind: "phase",
      code: "",
      lotName: cleanHierarchyLabel(phaseCode),
      phaseCode,
      groupCode: "",
      sortOrder: 99999,
      ...ps,
    };
    phaseSums.push(phaseRow);
    if (hasHierarchyLabel(phaseCode)) result.push(phaseRow);
    for (const item of pendingGroups) {
      if (hasHierarchyLabel(item.row.groupCode)) result.push(item.row);
      result.push(...item.lots);
    }
  }

  // Grand total
  const grand = sumSanLuong(phaseSums);
  result.push({
    kind: "grand",
    code: "",
    lotName: "Tổng cộng",
    phaseCode: "",
    groupCode: "",
    sortOrder: 999999,
    ...grand,
  });

  return result;
}

export function rollupDoanhThu(lotRows: DoanhThuRow[], orderMap: Map<string, number> = new Map()): DoanhThuRow[] {
  const result: DoanhThuRow[] = [];

  const byPhase = new Map<string, Map<string, DoanhThuRow[]>>();
  for (const r of lotRows) {
    if (!byPhase.has(r.phaseCode)) byPhase.set(r.phaseCode, new Map());
    const byGroup = byPhase.get(r.phaseCode)!;
    if (!byGroup.has(r.groupCode)) byGroup.set(r.groupCode, []);
    byGroup.get(r.groupCode)!.push(r);
  }

  const phaseSums: DoanhThuRow[] = [];

  const phaseEntries = [...byPhase.entries()].sort((a, b) =>
    orderValue(orderMap, `phase:${a[0]}`) - orderValue(orderMap, `phase:${b[0]}`) || a[0].localeCompare(b[0], "vi"),
  );

  for (const [phaseCode, byGroup] of phaseEntries) {
    const groupSums: DoanhThuRow[] = [];
    const pendingGroups: Array<{ row: DoanhThuRow; lots: DoanhThuRow[] }> = [];

    const groupEntries = [...byGroup.entries()].sort((a, b) =>
      orderValue(orderMap, `group:${phaseCode}/${a[0]}`) - orderValue(orderMap, `group:${phaseCode}/${b[0]}`) || a[0].localeCompare(b[0], "vi"),
    );
    for (const [groupCode, lots] of groupEntries) {
      const sorted = [...lots].sort((a, b) => a.sortOrder - b.sortOrder);
      const gs = sumDoanhThu(sorted);
      const groupRow: DoanhThuRow = {
        kind: "group",
        code: "",
        lotName: cleanHierarchyLabel(groupCode),
        phaseCode,
        groupCode,
        sortOrder: 9999,
        ...gs,
      };
      groupSums.push(groupRow);
      pendingGroups.push({ row: groupRow, lots: sorted });
    }

    const ps = sumDoanhThu(groupSums);
    const phaseRow: DoanhThuRow = {
      kind: "phase",
      code: "",
      lotName: cleanHierarchyLabel(phaseCode),
      phaseCode,
      groupCode: "",
      sortOrder: 99999,
      ...ps,
    };
    phaseSums.push(phaseRow);
    if (hasHierarchyLabel(phaseCode)) result.push(phaseRow);
    for (const item of pendingGroups) {
      if (hasHierarchyLabel(item.row.groupCode)) result.push(item.row);
      result.push(...item.lots);
    }
  }

  const grand = sumDoanhThu(phaseSums);
  result.push({
    kind: "grand",
    code: "",
    lotName: "Tổng cộng",
    phaseCode: "",
    groupCode: "",
    sortOrder: 999999,
    ...grand,
  });

  return result;
}
