import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HoSoClient } from "./ho-so-client";

export const dynamic = "force-dynamic";

export default async function HoSoPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { department: true },
  });
  if (!user) redirect("/login");

  return (
    <HoSoClient
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        isLeader: user.isLeader,
        isDirector: user.isDirector,
        department: user.department
          ? { code: user.department.code, name: user.department.name }
          : null,
      }}
    />
  );
}
