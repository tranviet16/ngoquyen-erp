import { z } from "zod";

const decimalString = (label: string) =>
  z
    .string()
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, {
      message: `${label} phải là số không âm`,
    });

const vatPctString = z
  .string()
  .refine((v) => {
    const n = Number(v);
    return !isNaN(n) && n >= 0 && n <= 1;
  }, "VAT % phải từ 0 đến 1 (e.g. 0.1 = 10%)")
  .default("0");

export const transactionSchema = z.object({
  date: z.string().min(1, "Ngày không được để trống"),
  transactionType: z.enum(["lay_hang", "thanh_toan", "dieu_chinh"]),
  entityId: z.number().int().positive("Chủ thể không hợp lệ"),
  partyId: z.number().int().positive("Đội thi công không hợp lệ"),
  projectId: z.number().int().positive().optional().nullable(),
  itemId: z.number().int().positive().optional().nullable(),
  amountTt: decimalString("Số tiền TT"),
  vatPctTt: vatPctString,
  amountHd: decimalString("Số tiền HĐ"),
  vatPctHd: vatPctString,
  invoiceNo: z.string().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  status: z.enum(["pending", "approved", "paid"]).default("pending"),
  note: z.string().optional().nullable(),
});

export const openingBalanceSchema = z.object({
  entityId: z.number().int().positive("Chủ thể không hợp lệ"),
  partyId: z.number().int().positive("Đội thi công không hợp lệ"),
  projectId: z.number().int().positive().optional().nullable(),
  balanceTt: decimalString("Số dư TT"),
  balanceHd: decimalString("Số dư HĐ"),
  asOfDate: z.string().min(1, "Ngày không được để trống"),
  note: z.string().optional().nullable(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>;
