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

export async function patchMilestoneScore(id: number, patch: Record<string, unknown>) {
  const current = await prisma.slDtMilestoneScore.findUnique({ where: { id } });
  if (!current) throw new Error(`Mốc #${id} không tồn tại`);
  const merged: MilestoneScoreInput = {
    milestoneText: "milestoneText" in patch ? String(patch.milestoneText ?? "") : current.milestoneText,
    score: "score" in patch ? Number(patch.score ?? 0) : current.score,
    sortOrder: "sortOrder" in patch ? Number(patch.sortOrder ?? 0) : current.sortOrder,
  };
  const data = milestoneScoreSchema.parse(merged);
  const updated = await prisma.slDtMilestoneScore.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
  });
  revalidatePath("/sl-dt/cau-hinh");
  revalidatePath("/sl-dt/chi-tieu");
  return updated;
}

export async function bulkUpsertMilestoneScores(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  const out: unknown[] = [];
  for (const row of rows) {
    const { id, ...rest } = row;
    if (id != null && id > 0) {
      out.push(await patchMilestoneScore(id, rest));
    } else {
      const data = milestoneScoreSchema.parse(rest);
      out.push(await prisma.slDtMilestoneScore.create({ data }));
    }
  }
  revalidatePath("/sl-dt/cau-hinh");
  revalidatePath("/sl-dt/chi-tieu");
  return out;
}

export async function deleteMilestoneScores(ids: number[]) {
  if (!ids.length) return;
  await prisma.slDtMilestoneScore.deleteMany({ where: { id: { in: ids } } });
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
