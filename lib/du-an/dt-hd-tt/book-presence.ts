/**
 * "Công trình đã chuyển sang sổ Đối chiếu DT-HĐ-TT" — một định nghĩa duy nhất, dùng chung cho guard chặn
 * adapter import cũ và cho Dashboard dự án (đọc thực tế từ sổ đội thay vì giao dịch cũ).
 *
 * Công trình dùng sổ khi có ít nhất một trong ba dấu vết của lần import sổ / sổ Hóa đơn:
 * - giao dịch cũ đã bị lần import sổ thay thế (supersededByRunId);
 * - giao dịch còn sống sinh từ một dòng sổ Hóa đơn (sourceInvoiceLineId);
 * - dòng dự toán đã bị lần import sổ thay thế.
 * Không phải server action (không "use server"): chỉ được gọi sau khi caller đã kiểm quyền.
 */

import type { prisma } from "@/lib/prisma";

export type BookPresenceDb = Pick<typeof prisma, "projectTransaction" | "projectEstimate">;

export async function projectUsesBook(db: BookPresenceDb, projectId: number): Promise<boolean> {
  const [tx, est] = await Promise.all([
    db.projectTransaction.count({
      where: { projectId, OR: [{ supersededByRunId: { not: null } }, { sourceInvoiceLineId: { not: null }, deletedAt: null }] },
    }),
    db.projectEstimate.count({ where: { projectId, supersededByRunId: { not: null } } }),
  ]);
  return tx + est > 0;
}
