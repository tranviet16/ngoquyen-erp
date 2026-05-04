import { z } from "zod";

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
  transactionType: z.enum(["lay_hang", "nhan_cong", "may_moc"]),
  categoryId: z.number().int().positive(),
  itemCode: z.string().min(1, "Mã hàng không được để trống"),
  itemName: z.string().min(1, "Tên hàng không được để trống"),
  partyName: z.string().optional(),
  qty: z.number().positive("Số lượng phải > 0"),
  unit: z.string().min(1, "Đơn vị không được để trống"),
  unitPriceHd: z.number().min(0),
  unitPriceTt: z.number().min(0),
  invoiceNo: z.string().optional(),
  status: z.enum(["pending", "approved", "paid"]),
  note: z.string().optional(),
});

export const contractSchema = z.object({
  projectId: z.number().int().positive(),
  docName: z.string().min(1, "Tên tài liệu không được để trống"),
  docType: z.enum(["contract", "license"]),
  partyName: z.string().optional(),
  valueVnd: z.number().optional(),
  signedDate: z.string().optional(),
  expiryDate: z.string().optional(),
  status: z.enum(["active", "expired", "terminated"]),
  storage: z.string().optional(),
  note: z.string().optional(),
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
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type AcceptanceInput = z.infer<typeof acceptanceSchema>;
export type EstimateInput = z.infer<typeof estimateSchema>;
export type ChangeOrderInput = z.infer<typeof changeOrderSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type ContractInput = z.infer<typeof contractSchema>;
export type CashflowInput = z.infer<typeof cashflowSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
