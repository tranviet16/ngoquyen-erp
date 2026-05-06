import { z } from "zod";

export const progressStatusSchema = z.object({
  lotId: z.number().int().positive(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  milestoneText: z.string().nullable().optional(),
  settlementStatus: z.string().nullable().optional(),
  khungBtct: z.string().nullable().optional(),
  xayTuong: z.string().nullable().optional(),
  tratNgoai: z.string().nullable().optional(),
  xayTho: z.string().nullable().optional(),
  tratHoanThien: z.string().nullable().optional(),
  hoSoQuyetToan: z.string().nullable().optional(),
  ghiChu: z.string().nullable().optional(),
});

export const paymentPlanSchema = z.object({
  lotId: z.number().int().positive(),
  dot1Amount: z.number().min(0).default(0),
  dot1Milestone: z.string().nullable().optional(),
  dot2Amount: z.number().min(0).default(0),
  dot2Milestone: z.string().nullable().optional(),
  dot3Amount: z.number().min(0).default(0),
  dot3Milestone: z.string().nullable().optional(),
  dot4Amount: z.number().min(0).default(0),
  dot4Milestone: z.string().nullable().optional(),
});

export const milestoneScoreSchema = z.object({
  milestoneText: z.string().min(1, "Tên mốc không được để trống"),
  score: z.number().int().min(0).max(100),
  sortOrder: z.number().int().min(0).default(0),
});

export type ProgressStatusInput = z.infer<typeof progressStatusSchema>;
export type PaymentPlanInput = z.infer<typeof paymentPlanSchema>;
export type MilestoneScoreInput = z.infer<typeof milestoneScoreSchema>;
