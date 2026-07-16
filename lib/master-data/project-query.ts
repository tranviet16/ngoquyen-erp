import { prisma } from "@/lib/prisma";
import { serializeDecimal } from "@/lib/utils/serialize-decimal";

export async function queryProjectById(id: number) {
  const row = await prisma.project.findUnique({
    where: { id },
    include: {
      categories: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  return row ? serializeDecimal(row) : null;
}
