import { z } from "zod";

export const deliverySchema = z.object({
  supplierId: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
  date: z.string().min(1, "Ngày không được để trống"),
  itemId: z.number().int().positive(),
  qty: z.number().positive("Số lượng phải > 0"),
  unit: z.string().min(1, "Đơn vị không được để trống"),
  unitPrice: z.number().nonnegative("Đơn giá phải >= 0").optional(),
  totalAmount: z.number().nonnegative("Thành tiền phải >= 0").optional(),
  cbVatTu: z.string().optional(),
  chiHuyCt: z.string().optional(),
  keToan: z.string().optional(),
  note: z.string().optional(),
});

export type DeliveryInput = z.infer<typeof deliverySchema>;

// Kỳ đối chiếu chỉ là marker (NCC + khoảng kỳ + ghi chú) — mọi số tiền
// đều dẫn xuất từ sổ cái; ký mới đông cứng số vào snapshot.
export const reconciliationSchema = z.object({
  supplierId: z.number().int().positive(),
  periodFrom: z.string().min(1, "Từ ngày không được để trống"),
  periodTo: z.string().min(1, "Đến ngày không được để trống"),
  note: z.string().optional(),
}).refine(
  (d) => new Date(d.periodFrom) <= new Date(d.periodTo),
  { message: "Từ ngày phải <= đến ngày", path: ["periodTo"] },
);

export type ReconciliationInput = z.infer<typeof reconciliationSchema>;
