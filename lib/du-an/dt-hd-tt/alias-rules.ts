/**
 * Quy tắc ghi một ánh xạ (alias) tên|ĐVT → Mã nhóm / Dòng DT / hệ số của "Đối chiếu DT-HĐ-TT".
 * Module thuần (không truy cập DB, không "use server") — service ghi và màn Ánh xạ dùng chung.
 *
 * - Alias `dt` (một dòng dự toán): mang Mã nhóm + loại (VL / NC / MTC); không có Dòng DT, hệ số; không
 *   thể "Ngoài DT". Bỏ trống loại → loại theo hậu tố của khóa dòng dự toán.
 * - Alias `hd` / `tt`: mang Mã nhóm, Dòng DT, hệ số; không mang loại.
 *   - "Ngoài DT" xóa Mã nhóm, Dòng DT, hệ số (dòng hiện ở phần ngoài dự toán, như import).
 *   - "Xác nhận" cần ít nhất Dòng DT hoặc Mã nhóm.
 *   - Hệ số 0 / trống = theo dõi theo giá trị (null), như cột hệ số của file; hệ số âm hoặc quá nhỏ
 *     (dưới 0,000001) bị từ chối.
 *   - Gán vào Dòng DT → Mã nhóm lưu = Mã nhóm hiện tại của dòng DT.
 * - Xác nhận hàng loạt chỉ chuyển các đề xuất đủ điều kiện xác nhận.
 */

import { z } from "zod";
import { entryIdSchema } from "./entry-schemas";
import type { CostKind } from "./keys";
import { ALIAS_SOURCES, ALIAS_STATUSES, COST_KINDS, type AliasSource } from "./register-ui";
import type { AliasStatus } from "./report-inputs";

export type { AliasSource } from "./register-ui";
export { isBulkConfirmable } from "./register-ui";

/** Vừa cột Decimal(18,6) của hệ số. */
const MAX_FACTOR = 1e12;
const MAX_KEY = 1000;

const mappingFields = {
  groupCodeId: entryIdSchema.nullish().transform((v) => v ?? null),
  dtKey: z.string().max(MAX_KEY).nullish().transform((v) => (v ? v : null)),
  factor: z.number().min(-MAX_FACTOR).max(MAX_FACTOR, "Hệ số quá lớn").nullish().transform((v) => v ?? null),
  kind: z.enum(COST_KINDS, { message: "Loại phải là VL, NC hoặc MTC" }).nullish().transform((v) => v ?? null),
  status: z.enum(ALIAS_STATUSES, { message: "Trạng thái ánh xạ không hợp lệ" }),
  note: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
};

/** Phần ánh xạ của một alias (khi sửa: bản đang lưu đã trộn với các ô vừa đổi). */
export const aliasMappingSchema = z.object(mappingFields);

/** Tạo alias cho một khóa chưa gán: khóa + nguồn do client gửi, tên / ĐVT lấy lại từ sổ phía server. */
export const aliasCreateSchema = z.object({
  projectId: entryIdSchema,
  source: z.enum(ALIAS_SOURCES, { message: "Nguồn ánh xạ phải là dt, hd hoặc tt" }),
  itemKey: z.string().min(1, "Thiếu khóa tên|ĐVT").max(MAX_KEY),
  ...mappingFields,
});

export const aliasConfirmSchema = z.object({
  projectId: entryIdSchema,
  aliasIds: z.array(entryIdSchema).min(1, "Chọn ít nhất một ánh xạ").max(5000, "Xác nhận tối đa 5.000 ánh xạ mỗi lần"),
});

export type AliasCreateInput = z.input<typeof aliasCreateSchema>;
export type AliasMappingInput = z.input<typeof aliasMappingSchema>;
/** Sửa alias: chỉ gửi các trường đổi; trường vắng mặt giữ giá trị đang lưu (đọc lại dưới khóa). */
export type AliasPatch = Partial<AliasMappingInput>;
type MappingData = z.output<typeof aliasMappingSchema>;

/** Phần ánh xạ đã chuẩn hóa, sẵn sàng ghi. */
export interface AliasMapping {
  groupCodeId: number | null;
  dtKey: string | null;
  factor: number | null;
  kind: CostKind | null;
  status: AliasStatus;
  note: string | null;
}

/**
 * Hệ số: trống / 0 → null (theo dõi theo giá trị); âm → lỗi; làm tròn 6 chữ số như cột. Số dương
 * quá nhỏ để còn lại sau khi làm tròn bị từ chối — không lặng lẽ thành "theo giá trị".
 */
export function normalizeFactor(value: number | null): number | null {
  if (value === null || value === 0) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error("Hệ số phải lớn hơn 0 (để trống = theo dõi theo giá trị)");
  if (value > MAX_FACTOR) throw new Error("Hệ số quá lớn");
  const rounded = Number(value.toFixed(6));
  if (rounded === 0) throw new Error("Hệ số quá nhỏ (tối thiểu 0,000001)");
  return rounded;
}

/**
 * Chữ ký vị trí của một alias hd: đổi chữ ký ⇔ vị trí dòng hóa đơn (và giao dịch HĐ sinh từ nó) có
 * thể đổi — Dòng DT, hệ số, Mã nhóm, vào / ra "Ngoài DT". Đổi ghi chú hay đề xuất ↔ xác nhận không
 * đổi chữ ký → không sinh lại giao dịch HĐ. null = chưa có alias ("chưa gán").
 */
export function placementSignature(
  alias: { status: string; dtKey: string | null; factor: number | null; groupCodeId: number | null } | null,
): string {
  if (alias === null) return "chua_gan";
  if (alias.status === "ngoai_dt") return "ngoai_dt";
  return `${alias.dtKey ?? ""}|${alias.factor ?? ""}|${alias.groupCodeId ?? ""}`;
}

/** Loại của một dòng dự toán theo hậu tố khóa (`tên|ĐVT|VL`); null khi khóa không có loại. */
export function kindOfDtKey(dtKey: string): CostKind | null {
  const suffix = dtKey.slice(dtKey.lastIndexOf("|") + 1);
  return (COST_KINDS as readonly string[]).includes(suffix) ? (suffix as CostKind) : null;
}

/** Áp quy tắc theo nguồn + trạng thái; lỗi bằng tiếng Việt khi tổ hợp không hợp lệ. */
export function resolveAliasMapping(source: AliasSource, itemKey: string, m: MappingData): AliasMapping {
  if (source === "dt") {
    if (m.status === "ngoai_dt") throw new Error("Dòng dự toán không đánh dấu Ngoài DT được");
    const kind = m.kind ?? kindOfDtKey(itemKey);
    if (!kind) throw new Error("Chọn loại (VL / NC / MTC) cho dòng dự toán");
    return { groupCodeId: m.groupCodeId, dtKey: null, factor: null, kind, status: m.status, note: m.note };
  }
  if (m.status === "ngoai_dt") {
    return { groupCodeId: null, dtKey: null, factor: null, kind: null, status: "ngoai_dt", note: m.note };
  }
  if (m.status === "xac_nhan" && m.dtKey === null && m.groupCodeId === null) {
    throw new Error("Chọn Dòng DT hoặc Mã nhóm trước khi xác nhận");
  }
  return { groupCodeId: m.groupCodeId, dtKey: m.dtKey, factor: normalizeFactor(m.factor), kind: null, status: m.status, note: m.note };
}

/**
 * Mã nhóm lưu cho alias hd / tt gán vào một Dòng DT còn trong dự toán = Mã nhóm HIỆN TẠI của dòng DT
 * (báo cáo cũng xếp dòng theo nhóm của dòng DT), tính lại ở mỗi lần ghi — bản sao cũ không được tin.
 * `explicit` = nhóm người dùng vừa chọn trong lần ghi này (undefined / null = không chọn); chỉ khi
 * chọn một nhóm khác nhóm của dòng DT mới bị từ chối.
 */
export function groupForDtLine(explicit: number | null | undefined, dtLineGroup: number | null): number | null {
  if (explicit != null && explicit !== dtLineGroup) {
    throw new Error(
      dtLineGroup === null
        ? "Dòng DT đã chọn chưa có Mã nhóm — gán Mã nhóm cho dòng đó ở tab DT, hoặc bỏ chọn Mã nhóm"
        : "Dòng DT đã chọn thuộc Mã nhóm khác — chọn lại Mã nhóm hoặc Dòng DT",
    );
  }
  return dtLineGroup;
}
