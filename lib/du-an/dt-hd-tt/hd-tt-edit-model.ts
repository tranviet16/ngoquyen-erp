/**
 * Nhập H / S / X / Z (dòng NCC của đầu mối) — dùng chung cho màn HĐ-TT và lưới NCC của trang Đầu mối, để hai màn
 * đọc số giống nhau:
 *   - H / S / X: tiền kiểu Việt Nam qua `parseNumberText(…, "money")` ("1.500" = 1 500, "1.500.000" = 1 500 000);
 *   - Z: chữ đã cắt khoảng trắng, tối đa 1 000 ký tự (như `todoNote: optionalText()` của server);
 *   - ô trống = null (xóa số / việc nhập tay).
 * Nháp của màn HĐ-TT khóa theo `${linkId}:${ô}` (không theo vị trí dòng — NCC mới chèn dòng giữa bảng) và chỉ
 * bỏ khi giá trị server đã bằng nháp. Quyền sửa: `canEditFrom` hỏi `edit` trong phạm vi công trình.
 * Module thuần, an toàn cho bundle client (chỉ import kiểu từ register-schemas).
 */

import type { HdTtRow } from "./hd-tt-report";
import type { CounterpartySupplierPatch } from "./register-schemas";
import { parseNumberText } from "./register-ui";

// ---------------------------------------------------------------------------
// Bản vá của một ô
// ---------------------------------------------------------------------------

/** Ba cột tiền nhập tay của dòng NCC. */
export type SupplierMoneyColumn = "paidOverrideVnd" | "splitActualVnd" | "recoveredVnd";

const MONEY_LABEL: Record<SupplierMoneyColumn, string> = {
  paidOverrideVnd: "H thực nộp rà soát",
  splitActualVnd: "S thực tế riêng",
  recoveredVnd: "X đã lấy về",
};

/**
 * Bản vá H / S / X từ giá trị ô (lưới Đầu mối và màn HĐ-TT). Chữ đọc kiểu tiền Việt Nam; số (lưới có thể đưa số
 * thô) giữ nguyên, để "1500.5" không bị đọc thành 15 005.
 */
export function supplierCellPatch(col: SupplierMoneyColumn, value: unknown): CounterpartySupplierPatch {
  const label = MONEY_LABEL[col];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label}: "${value}" không phải số`);
    return { [col]: value };
  }
  return { [col]: parseNumberText(String(value ?? ""), label, "money") };
}

export const HD_TT_EDIT_FIELDS = ["H", "S", "X", "Z"] as const;
export type HdTtEditField = (typeof HD_TT_EDIT_FIELDS)[number];

const FIELD_COLUMN: Record<Exclude<HdTtEditField, "Z">, SupplierMoneyColumn> = { H: "paidOverrideVnd", S: "splitActualVnd", X: "recoveredVnd" };

/** Nhãn ô nhập (aria-label, thông báo lỗi). */
export const EDIT_FIELD_LABELS: Record<HdTtEditField, string> = {
  H: MONEY_LABEL.paidOverrideVnd, S: MONEY_LABEL.splitActualVnd, X: MONEY_LABEL.recoveredVnd, Z: "Z việc cần làm",
};

/** Z dài tối đa (như `optionalText()` của register-schemas). */
export const TODO_MAX_CHARS = 1000;

/** Bản vá của một ô HĐ-TT từ chữ đã gõ. Ném lỗi (thông báo tiếng Việt) khi chữ không đọc được. */
export function hdTtCellPatch(field: HdTtEditField, text: string): CounterpartySupplierPatch {
  if (field !== "Z") return supplierCellPatch(FIELD_COLUMN[field], text);
  const note = text.trim();
  if (note.length > TODO_MAX_CHARS) throw new Error(`${EDIT_FIELD_LABELS.Z}: tối đa ${TODO_MAX_CHARS} ký tự (đang có ${note.length})`);
  return { todoNote: note === "" ? null : note };
}

/** Giá trị đang lưu của ô (H / S / X là số nhập tay, không phải số báo cáo tính ra). */
export function storedValue(row: HdTtRow, field: HdTtEditField): number | string | null {
  if (field === "H") return row.paidOverride;
  if (field === "S") return row.split;
  if (field === "X") return row.recovered;
  return row.todo;
}

/** Chữ của ô khi chưa có nháp: số thô không dấu nghìn, phần lẻ bằng dấu phẩy — parser tiền đọc lại đúng số đó. */
export function storedText(row: HdTtRow, field: HdTtEditField): string {
  const v = storedValue(row, field);
  if (v === null) return "";
  return typeof v === "number" ? String(v).replace(".", ",") : v;
}

/** Chữ đã gõ đọc ra đúng giá trị đang lưu (chữ không đọc được → không bằng). */
export function textMatchesStored(row: HdTtRow, field: HdTtEditField, text: string): boolean {
  let patch: CounterpartySupplierPatch;
  try {
    patch = hdTtCellPatch(field, text);
  } catch {
    return false;
  }
  return Object.values(patch)[0] === storedValue(row, field);
}

// ---------------------------------------------------------------------------
// Nháp
// ---------------------------------------------------------------------------

export interface CellDraft {
  text: string;
  /** Thông báo lỗi của lần lưu gần nhất; null = chưa lưu hoặc đang lưu. */
  error: string | null;
}

export type Drafts = Readonly<Record<string, CellDraft>>;

export const draftKey = (linkId: number, field: HdTtEditField): string => `${linkId}:${field}`;

function parseDraftKey(key: string): { linkId: number; field: HdTtEditField } | null {
  const m = /^(\d+):([HSXZ])$/.exec(key);
  return m ? { linkId: Number(m[1]), field: m[2] as HdTtEditField } : null;
}

/**
 * Nháp sau một lần render lại với dòng server mới: nháp nào đã bằng giá trị server (đã lưu xong) thì bỏ, còn lại
 * giữ nguyên — kể cả nháp lưu lỗi và nháp của dòng NCC không còn (để người dùng thấy và chép lại). Tìm dòng theo
 * `linkId`, nên thứ tự dòng đổi không làm nháp nhảy sang dòng khác.
 */
export function mergeDrafts(drafts: Drafts, rows: readonly HdTtRow[]): Record<string, CellDraft> {
  const byLink = new Map<number, HdTtRow>();
  for (const r of rows) if (r.linkId !== null) byLink.set(r.linkId, r);
  const out: Record<string, CellDraft> = {};
  for (const [key, draft] of Object.entries(drafts)) {
    const at = parseDraftKey(key);
    const row = at ? byLink.get(at.linkId) : undefined;
    if (at && row && textMatchesStored(row, at.field, draft.text)) continue;
    out[key] = draft;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Quyền sửa
// ---------------------------------------------------------------------------

export interface EditAccessRequest {
  minLevel: "edit";
  scope: { kind: "project"; projectId: number };
}

/** Hàm kiểm quyền theo hợp đồng của `canAccessEntitlement` (lib/acl/effective.ts), truyền vào để module này thuần. */
export type EntitlementCheck = (userId: string, moduleKey: "du-an", opts: EditAccessRequest) => Promise<boolean>;

/** Người dùng sửa được H / S / X / Z của công trình: quyền `edit` của module du-an trong phạm vi công trình. */
export function canEditFrom(check: EntitlementCheck, userId: string, projectId: number): Promise<boolean> {
  return check(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } });
}
