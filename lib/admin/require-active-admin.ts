import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireActiveAdmin(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });
  if (user?.role !== "admin") throw new Error("Chỉ admin được thao tác");
  if (!user?.isActive) throw new Error("Tài khoản đã bị vô hiệu hóa");
  return session.user.id;
}
