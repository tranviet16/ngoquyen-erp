/**
 * Khóa kỳ đã ký: khi NCC đã ký xác nhận bảng đối chiếu của một kỳ, mọi ghi mới
 * (phiếu ngày, sự kiện lay_hang/thanh_toan, chốt lại kỳ) có ngày rơi vào kỳ đó
 * đều bị từ chối — chênh lệch phải đi vào dieu_chinh kỳ sau.
 * Đây là guard nghiệp vụ, chạy SAU guard ACL.
 */

import { prisma } from "@/lib/prisma";
import { periodLabel } from "./period";

type PeriodLockClient = Pick<typeof prisma, "supplierReconciliation">;

export async function findSignedPeriodCovering(
  supplierId: number,
  date: Date,
  client: PeriodLockClient = prisma,
) {
  return client.supplierReconciliation.findFirst({
    where: {
      supplierId,
      signedBySupplier: true,
      deletedAt: null,
      periodFrom: { lte: date },
      periodTo: { gte: date },
    },
    select: { id: true, periodFrom: true, periodTo: true },
  });
}

export async function assertPeriodOpen(
  supplierId: number,
  date: Date,
  client: PeriodLockClient = prisma,
) {
  const signed = await findSignedPeriodCovering(supplierId, date, client);
  if (signed) {
    throw new Error(
      `Kỳ ${periodLabel(signed.periodFrom, signed.periodTo)} đã được NCC ký xác nhận — không thể ghi/sửa. ` +
        `Chênh lệch xử lý bằng bút toán điều chỉnh kỳ sau.`,
    );
  }
}
