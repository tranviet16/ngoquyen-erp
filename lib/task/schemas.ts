import { z } from "zod";

export const PRIORITIES = ["cao", "trung_binh", "thap"] as const;

export const createTaskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  deptId: z.number().int().positive(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(PRIORITIES).default("trung_binh"),
  deadline: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  deadline: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? new Date(v) : null)),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
