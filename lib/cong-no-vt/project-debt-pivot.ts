/**
 * project-debt-pivot.ts — Xoay bảng công nợ vật tư theo cặp NCC × công trình (module thuần).
 *
 * Đầu vào: các dòng (Chủ thể × NCC × Công trình) của `queryDetailReport`. Đầu ra: nhóm cấp 1
 * (NCC hoặc công trình), dòng con cấp 2 (công trình hoặc NCC) và tổng chung. Chủ thể được gộp
 * vào dòng con (một công trình thuộc một Chủ thể; dữ liệu cũ lệch Chủ thể vẫn được cộng đủ).
 *
 * Mỗi nút giữ 8 số TT/HĐ cùng khóa với `DetailRow`; nhãn cột phụ thuộc cửa sổ:
 *  - có cận dưới (Năm, Quý, Tháng, Tuần, 27→26, Tuỳ chọn có "Từ ngày"):
 *    Đầu kỳ / PS tăng / PS giảm / Cuối kỳ;
 *  - không cận dưới (Toàn bộ, "Đến hết …"): Số dư chuyển sang / LH lũy kế / Đã trả lũy kế / Còn nợ.
 *    Cùng số liệu: khi không có `from`, `queryDetailReport` tính Đầu kỳ chỉ từ số dư ban đầu (ròng),
 *    Phát sinh / Đã trả là lũy kế mọi dòng sổ, nên chuyển sang + LH − Đã trả = Còn nợ.
 *
 * Không import Prisma/Next; số tiền là số nguyên VND (an toàn tới 2^53).
 */

import { z } from "zod";
import { windowSchema } from "@/lib/ledger/report-period";
import type { DetailRow } from "./balance-report-service";

// ─── Kiểu công khai ────────────────────────────────────────────────────────────

export const PIVOT_GROUP_BY = ["ncc", "cong-trinh"] as const;
export type PivotGroupBy = (typeof PIVOT_GROUP_BY)[number];

export const PIVOT_AMOUNT_KEYS = [
  "openingTt",
  "phatSinhTt",
  "daTraTt",
  "cuoiKyTt",
  "openingHd",
  "phatSinhHd",
  "daTraHd",
  "cuoiKyHd",
] as const;
export type PivotAmountKey = (typeof PIVOT_AMOUNT_KEYS)[number];
export type PivotAmounts = Record<PivotAmountKey, number>;

export interface PivotNode {
  /** Khóa ổn định trong một bảng: `ncc:<id>` hoặc `ct:<id>` / `ct:none`. */
  key: string;
  /** null chỉ có ở nhóm "(Chưa gán công trình)". */
  id: number | null;
  name: string;
  amounts: PivotAmounts;
}

export interface PivotGroup extends PivotNode {
  children: PivotNode[];
}

export interface ProjectPivot {
  groupBy: PivotGroupBy;
  groups: PivotGroup[];
  total: PivotAmounts;
}

export const UNASSIGNED_PROJECT_LABEL = "(Chưa gán công trình)";

export const PIVOT_GROUP_LABELS: Record<PivotGroupBy, { level1: string; level2: string; title: string }> = {
  ncc: { level1: "Nhà cung cấp", level2: "Công trình", title: "NCC → công trình" },
  "cong-trinh": { level1: "Công trình", level2: "Nhà cung cấp", title: "Công trình → NCC" },
};

// ─── Cột theo chế độ ───────────────────────────────────────────────────────────

export type PivotColumnMode = "window" | "cumulative";

export interface PivotColumn {
  key: PivotAmountKey;
  label: string;
  side: "tt" | "hd";
}

export const PIVOT_SIDE_LABELS = { tt: "Thực tế (TT)", hd: "Hóa đơn (HĐ)" } as const;

const FIELD_LABELS: Record<PivotColumnMode, readonly [string, string, string, string]> = {
  window: ["Đầu kỳ", "PS tăng", "PS giảm", "Cuối kỳ"],
  cumulative: ["Số dư chuyển sang", "LH lũy kế", "Đã trả lũy kế", "Còn nợ"],
};

/** Cửa sổ không có cận dưới (`from` null) → chế độ lũy kế; còn lại → chế độ kỳ. */
export function pivotColumnMode(from: Date | string | null | undefined): PivotColumnMode {
  return from == null ? "cumulative" : "window";
}

/** 8 cột số theo thứ tự hiển thị: 4 cột TT rồi 4 cột HĐ. */
export function pivotColumns(mode: PivotColumnMode): PivotColumn[] {
  const labels = FIELD_LABELS[mode];
  return PIVOT_AMOUNT_KEYS.map((key, i) => ({ key, label: labels[i % 4], side: i < 4 ? "tt" : "hd" }));
}

// ─── Kiểm tra tham số (server action / route) ─────────────────────────────────

export interface ProjectDebtQuery {
  /** ISO `YYYY-MM-DD` hoặc null = không giới hạn. */
  from: string | null;
  to: string | null;
  groupBy: PivotGroupBy;
  entityIds: number[];
}

const MAX_ENTITY_IDS = 200;

const queryRestSchema = z.object({
  groupBy: z.enum(PIVOT_GROUP_BY, { error: "Kiểu nhóm phải là \"ncc\" hoặc \"cong-trinh\"" }),
  entityIds: z
    .array(z.number({ error: "Chủ thể không hợp lệ" }).int("Chủ thể không hợp lệ").positive("Chủ thể không hợp lệ"), {
      error: "Chủ thể không hợp lệ",
    })
    .max(MAX_ENTITY_IDS, `Chọn tối đa ${MAX_ENTITY_IDS} Chủ thể`),
});

/** Kiểm tra tham số từ client: cửa sổ ISO, kiểu nhóm, danh sách Chủ thể. Không ném. */
export function parseProjectDebtQuery(input: unknown): ProjectDebtQuery | { error: string } {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Tham số không hợp lệ" };
  }
  const raw = input as Record<string, unknown>;
  const window = windowSchema.safeParse({ from: raw.from ?? null, to: raw.to ?? null });
  if (!window.success) return { error: window.error.issues[0]?.message ?? "Mốc thời gian không hợp lệ" };
  const rest = queryRestSchema.safeParse({ groupBy: raw.groupBy, entityIds: raw.entityIds ?? [] });
  if (!rest.success) return { error: rest.error.issues[0]?.message ?? "Tham số không hợp lệ" };
  return {
    from: window.data.from,
    to: window.data.to,
    groupBy: rest.data.groupBy,
    entityIds: [...new Set(rest.data.entityIds)],
  };
}

// ─── Xoay bảng ─────────────────────────────────────────────────────────────────

export function zeroAmounts(): PivotAmounts {
  return {
    openingTt: 0,
    phatSinhTt: 0,
    daTraTt: 0,
    cuoiKyTt: 0,
    openingHd: 0,
    phatSinhHd: 0,
    daTraHd: 0,
    cuoiKyHd: 0,
  };
}

/** Chuỗi số nguyên của DetailRow → number; ném khi không phải số nguyên an toàn (không làm tròn lặng lẽ). */
function toAmount(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`Số tiền không hợp lệ hoặc vượt giới hạn: "${value}"`);
  return n === 0 ? 0 : n; // bỏ -0
}

function addInto(acc: PivotAmounts, add: PivotAmounts): void {
  for (const key of PIVOT_AMOUNT_KEYS) acc[key] += add[key];
}

function rowAmounts(row: DetailRow): PivotAmounts {
  const out = zeroAmounts();
  for (const key of PIVOT_AMOUNT_KEYS) out[key] = toAmount(row[key]);
  return out;
}

interface NodeRef {
  key: string;
  id: number | null;
  name: string;
}

function partyRef(row: DetailRow): NodeRef {
  return { key: `ncc:${row.partyId}`, id: row.partyId, name: row.partyName };
}

function projectRef(row: DetailRow): NodeRef {
  if (row.projectId == null) return { key: "ct:none", id: null, name: UNASSIGNED_PROJECT_LABEL };
  return { key: `ct:${row.projectId}`, id: row.projectId, name: row.projectName ?? `#${row.projectId}` };
}

/** Theo tên (tiếng Việt), nhóm chưa gán công trình luôn cuối; trùng tên thì theo id. */
function compareNodes(a: NodeRef, b: NodeRef): number {
  if (a.id == null || b.id == null) return a.id == null ? (b.id == null ? 0 : 1) : -1;
  return a.name.localeCompare(b.name, "vi") || a.id - b.id;
}

/**
 * Gom dòng `queryDetailReport` thành bảng hai cấp. Σ dòng con = tổng nhóm, Σ nhóm = tổng chung,
 * và tổng chung không phụ thuộc chiều xoay.
 */
export function buildProjectPivot(rows: readonly DetailRow[], groupBy: PivotGroupBy): ProjectPivot {
  const groups = new Map<string, { node: PivotGroup; children: Map<string, PivotNode> }>();
  const total = zeroAmounts();

  for (const row of rows) {
    const amounts = rowAmounts(row);
    const party = partyRef(row);
    const project = projectRef(row);
    const [level1, level2] = groupBy === "ncc" ? [party, project] : [project, party];

    let group = groups.get(level1.key);
    if (!group) {
      group = { node: { ...level1, amounts: zeroAmounts(), children: [] }, children: new Map() };
      groups.set(level1.key, group);
    }
    let child = group.children.get(level2.key);
    if (!child) {
      child = { ...level2, amounts: zeroAmounts() };
      group.children.set(level2.key, child);
    }

    addInto(child.amounts, amounts);
    addInto(group.node.amounts, amounts);
    addInto(total, amounts);
  }

  const sortedGroups = [...groups.values()]
    .map(({ node, children }) => ({ ...node, children: [...children.values()].sort(compareNodes) }))
    .sort(compareNodes);

  return { groupBy, groups: sortedGroups, total };
}
