import { z } from "zod";

export const slDtTargetSchema = z.object({
  projectId: z.number().int().positive(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  slTarget: z.number().min(0, "Chỉ tiêu SL không được âm"),
  dtTarget: z.number().min(0, "Chỉ tiêu DT không được âm"),
  note: z.string().optional(),
});

export const paymentScheduleSchema = z.object({
  projectId: z.number().int().positive(),
  batch: z.string().min(1, "Tên đợt không được để trống"),
  planDate: z.string().min(1, "Ngày kế hoạch không được để trống"),
  planAmount: z.number().min(0, "Số tiền kế hoạch không được âm"),
  actualDate: z.string().optional(),
  actualAmount: z.number().min(0).optional(),
  status: z.enum(["pending", "paid", "overdue"]),
  note: z.string().optional(),
});

export type SlDtTargetInput = z.infer<typeof slDtTargetSchema>;
export type PaymentScheduleInput = z.infer<typeof paymentScheduleSchema>;
