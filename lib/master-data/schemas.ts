import { z } from "zod";

export const entitySchema = z.object({
  name: z.string().min(1, "Tên không được để trống"),
  type: z.enum(["company", "person"]),
  note: z.string().optional(),
});

export const supplierSchema = z.object({
  name: z.string().min(1, "Tên không được để trống"),
  taxCode: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const contractorSchema = z.object({
  name: z.string().min(1, "Tên không được để trống"),
  leader: z.string().optional(),
  contact: z.string().optional(),
});

export const projectSchema = z.object({
  code: z.string().min(1, "Mã dự án không được để trống"),
  name: z.string().min(1, "Tên không được để trống"),
  ownerInvestor: z.string().optional(),
  contractValue: z
    .string()
    .optional()
    .refine((v) => v === undefined || v === "" || (!isNaN(Number(v)) && Number(v) >= 0), {
      message: "Giá trị hợp đồng phải là số không âm",
    }),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["active", "completed", "paused"]).default("active"),
}).refine(
  (d) => !d.startDate || !d.endDate || new Date(d.startDate) <= new Date(d.endDate),
  { message: "Ngày bắt đầu phải <= ngày kết thúc", path: ["endDate"] },
);

export const categorySchema = z.object({
  code: z.string().min(1, "Mã hạng mục không được để trống"),
  name: z.string().min(1, "Tên không được để trống"),
  sortOrder: z.number().int().default(0),
});

export const itemSchema = z.object({
  code: z.string().min(1, "Mã không được để trống"),
  name: z.string().min(1, "Tên không được để trống"),
  unit: z.string().min(1, "Đơn vị không được để trống"),
  type: z.enum(["material", "labor", "machine"]),
  note: z.string().optional(),
});

export type EntityInput = z.infer<typeof entitySchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type ContractorInput = z.infer<typeof contractorSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ItemInput = z.infer<typeof itemSchema>;
