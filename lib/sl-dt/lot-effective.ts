import type { Prisma } from "@prisma/client";

type LotVisibility = "sanLuong" | "doanhThu" | "chiTieu" | "tienDoXd" | "nopTien";

export function activeLotWhere(
  year?: number,
  month?: number,
  visibility?: LotVisibility,
): Prisma.SlDtLotWhereInput {
  const where: Prisma.SlDtLotWhereInput = { deletedAt: null };
  if (visibility === "sanLuong") where.showInSanLuong = true;
  if (visibility === "doanhThu") where.showInDoanhThu = true;
  if (visibility === "chiTieu") where.showInChiTieu = true;
  if (visibility === "tienDoXd") where.showInTienDoXd = true;
  if (visibility === "nopTien") where.showInNopTien = true;
  if (!year || !month) return where;

  return {
    ...where,
    OR: [
      { activeFromYear: null },
      { activeFromYear: { lt: year } },
      { activeFromYear: year, activeFromMonth: { lte: month } },
    ],
  };
}

export function monthKey(year: number, month: number) {
  return year * 12 + month;
}
