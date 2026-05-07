import { z } from "zod";

export const PRIORITIES = ["cao", "trung_binh", "thap"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const createDraftSchema = z.object({
  executorDeptId: z.coerce.number().int().positive(),
  content: z.string().min(10, "Nội dung tối thiểu 10 ký tự").max(2000, "Nội dung tối đa 2000 ký tự"),
  priority: z.enum(PRIORITIES).default("trung_binh"),
  deadline: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
});

export type CreateDraftInput = z.infer<typeof createDraftSchema>;

export const updateDraftSchema = createDraftSchema.partial();
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;

export const rejectSchema = z.object({
  comment: z.string().min(5, "Lý do tối thiểu 5 ký tự").max(500, "Lý do tối đa 500 ký tự"),
});
export type RejectInput = z.infer<typeof rejectSchema>;
