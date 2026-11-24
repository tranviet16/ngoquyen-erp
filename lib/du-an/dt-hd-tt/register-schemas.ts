/**
 * Dữ liệu nhập của các màn đăng ký "Đối chiếu DT-HĐ-TT": Mã nhóm, đầu mối (dòng Phần II DT-TT) và NCC
 * của đầu mối (dòng HĐ-TT với các ô nhập tay H, S, X, Z). Module thuần — client dùng kiểu + nhãn,
 * server dùng để parse.
 *
 * Sửa theo kiểu "vá": client chỉ gửi các trường vừa đổi; server đọc lại dòng dưới khóa công trình,
 * trộn bản vá (`mergePatch`) rồi kiểm cả dòng bằng schema đầy đủ — sửa đồng thời ở ô khác không bị
 * ghi đè bằng dữ liệu cũ của client.
 */

import { z } from "zod";
import { entryIdSchema, PAYMENT_SECTIONS } from "./entry-schemas";
import { ACTUAL_BASES, COUNTERPARTY_KINDS } from "./register-ui";

const MAX_MONEY = 1e15; // vừa Decimal(18,2)

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} không được để trống`).max(max, `${label} quá dài`);
const optionalText = (max = 1000) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optionalMoney = z.number().min(-MAX_MONEY).max(MAX_MONEY).nullish().transform((v) => v ?? null);
const optionalRef = entryIdSchema.nullish().transform((v) => v ?? null);
const sortOrder = z.number().int("Thứ tự phải là số nguyên").min(0).max(1_000_000).nullish().transform((v) => v ?? 0);

/**
 * Bản vá chỉ được chạm các trường sửa được (kiểm TRƯỚC khi đọc dòng): trường lạ — projectId,
 * source, supplierId… — bị từ chối thay vì lặng lẽ bỏ qua.
 */
export function assertPatchKeys(patch: unknown, editable: readonly string[]): void {
  if (patch === null || patch === undefined) return;
  if (typeof patch !== "object" || Array.isArray(patch)) throw new Error("Dữ liệu sửa không hợp lệ");
  for (const key of Object.keys(patch)) {
    if (!editable.includes(key)) throw new Error(`Trường "${key}" không sửa được`);
  }
}

/**
 * Trộn bản vá vào dòng đang lưu: chỉ các trường có trong dòng, giá trị `undefined` = giữ nguyên,
 * `null` = xóa giá trị. Trường lạ trong bản vá bị bỏ qua.
 */
export function mergePatch<T extends object>(current: T, patch: Partial<T> | null | undefined): T {
  const out: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value !== undefined && Object.prototype.hasOwnProperty.call(current, key)) out[key] = value;
  }
  return out as T;
}

// ─── Mã nhóm ────────────────────────────────────────────────────────────────

export const groupCodeFieldsSchema = z.object({
  code: requiredText("Mã nhóm", 50),
  name: requiredText("Tên nhóm", 300),
  /** NCC phụ trách = đầu mối của công trình. */
  counterpartyId: optionalRef,
  isMainMaterial: z.boolean().nullish().transform((v) => v ?? false),
  sortOrder,
  note: optionalText(),
});
export const groupCodeCreateSchema = groupCodeFieldsSchema.extend({ projectId: entryIdSchema });

export type GroupCodeFields = z.input<typeof groupCodeFieldsSchema>;
export type GroupCodeCreateInput = z.input<typeof groupCodeCreateSchema>;
export type GroupCodePatch = Partial<GroupCodeFields>;

// ─── Đầu mối ────────────────────────────────────────────────────────────────

export const counterpartyFieldsSchema = z.object({
  name: requiredText("Tên đầu mối", 300),
  kind: z.enum(COUNTERPARTY_KINDS, { message: "Loại đầu mối phải là NCC, Tổ nhân công hoặc Khác" }),
  sortGroup: optionalText(100),
  sortOrder,
  actualBasis: z.enum(ACTUAL_BASES, { message: "Chọn nguồn thực tế" }),
  /** Thực tế chốt nhập tay (dùng khi nguồn = manual); trống = chưa chốt. */
  actualManualVnd: optionalMoney,
  /** Mục sổ chi cộng vào thực tế khi nguồn = payments; trống = các khoản chi gắn đầu mối. */
  paymentSection: z.enum(PAYMENT_SECTIONS, { message: "Mục chi phải là I–IV" }).nullish().transform((v) => v ?? null),
  note: optionalText(),
});
export const counterpartyCreateSchema = counterpartyFieldsSchema.extend({ projectId: entryIdSchema });

export type CounterpartyFields = z.input<typeof counterpartyFieldsSchema>;
export type CounterpartyCreateInput = z.input<typeof counterpartyCreateSchema>;
export type CounterpartyPatch = Partial<CounterpartyFields>;

// ─── NCC của đầu mối (dòng HĐ-TT) ───────────────────────────────────────────

/** Thêm NCC vào đầu mối (cần `create`): chỉ liên kết; các ô H / S / X / Z nhập sau (cần `edit`). */
export const counterpartySupplierCreateSchema = z.object({
  projectId: entryIdSchema,
  /** null = NCC không thuộc đầu mối nào (dòng HĐ-TT có T = 0 nhưng giữ được H / X). */
  counterpartyId: optionalRef,
  supplierId: entryIdSchema,
  note: optionalText(),
});

export const counterpartySupplierFieldsSchema = z.object({
  counterpartyId: optionalRef,
  /** S: thực tế riêng NCC khi một đầu mối có nhiều NCC. */
  splitActualVnd: optionalMoney,
  /** H: thực nộp rà soát (trống = theo sổ chi). */
  paidOverrideVnd: optionalMoney,
  /** X: đã lấy về. */
  recoveredVnd: optionalMoney,
  /** Z: việc cần làm. */
  todoNote: optionalText(),
  note: optionalText(),
});

export type CounterpartySupplierCreateInput = z.input<typeof counterpartySupplierCreateSchema>;
export type CounterpartySupplierFields = z.input<typeof counterpartySupplierFieldsSchema>;
export type CounterpartySupplierPatch = Partial<CounterpartySupplierFields>;
