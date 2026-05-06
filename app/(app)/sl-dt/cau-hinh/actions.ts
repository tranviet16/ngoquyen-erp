"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { milestoneScoreSchema, type MilestoneScoreInput } from "@/lib/sl-dt/schemas";
import { z } from "zod";

export async function upsertMilestoneScore(id: number | null, input: MilestoneScoreInput) {
  const data = milestoneScoreSchema.parse(input);

  if (id) {
    await prisma.slDtMilestoneScore.update({
      where: { id },
      data: { milestoneText: data.milestoneText, score: data.score, sortOrder: data.sortOrder, updatedAt: new Date() },
    });
  } else {
    await prisma.slDtMilestoneScore.create({
      data: { milestoneText: data.milestoneText, score: data.score, sortOrder: data.sortOrder },
    });
  }

  revalidatePath("/sl-dt/cau-hinh");
  revalidatePath("/sl-dt/chi-tieu");
}

export async function deleteMilestoneScore(id: number) {
  if (!id || id < 1) throw new Error("Invalid id");
  await prisma.slDtMilestoneScore.delete({ where: { id } });
  revalidatePath("/sl-dt/cau-hinh");
  revalidatePath("/sl-dt/chi-tieu");
}

export async function reorderMilestoneScores(ids: number[]) {
  const schema = z.array(z.number().int().positive());
  const validated = schema.parse(ids);

  await prisma.$transaction(
    validated.map((id, index) =>
      prisma.slDtMilestoneScore.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  revalidatePath("/sl-dt/cau-hinh");
}
