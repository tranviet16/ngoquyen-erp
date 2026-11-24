/**
 * Dữ liệu nhập tay của ba sổ "Đối chiếu DT-HĐ-TT" (Hóa đơn, Thực tế nhập, Chi thực tế): kiểm hình dạng
 * tại biên server action, gộp bản sửa một phần vào dòng đang lưu, và tính tiền phía server. Module
 * thuần (không truy cập DB). Client chỉ `import type` từ đây (module kéo theo @prisma/client).
 *
 * Quy ước số: làm tròn ĐÚNG như cột lưu trước khi tính — SL 4 chữ số, đơn giá / tiền 2 chữ số, VAT %
 * 4 chữ số (tỷ lệ) — để SL × đơn giá tính trên chính giá trị được lưu.
 *   - Thành tiền trống → SL × đơn giá.
 *   - Tiền VAT trống → thành tiền × VAT %; không có VAT % → 0.
 */

import { z } from "zod";
import { Prisma } from "@prisma/client";

/** Mục của sổ chi (Chi thực tế), như cột H của file. */
export const PAYMENT_SECTIONS = ["I", "II", "III", "IV"] as const;

const MAX_MONEY = 1e15; // vừa Decimal(18,2)
const MAX_QTY = 1e13; // vừa Decimal(18,4)

export const entryIdSchema = z.number().int().positive();

const isRealIsoDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** "YYYY-MM-DD" hoặc trống (null). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD")
  .refine(isRealIsoDate, "Ngày không tồn tại")
  .nullish()
  .transform((v) => v ?? null);

const requiredText = (label: string, max = 500) =>
  z.string().trim().min(1, `${label} không được để trống`).max(max, `${label} quá dài`);

const optionalText = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const unitText = z
  .string()
  .trim()
  .max(50, "ĐVT quá dài")
  .nullish()
  .transform((v) => v ?? "");

/** Làm tròn nửa lên như Postgres khi ghi vào cột numeric(…, dp). */
const roundTo = (dp: number) => (v: number) => new Prisma.Decimal(v).toDecimalPlaces(dp, Prisma.Decimal.ROUND_HALF_UP).toNumber();

const money = z.number({ error: "Số tiền phải là số" }).min(-MAX_MONEY, "Số tiền quá lớn").max(MAX_MONEY, "Số tiền quá lớn");
const optionalMoney = money.nullish().transform((v) => (v == null ? null : roundTo(2)(v)));
const optionalQty = z
  .number({ error: "Số lượng phải là số" })
  .min(-MAX_QTY, "Số lượng quá lớn")
  .max(MAX_QTY, "Số lượng quá lớn")
  .nullish()
  .transform((v) => (v == null ? null : roundTo(4)(v)));
const optionalRef = entryIdSchema.nullish().transform((v) => v ?? null);

/** Thành tiền phải có, hoặc tính được từ SL × đơn giá. */
const amountComputable = (d: { qty: number | null; unitPrice: number | null; amountVnd: number | null }) =>
  d.amountVnd !== null || (d.qty !== null && d.unitPrice !== null);
const AMOUNT_ISSUE = { message: "Nhập thành tiền, hoặc nhập đủ SL và đơn giá", path: ["amountVnd"] };

// ─── Hóa đơn ────────────────────────────────────────────────────────────────

export const invoiceLineSchema = z
  .object({
    projectId: entryIdSchema,
    supplierId: entryIdSchema,
    invoiceNo: requiredText("Số HĐ", 100),
    invoiceDate: isoDate,
    itemName: requiredText("Tên hàng"),
    unit: unitText,
    qty: optionalQty,
    unitPrice: optionalMoney,
    /** Thành tiền chưa VAT; trống → SL × đơn giá. */
    amountVnd: optionalMoney,
    /** VAT dạng tỷ lệ (0,08 = 8 %), làm tròn 4 chữ số như cột Decimal(5,4). */
    vatPct: z
      .number({ error: "VAT % phải là số" })
      .min(0, "VAT % không được âm")
      .max(1, "VAT % tối đa 100")
      .nullish()
      .transform((v) => (v == null ? null : roundTo(4)(v))),
    /** Tiền VAT; trống → thành tiền × VAT %. */
    vatVnd: optionalMoney,
    note: optionalText(),
  })
  .refine(amountComputable, AMOUNT_ISSUE);

export type InvoiceLineInput = z.input<typeof invoiceLineSchema>;
export type InvoiceLineData = z.output<typeof invoiceLineSchema>;
export type InvoiceLinePatch = Partial<Omit<InvoiceLineInput, "projectId">>;

export const INVOICE_PATCH_KEYS = [
  "supplierId", "invoiceNo", "invoiceDate", "itemName", "unit", "qty", "unitPrice", "amountVnd", "vatPct", "vatVnd", "note",
] as const;

// ─── Thực tế nhập ───────────────────────────────────────────────────────────

const receiptFields = {
  projectId: entryIdSchema,
  date: isoDate,
  itemName: requiredText("Tên hàng"),
  unit: unitText,
  qty: optionalQty,
  unitPrice: optionalMoney,
  /** Thành tiền gồm VAT; trống → KL × đơn giá. */
  amountVnd: optionalMoney,
  note: optionalText(),
};

/** Dòng mới bắt buộc chọn đầu mối (Thực tế theo đầu mối của báo cáo DT-TT). */
export const receiptCreateSchema = z
  .object({ ...receiptFields, counterpartyId: entryIdSchema })
  .refine(amountComputable, AMOUNT_ISSUE);

/** Sửa dòng: đầu mối có thể còn trống ở dòng import cũ, nhưng không được xóa đầu mối đã có. */
export const receiptUpdateSchema = z
  .object({ ...receiptFields, counterpartyId: optionalRef })
  .refine(amountComputable, AMOUNT_ISSUE);

export type ReceiptCreateInput = z.input<typeof receiptCreateSchema>;
export type ReceiptUpdateInput = z.input<typeof receiptUpdateSchema>;
export type ReceiptPatch = Partial<Omit<ReceiptUpdateInput, "projectId">>;

export const RECEIPT_PATCH_KEYS = ["date", "itemName", "unit", "qty", "unitPrice", "amountVnd", "counterpartyId", "note"] as const;

// ─── Chi thực tế ────────────────────────────────────────────────────────────

export const paymentSchema = z.object({
  projectId: entryIdSchema,
  date: isoDate,
  content: requiredText("Nội dung"),
  bankVnd: optionalMoney.transform((v) => v ?? 0),
  cashVnd: optionalMoney.transform((v) => v ?? 0),
  section: z.enum(PAYMENT_SECTIONS, { message: "Chọn mục I–IV" }),
  counterpartyId: optionalRef,
  supplierId: optionalRef,
  note: optionalText(),
});

export type PaymentInput = z.input<typeof paymentSchema>;
export type PaymentPatch = Partial<Omit<PaymentInput, "projectId">>;

export const PAYMENT_PATCH_KEYS = ["date", "content", "bankVnd", "cashVnd", "section", "counterpartyId", "supplierId", "note"] as const;

// ─── Sửa một phần ───────────────────────────────────────────────────────────

/**
 * Kiểm bản sửa từ client: object, chỉ gồm các cột sửa được. Giá trị được kiểm sau, khi bản gộp với
 * dòng đang lưu đi qua schema đầy đủ. `undefined` = không sửa cột đó; `null` = xóa ô.
 */
export function readPatch<K extends string>(raw: unknown, keys: readonly K[]): Partial<Record<K, unknown>> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Dữ liệu sửa không hợp lệ");
  const allowed = new Set<string>(keys);
  const out: Partial<Record<K, unknown>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) throw new Error(`Cột "${key}" không sửa được`);
    if (value !== undefined) out[key as K] = value;
  }
  return out;
}

const has = (patch: object, key: string) => key in patch;

/**
 * Gộp bản sửa vào dòng hóa đơn đang lưu (đọc dưới khóa) và đánh dấu số cần tính lại:
 *   - SL / đơn giá đổi (thành tiền không gửi kèm) và đủ cả hai → thành tiền = SL × đơn giá;
 *   - VAT % đổi (tiền VAT không gửi kèm) → tiền VAT = thành tiền × VAT %, xóa VAT % → tiền VAT = 0;
 *   - thành tiền đổi trên dòng có VAT % → tính lại tiền VAT; dòng KHÔNG có VAT % (import chỉ có tiền
 *     VAT) giữ tiền VAT và trả `vatHint` để người dùng kiểm lại.
 */
export function mergeInvoicePatch(current: InvoiceLineInput, patch: Partial<Record<(typeof INVOICE_PATCH_KEYS)[number], unknown>>) {
  const input = { ...current, ...patch } as InvoiceLineInput;
  let amountChanged = has(patch, "amountVnd");
  if (!amountChanged && (has(patch, "qty") || has(patch, "unitPrice")) && input.qty != null && input.unitPrice != null) {
    input.amountVnd = null;
    amountChanged = true;
  }
  let vatHint = false;
  if (!has(patch, "vatVnd")) {
    if (has(patch, "vatPct")) input.vatVnd = input.vatPct == null ? 0 : null;
    else if (amountChanged && input.vatPct != null) input.vatVnd = null;
    else if (amountChanged) vatHint = Number(input.vatVnd ?? 0) !== 0;
  }
  return { input, vatHint };
}

/** Gộp bản sửa vào dòng thực tế nhập: KL / đơn giá đổi và đủ cả hai → thành tiền tính lại. */
export function mergeReceiptPatch(current: ReceiptUpdateInput, patch: Partial<Record<(typeof RECEIPT_PATCH_KEYS)[number], unknown>>): ReceiptUpdateInput {
  const input = { ...current, ...patch } as ReceiptUpdateInput;
  if (!has(patch, "amountVnd") && (has(patch, "qty") || has(patch, "unitPrice")) && input.qty != null && input.unitPrice != null) {
    input.amountVnd = null;
  }
  return input;
}

export function mergePaymentPatch(current: PaymentInput, patch: Partial<Record<(typeof PAYMENT_PATCH_KEYS)[number], unknown>>): PaymentInput {
  return { ...current, ...patch } as PaymentInput;
}

export const VAT_HINT = "Dòng không có VAT % — tiền VAT giữ nguyên, kiểm lại tiền VAT cho khớp thành tiền mới.";

// ─── Tính tiền ──────────────────────────────────────────────────────────────

const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

function assertStorable(amount: Prisma.Decimal, label: string): Prisma.Decimal {
  if (amount.abs().greaterThan(MAX_MONEY)) {
    throw new Error(`${label} vượt giới hạn lưu (tối đa 1.000.000.000.000.000 đ) — kiểm lại SL và đơn giá`);
  }
  return amount;
}

/** Thành tiền: số đã nhập, không có thì SL × đơn giá (từ giá trị đã làm tròn như khi lưu). */
export function resolveAmount(d: { qty: number | null; unitPrice: number | null; amountVnd: number | null }): Prisma.Decimal {
  if (d.amountVnd !== null) return round2(new Prisma.Decimal(d.amountVnd));
  if (d.qty === null || d.unitPrice === null) throw new Error("Nhập thành tiền, hoặc nhập đủ SL và đơn giá");
  return assertStorable(round2(new Prisma.Decimal(d.qty).mul(d.unitPrice)), "Thành tiền (SL × đơn giá)");
}

/** Thành tiền chưa VAT + tiền VAT của một dòng hóa đơn. */
export function resolveInvoiceAmounts(d: Pick<InvoiceLineData, "qty" | "unitPrice" | "amountVnd" | "vatPct" | "vatVnd">): {
  amountVnd: Prisma.Decimal;
  vatVnd: Prisma.Decimal;
} {
  const amountVnd = resolveAmount(d);
  const vatVnd =
    d.vatVnd !== null
      ? round2(new Prisma.Decimal(d.vatVnd))
      : d.vatPct !== null
        ? round2(amountVnd.mul(d.vatPct))
        : new Prisma.Decimal(0);
  return { amountVnd, vatVnd };
}

// ─── Chuyển dữ liệu DB → DTO / input ────────────────────────────────────────

/** Decimal / null → number / null. */
export const decOrNull = (v: { toNumber(): number } | null | undefined): number | null => (v == null ? null : v.toNumber());

/** Ngày (UTC 00:00) → "YYYY-MM-DD"; null giữ null. */
export const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** "YYYY-MM-DD" đã kiểm → Date UTC 00:00 (dạng ngày của sổ, như import). */
export const dayFromIso = (iso: string | null): Date | null => (iso ? new Date(`${iso}T00:00:00Z`) : null);
