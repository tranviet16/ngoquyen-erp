/**
 * Subtotal rollup for SL-DT reports.
 * Groups lot rows by phaseCode → groupCode, sums inputs, recomputes formulas.
 */

import { computeSanLuong, computeDoanhThu } from "./compute";

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

export function rollupSanLuong(lotRows: SanLuongRow[]): SanLuongRow[] {
  const result: SanLuongRow[] = [];

  // Group by phaseCode then groupCode
  const byPhase = new Map<string, Map<string, SanLuongRow[]>>();
  for (const r of lotRows) {
    if (!byPhase.has(r.phaseCode)) byPhase.set(r.phaseCode, new Map());
    const byGroup = byPhase.get(r.phaseCode)!;
    if (!byGroup.has(r.groupCode)) byGroup.set(r.groupCode, []);
    byGroup.get(r.groupCode)!.push(r);
  }

  const phaseSums: SanLuongRow[] = [];

  for (const [phaseCode, byGroup] of byPhase) {
    const groupSums: SanLuongRow[] = [];

    for (const [groupCode, lots] of byGroup) {
      // Emit lots sorted by sortOrder
      const sorted = [...lots].sort((a, b) => a.sortOrder - b.sortOrder);
      result.push(...sorted);

      // Group subtotal
      const gs = sumSanLuong(sorted);
      const groupRow: SanLuongRow = {
        kind: "group",
        code: "",
        lotName: `Tổng nhóm ${groupCode}`,
        phaseCode,
        groupCode,
        sortOrder: 9999,
        ...gs,
      };
      result.push(groupRow);
      groupSums.push(groupRow);
    }

    // Phase subtotal
    const ps = sumSanLuong(groupSums);
    const phaseRow: SanLuongRow = {
      kind: "phase",
      code: "",
      lotName: `Tổng giai đoạn ${phaseCode}`,
      phaseCode,
      groupCode: "",
      sortOrder: 99999,
      ...ps,
    };
    result.push(phaseRow);
    phaseSums.push(phaseRow);
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

export function rollupDoanhThu(lotRows: DoanhThuRow[]): DoanhThuRow[] {
  const result: DoanhThuRow[] = [];

  const byPhase = new Map<string, Map<string, DoanhThuRow[]>>();
  for (const r of lotRows) {
    if (!byPhase.has(r.phaseCode)) byPhase.set(r.phaseCode, new Map());
    const byGroup = byPhase.get(r.phaseCode)!;
    if (!byGroup.has(r.groupCode)) byGroup.set(r.groupCode, []);
    byGroup.get(r.groupCode)!.push(r);
  }

  const phaseSums: DoanhThuRow[] = [];

  for (const [phaseCode, byGroup] of byPhase) {
    const groupSums: DoanhThuRow[] = [];

    for (const [groupCode, lots] of byGroup) {
      const sorted = [...lots].sort((a, b) => a.sortOrder - b.sortOrder);
      result.push(...sorted);

      const gs = sumDoanhThu(sorted);
      const groupRow: DoanhThuRow = {
        kind: "group",
        code: "",
        lotName: `Tổng nhóm ${groupCode}`,
        phaseCode,
        groupCode,
        sortOrder: 9999,
        ...gs,
      };
      result.push(groupRow);
      groupSums.push(groupRow);
    }

    const ps = sumDoanhThu(groupSums);
    const phaseRow: DoanhThuRow = {
      kind: "phase",
      code: "",
      lotName: `Tổng giai đoạn ${phaseCode}`,
      phaseCode,
      groupCode: "",
      sortOrder: 99999,
      ...ps,
    };
    result.push(phaseRow);
    phaseSums.push(phaseRow);
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
