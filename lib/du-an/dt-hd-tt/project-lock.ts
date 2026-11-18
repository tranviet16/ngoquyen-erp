/**
 * Khóa advisory theo công trình cho sổ "Đối chiếu DT-HĐ-TT" (hóa đơn, thực tế nhập, chi thực tế,
 * ánh xạ, đầu mối) và cho các dòng dự toán / giao dịch mà import của sổ này thay thế.
 *
 * Mọi đường ghi vào các bảng đó (import commit, hoàn tác, màn nhập liệu, màn ánh xạ) lấy khóa này
 * trước khi kiểm rồi ghi, để import, hoàn tác và nhập tay không xen kẽ nhau. Nhiều công trình → khóa
 * theo id tăng dần để không deadlock.
 */

import type { prisma } from "@/lib/prisma";

export type ProjectLockClient = Pick<typeof prisma, "$executeRaw">;

export async function lockProjectDtHdTt(client: ProjectLockClient, projectIds: Iterable<number>): Promise<void> {
  const ids = [...new Set(projectIds)].sort((a, b) => a - b);
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) throw new Error(`Mã công trình không hợp lệ: ${id}`);
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`du-an-dt-hd-tt:${id}`}))`;
  }
}
