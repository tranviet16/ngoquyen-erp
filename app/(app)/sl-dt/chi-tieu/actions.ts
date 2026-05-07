"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { progressStatusSchema, type ProgressStatusInput } from "@/lib/sl-dt/schemas";

export async function updateProgressStatus(input: ProgressStatusInput) {
  const data = progressStatusSchema.parse(input);

  await prisma.slDtProgressStatus.upsert({
    where: { lotId_year_month: { lotId: data.lotId, year: data.year, month: data.month } },
    update: {
      milestoneText: data.milestoneText ?? null,
      targetMilestone: data.targetMilestone ?? null,
      settlementStatus: data.settlementStatus ?? null,
      khungBtct: data.khungBtct ?? null,
      xayTuong: data.xayTuong ?? null,
      tratNgoai: data.tratNgoai ?? null,
      xayTho: data.xayTho ?? null,
      tratHoanThien: data.tratHoanThien ?? null,
      hoSoQuyetToan: data.hoSoQuyetToan ?? null,
      ghiChu: data.ghiChu ?? null,
      updatedAt: new Date(),
    },
    create: {
      lotId: data.lotId,
      year: data.year,
      month: data.month,
      milestoneText: data.milestoneText ?? null,
      targetMilestone: data.targetMilestone ?? null,
      settlementStatus: data.settlementStatus ?? null,
      khungBtct: data.khungBtct ?? null,
      xayTuong: data.xayTuong ?? null,
      tratNgoai: data.tratNgoai ?? null,
      xayTho: data.xayTho ?? null,
      tratHoanThien: data.tratHoanThien ?? null,
      hoSoQuyetToan: data.hoSoQuyetToan ?? null,
      ghiChu: data.ghiChu ?? null,
    },
  });

  revalidatePath("/sl-dt/chi-tieu");
  revalidatePath("/sl-dt/tien-do-xd");
}
