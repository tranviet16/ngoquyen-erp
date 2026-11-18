import { z } from "zod";
import { CONTRACT_DOC_TYPES, CONTRACT_PARTY_KINDS, CONTRACT_STATUSES } from "./contract-labels";

export const scheduleSchema = z.object({
  projectId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  taskName: z.string().min(1, "Tên công việc không được để trống"),
  planStart: z.string().min(1, "Ngày bắt đầu kế hoạch không được để trống"),
  planEnd: z.string().min(1, "Ngày kết thúc kế hoạch không được để trống"),
  actualStart: z.string().optional(),
  actualEnd: z.string().optional(),
  pctComplete: z.number().min(0).max(1),
  status: z.enum(["pending", "in_progress", "done", "delayed"]),
  note: z.string().optional(),
}).refine(
  (d) => new Date(d.planStart) <= new Date(d.planEnd),
  { message: "Ngày bắt đầu phải <= ngày kết thúc", path: ["planEnd"] }
);

export const acceptanceSchema = z.object({
  projectId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  checkItem: z.string().min(1, "Hạng mục kiểm tra không được để trống"),
  planEnd: z.string().optional(),
  actualEnd: z.string().optional(),
  inspector: z.string().optional(),
  result: z.enum(["pass", "fail", "partial"]).optional(),
  defectCount: z.number().int().min(0),
  fixRequest: z.string().optional(),
  acceptedAt: z.string().optional(),
  amountCdtVnd: z.number().min(0),
  amountInternalVnd: z.number().min(0),
  acceptanceBatch: z.string().optional(),
  note: z.string().optional(),
});

export const estimateSchema = z.object({
  projectId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  itemCode: z.string().min(1, "Mã vật tư không được để trống"),
  itemName: z.string().min(1, "Tên vật tư không được để trống"),
  unit: z.string().min(1, "Đơn vị không được để trống"),
  qty: z.number().positive("Số lượng phải > 0"),
  unitPrice: z.number().min(0, "Đơn giá không được âm"),
  note: z.string().optional(),
});

export const changeOrderSchema = z.object({
  projectId: z.number().int().positive(),
  date: z.string().min(1, "Ngày không được để trống"),
  coCode: z.string().min(1, "Mã CO không được để trống"),
  description: z.string().min(1, "Mô tả không được để trống"),
  reason: z.string().optional(),
  categoryId: z.number().int().optional(),
  itemCode: z.string().optional(),
  costImpactVnd: z.number(),
  scheduleImpactDays: z.number().int(),
  approvedBy: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]),
  newItemName: z.string().optional(),
  newUnit: z.string().optional(),
  newQty: z.number().optional(),
  newUnitPrice: z.number().optional(),
  note: z.string().optional(),
});

export const transactionSchema = z.object({
  projectId: z.number().int().positive(),
  date: z.string().min(1, "Ngày không được để trống"),
  transactionType: z.enum(["lay_hang", "nhan_cong", "may_moc", "chi_phi_chung"]),
  categoryId: z.number().int().positive(),
  itemCode: z.string().min(1, "Mã hàng không được để trống"),
  itemName: z.string().min(1, "Tên hàng không được để trống"),
  partyName: z.string().optional(),
  qty: z.number().positive("Số lượng phải > 0"),
  qtyHd: z.number().positive("SL hóa đơn phải > 0").optional(),
  unit: z.string().min(1, "Đơn vị không được để trống"),
  unitPriceHd: z.number().min(0),
  unitPriceTt: z.number().min(0),
  invoiceNo: z.string().optional(),
  status: z.enum(["pending", "approved", "paid"]),
  note: z.string().optional(),
});

/**
 * Hợp đồng dự án. Các trường tùy chọn nhận `null` để xóa giá trị. `superRefine` khớp các CHECK của
 * DB (migration 20261118120000): loại đối tác hợp lệ, đúng khóa theo loại, chỉ hợp đồng kinh tế
 * mới gắn đối tác, giá trị theo TT không âm.
 */
/** Ngày dạng YYYY-MM-DD có thật (không nhận 2026-02-30). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ")
  .refine((s) => {
    // Zod vẫn chạy refine khi regex đã trượt: ngày rác cho Invalid Date, toISOString sẽ ném.
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Ngày không hợp lệ");

export const contractSchema = z
  .object({
    projectId: z.number().int().positive(),
    docName: z.string().trim().min(1, "Tên tài liệu không được để trống"),
    docType: z.enum(CONTRACT_DOC_TYPES),
    status: z.enum(CONTRACT_STATUSES),
    partyKind: z.enum(CONTRACT_PARTY_KINDS).nullable().optional(),
    supplierId: z.number().int().positive().nullable().optional(),
    contractorId: z.number().int().positive().nullable().optional(),
    partyName: z.string().nullable().optional(),
    /** Giá trị theo DT (với loại khác hợp đồng kinh tế: "Giá trị"). */
    valueVnd: z.number().finite().nullable().optional(),
    /** Giá trị theo TT. */
    valueTtVnd: z.number().finite().min(0, "Giá trị theo TT không được âm").nullable().optional(),
    signedDate: isoDate.nullable().optional(),
    expiryDate: isoDate.nullable().optional(),
    storage: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    const kind = d.partyKind ?? null;
    if (kind !== null && d.docType !== "contract") {
      ctx.addIssue({ code: "custom", path: ["partyKind"], message: "Chỉ hợp đồng kinh tế mới gắn được đối tác" });
    }
    const hasSupplier = d.supplierId != null;
    const hasContractor = d.contractorId != null;
    if (kind === "ncc" && !hasSupplier) {
      ctx.addIssue({ code: "custom", path: ["supplierId"], message: "Chọn NCC của hợp đồng" });
    }
    if (kind === "doi_thi_cong" && !hasContractor) {
      ctx.addIssue({ code: "custom", path: ["contractorId"], message: "Chọn đội thi công của hợp đồng" });
    }
    if (hasSupplier && kind !== "ncc") {
      ctx.addIssue({ code: "custom", path: ["supplierId"], message: "Chỉ hợp đồng với NCC mới gắn NCC" });
    }
    if (hasContractor && kind !== "doi_thi_cong") {
      ctx.addIssue({ code: "custom", path: ["contractorId"], message: "Chỉ hợp đồng với đội thi công mới gắn đội" });
    }
  });

/**
 * Hóa đơn xuất CĐT (sổ dùng chung cho mọi hợp đồng CĐT của công trình). Số và ký hiệu được trim;
 * giá trị chưa VAT khác 0, được âm (hóa đơn điều chỉnh giảm).
 */
export const cdtInvoiceSchema = z.object({
  projectId: z.number().int().positive(),
  invoiceDate: isoDate,
  invoiceSymbol: z
    .string()
    .nullable()
    .optional()
    .transform((s) => (s?.trim() ? s.trim() : null)),
  invoiceNo: z.string().trim().min(1, "Số hóa đơn không được để trống"),
  amountVnd: z.number().finite().refine((n) => n !== 0, "Giá trị chưa VAT phải khác 0 (hóa đơn điều chỉnh giảm ghi số âm)"),
  vatVnd: z.number().finite().default(0),
  acceptanceBatch: z.string().nullable().optional().transform((s) => (s?.trim() ? s.trim() : null)),
  note: z.string().nullable().optional().transform((s) => (s?.trim() ? s.trim() : null)),
});

export const cashflowSchema = z.object({
  projectId: z.number().int().positive(),
  date: z.string().min(1, "Ngày không được để trống"),
  flowDirection: z.enum(["cdt_to_cty", "cty_to_doi", "doi_to_cty", "cty_to_cdt", "doi_refund"]),
  category: z.enum(["tam_ung", "nop_lai", "thanh_toan", "hoan_ung"]),
  payerName: z.string().min(1, "Bên thanh toán không được để trống"),
  payeeName: z.string().min(1, "Bên nhận không được để trống"),
  amountVnd: z.number().positive("Số tiền phải > 0"),
  batch: z.string().optional(),
  refDoc: z.string().optional(),
  note: z.string().optional(),
});

export const settingsSchema = z.object({
  projectId: z.number().int().positive(),
  vatPct: z.number().min(0).max(1),
  normYellowThreshold: z.number().min(0).max(1),
  normRedThreshold: z.number().min(0).max(1),
  contractWarningDays: z.number().int().min(0),
  managementFeePct: z.number().min(0).max(1),
  teamSharePct: z.number().min(0).max(1),
  // Tỷ lệ Phần III báo cáo DT-TT (Đối chiếu DT-HĐ-TT).
  generalCostPct: z.number().min(0).max(1),
  tempHousingPct: z.number().min(0).max(1),
  unmeasuredPct: z.number().min(0).max(1),
  presumptiveIncomePct: z.number().min(0).max(1),
}).refine(
  (d) => d.normYellowThreshold < d.normRedThreshold,
  { message: "Ngưỡng cảnh báo vàng phải nhỏ hơn ngưỡng cảnh báo đỏ", path: ["normRedThreshold"] }
);

export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type AcceptanceInput = z.infer<typeof acceptanceSchema>;
export type EstimateInput = z.infer<typeof estimateSchema>;
export type ChangeOrderInput = z.infer<typeof changeOrderSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type ContractInput = z.infer<typeof contractSchema>;
export type CashflowInput = z.infer<typeof cashflowSchema>;
export type CdtInvoiceInput = z.input<typeof cdtInvoiceSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
