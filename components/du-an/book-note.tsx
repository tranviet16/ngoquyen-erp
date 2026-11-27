/**
 * Ghi chú trên hàng tab "Vật tư & công nợ" của công trình đã dùng sổ đội: Cân Đối VT, Định Mức và Giao Dịch
 * (Sổ dự án) lấy HĐ từ sổ Hóa đơn; Công Nợ NCC và Giao Dịch (Sổ công nợ vật tư) lấy từ sổ Công nợ vật tư. Server component, đặt trong Suspense riêng: đếm lỗi thì chỉ mất ghi chú, không hỏng trang.
 */

import { unstable_rethrow } from "next/navigation";
import { projectUsesBook } from "@/lib/du-an/dt-hd-tt/book-presence";
import { prisma } from "@/lib/prisma";

export async function BookNote({ projectId }: { projectId: number }) {
  try {
    if (!(await projectUsesBook(prisma, projectId))) return null;
  } catch (err) {
    unstable_rethrow(err);
    console.error("[book-note] không đọc được trạng thái sổ của công trình", projectId, err);
    return null;
  }
  return <span className="ml-2 text-xs text-muted-foreground">Cân Đối VT, Định Mức và Giao Dịch (Sổ dự án) lấy HĐ từ sổ Hóa đơn; Công Nợ NCC và Giao Dịch (Sổ công nợ vật tư) lấy từ sổ Công nợ vật tư.</span>;
}
