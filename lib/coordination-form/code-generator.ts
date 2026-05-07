import { prisma } from "@/lib/prisma";

const PREFIX = "PCV";

export async function nextFormCode(now: Date = new Date()): Promise<string> {
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const count = await prisma.coordinationForm.count({
    where: { code: { startsWith: `${PREFIX}-${yyyymm}-` } },
  });
  const seq = String(count + 1).padStart(3, "0");
  return `${PREFIX}-${yyyymm}-${seq}`;
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
