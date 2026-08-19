"use server";

/**
 * Gán lại cả cụm giao dịch "ngoài dự toán" (cùng categoryId + itemCode) sang một
 * dòng dự toán đích, để chúng tham gia join của vw_project_norm/cân đối.
 * Vết chuyển được ghi vào đầu cột note ("gán từ <mã cũ>") — không có audit subsystem.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";

export async function reassignTransactionCluster(
  projectId: number,
  fromCategoryId: number,
  fromItemCode: string,
  toEstimateId: number,
): Promise<{ moved: number }> {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId },
  });

  const target = await prisma.projectEstimate.findFirst({
    where: { id: toEstimateId, projectId, deletedAt: null },
    select: { categoryId: true, itemCode: true },
  });
  if (!target) throw new Error("Dòng dự toán đích không tồn tại trong dự án này");

  const fromCategory = await prisma.projectCategory.findFirst({
    where: { id: fromCategoryId, projectId },
    select: { code: true },
  });
  const oldLabel = `${fromCategory?.code ?? fromCategoryId}/${fromItemCode}`;

  if (target.categoryId === fromCategoryId && target.itemCode === fromItemCode) {
    return { moved: 0 };
  }

  // Note-append cần CONCAT nên dùng raw SQL; mọi giá trị đi qua tagged template.
  const moved = await prisma.$executeRaw`
    UPDATE project_transactions
    SET "categoryId" = ${target.categoryId},
        "itemCode" = ${target.itemCode},
        note = CONCAT_WS(' | ', ${"gán từ " + oldLabel}, note),
        "updatedAt" = NOW()
    WHERE "projectId" = ${projectId}
      AND "categoryId" = ${fromCategoryId}
      AND "itemCode" = ${fromItemCode}
      AND "deletedAt" IS NULL
  `;

  revalidatePath(`/du-an/${projectId}/can-doi-vat-tu`);
  revalidatePath(`/du-an/${projectId}/giao-dich`);
  revalidatePath(`/du-an/${projectId}/dinh-muc`);
  return { moved };
}
