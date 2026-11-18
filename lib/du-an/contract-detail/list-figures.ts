/**
 * Số cho cột "Công nợ còn lại (TT)" của danh mục hợp đồng, và các phép cộng phục vụ
 * tie-out với báo cáo công nợ lũy kế (`queryDetailReport`). Module thuần.
 *
 * Báo cáo làm tròn `toFixed(0)` trên từng dòng (Chủ thể × đối tác × công trình) rồi mới
 * cộng; `sumByEntityRounded` làm đúng như vậy với dòng sổ chưa làm tròn, nên hai phía
 * so được đến từng đồng. Cột danh mục đọc thẳng số báo cáo, không đối chiếu lúc chạy.
 */

import type { Prisma } from "@prisma/client";
import {
  decStr,
  parsePartyKind,
  toDec,
  ZERO,
  ECONOMIC_CONTRACT_DOC_TYPE,
  type ContractRef,
  type DecimalLike,
  type ListFigure,
} from "./types";

// ─── Cộng theo Chủ thể ─────────────────────────────────────────────────────────

/** Dòng sổ (`LedgerRowInput`) hoặc số dư đầu kỳ (`OpeningInput`): cột thiếu = 0. */
export interface EntityAmountInput {
  entityId: number;
  openingTt?: DecimalLike;
  openingHd?: DecimalLike;
  incTt?: DecimalLike;
  incHd?: DecimalLike;
  decTt?: DecimalLike;
  decHd?: DecimalLike;
}

export interface EntityComponents {
  openingTt: Prisma.Decimal;
  openingHd: Prisma.Decimal;
  incTt: Prisma.Decimal;
  incHd: Prisma.Decimal;
  decTt: Prisma.Decimal;
  decHd: Prisma.Decimal;
}

const COMPONENT_KEYS = ["openingTt", "openingHd", "incTt", "incHd", "decTt", "decHd"] as const;

/** Cộng chính xác 6 thành phần cho từng Chủ thể; Map sắp theo entityId tăng dần. */
export function sumComponentsByEntity(rows: readonly EntityAmountInput[]): Map<number, EntityComponents> {
  const acc = new Map<number, EntityComponents>();
  for (const row of rows) {
    let c = acc.get(row.entityId);
    if (!c) {
      c = { openingTt: ZERO, openingHd: ZERO, incTt: ZERO, incHd: ZERO, decTt: ZERO, decHd: ZERO };
      acc.set(row.entityId, c);
    }
    for (const key of COMPONENT_KEYS) {
      const v = row[key];
      if (v != null) c[key] = c[key].plus(toDec(v));
    }
  }
  return new Map([...acc.entries()].sort(([a], [b]) => a - b));
}

// ─── Tie-out với báo cáo ───────────────────────────────────────────────────────

/** 8 số của một cặp, cùng tên trường với `DetailRow` của báo cáo công nợ lũy kế. */
export interface PairTotals {
  openingTt: string;
  phatSinhTt: string;
  daTraTt: string;
  cuoiKyTt: string;
  openingHd: string;
  phatSinhHd: string;
  daTraHd: string;
  cuoiKyHd: string;
}

/** Dòng báo cáo canonical của một cặp; `DetailRow` thỏa kiểu này. */
export interface ReportPairRow extends PairTotals {
  entityId: number;
  partyId: number;
  projectId: number | null;
}

/**
 * 8 số của cặp từ dòng sổ + số dư đầu kỳ chưa làm tròn: cộng chính xác trong từng
 * Chủ thể, làm tròn `toFixed(0)` theo từng Chủ thể như báo cáo, rồi cộng các Chủ thể.
 */
export function sumByEntityRounded(rows: readonly EntityAmountInput[]): PairTotals {
  const perEntity: PairTotals[] = [...sumComponentsByEntity(rows).values()].map((c) => ({
    openingTt: c.openingTt.toFixed(0),
    phatSinhTt: c.incTt.toFixed(0),
    daTraTt: c.decTt.toFixed(0),
    cuoiKyTt: c.openingTt.plus(c.incTt).minus(c.decTt).toFixed(0),
    openingHd: c.openingHd.toFixed(0),
    phatSinhHd: c.incHd.toFixed(0),
    daTraHd: c.decHd.toFixed(0),
    cuoiKyHd: c.openingHd.plus(c.incHd).minus(c.decHd).toFixed(0),
  }));
  return sumReportRows(perEntity);
}

/** Σ các dòng báo cáo (đã làm tròn sẵn) của một cặp, theo cùng 8 trường. */
export function sumReportRows(rows: readonly PairTotals[]): PairTotals {
  return mapPair((k) => decStr(rows.reduce((s, r) => s.plus(toDec(r[k])), ZERO)));
}

function mapPair(fn: (key: keyof PairTotals) => string): PairTotals {
  return {
    openingTt: fn("openingTt"),
    phatSinhTt: fn("phatSinhTt"),
    daTraTt: fn("daTraTt"),
    cuoiKyTt: fn("cuoiKyTt"),
    openingHd: fn("openingHd"),
    phatSinhHd: fn("phatSinhHd"),
    daTraHd: fn("daTraHd"),
    cuoiKyHd: fn("cuoiKyHd"),
  };
}

// ─── Cột danh mục ──────────────────────────────────────────────────────────────

/** Các dòng báo cáo canonical của công trình, theo sổ. */
export interface CanonicalReportRows {
  material: readonly ReportPairRow[];
  labor: readonly ReportPairRow[];
}

/** A' (Σ nghiệm thu CĐT) và C' (tiền CĐT trả ròng) của công trình, cộng bằng SQL. */
export interface CdtTotalsInput {
  nghiemThu: DecimalLike;
  daNhan: DecimalLike;
}

/**
 * "Công nợ còn lại (TT)": NCC/đội = Σ `cuoiKyTt` của cặp qua mọi Chủ thể; CĐT = A' − C';
 * loại không phải hợp đồng kinh tế, chưa gắn đối tác, hoặc đã xóa = null.
 */
export function buildListFigure(
  contract: ContractRef,
  canonical: CanonicalReportRows,
  cdtTotals: CdtTotalsInput,
): ListFigure {
  const kind = parsePartyKind(contract.partyKind);
  if (contract.deletedAt != null || contract.docType !== ECONOMIC_CONTRACT_DOC_TYPE || kind == null) {
    return { debtTt: null };
  }
  if (kind === "cdt") {
    return { debtTt: decStr(toDec(cdtTotals.nghiemThu).minus(toDec(cdtTotals.daNhan))) };
  }
  const [rows, partyId] =
    kind === "ncc" ? [canonical.material, contract.supplierId] : [canonical.labor, contract.contractorId];
  if (partyId == null) return { debtTt: null };
  const pairRows = rows.filter((r) => r.partyId === partyId && r.projectId === contract.projectId);
  return { debtTt: sumReportRows(pairRows).cuoiKyTt };
}
