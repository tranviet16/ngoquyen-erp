/**
 * Đọc dòng dự toán theo khóa và đếm ánh xạ theo Mã nhóm HIỆU LỰC — dùng chung cho service Ánh xạ và
 * Mã nhóm. Không phải server action (không "use server"): chỉ import từ các service.
 */

import type { prisma } from "@/lib/prisma";
import { effectiveGroupResolver } from "./alias-board";
import { groupEstimatesByKey, type DtLine } from "./keys";

/** Dòng dự toán của công trình theo khóa (cùng cách gom với báo cáo). */
export async function loadDtLines(client: Pick<typeof prisma, "projectCategory" | "projectEstimate">, projectId: number): Promise<Map<string, DtLine>> {
  const live = { projectId, deletedAt: null };
  const [categories, estimates] = await Promise.all([
    client.projectCategory.findMany({ where: live, select: { id: true, code: true } }),
    client.projectEstimate.findMany({ where: live, select: { id: true, categoryId: true, itemCode: true, itemName: true, unit: true, qty: true, totalVnd: true } }),
  ]);
  const codeOf = new Map(categories.map((c) => [c.id, c.code]));
  return groupEstimatesByKey(estimates.map((e) => ({ ...e, categoryCode: codeOf.get(e.categoryId) ?? "" })));
}

/** Mã nhóm → số ánh xạ (còn sống) có nhóm hiệu lực là mã đó. */
export async function aliasCountsByGroup(
  client: Pick<typeof prisma, "projectCategory" | "projectEstimate" | "projectItemAlias">,
  projectId: number,
): Promise<Map<number, number>> {
  const [dtLines, aliases] = await Promise.all([
    loadDtLines(client, projectId),
    client.projectItemAlias.findMany({ where: { projectId, deletedAt: null }, select: { source: true, itemKey: true, dtKey: true, groupCodeId: true } }),
  ]);
  const groupOf = effectiveGroupResolver(aliases, new Set(dtLines.keys()));
  const counts = new Map<number, number>();
  for (const alias of aliases) {
    const group = groupOf(alias);
    if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}
