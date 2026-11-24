/**
 * Chặn các adapter cũ ghi dự toán / giao dịch ("bang-can-doi-vat-tu", "du-an-xay-dung") vào công trình
 * đã chuyển sang sổ "Đối chiếu DT-HĐ-TT": ghi thêm sẽ trùng hóa đơn ở các tab cũ, và hoàn tác lần
 * import sổ sau đó sẽ khôi phục giao dịch cũ chồng lên (nhân đôi).
 */

import { projectUsesBook } from "@/lib/du-an/dt-hd-tt/book-presence";
import type { ImportTx } from "../adapter-types";

type Db = Pick<ImportTx, "project" | "projectTransaction" | "projectEstimate">;

export async function legacyImportBlocking(db: Db, projectCode: string): Promise<string[]> {
  const project = await db.project.findFirst({ where: { code: projectCode, deletedAt: null }, select: { id: true } });
  if (!project) return [];
  return (await projectUsesBook(db, project.id))
    ? [`Công trình ${projectCode} đã chuyển sang sổ "Đối chiếu DT-HĐ-TT" — nhập dự toán / hóa đơn ở tab đó, không import file này vào công trình này nữa.`]
    : [];
}
