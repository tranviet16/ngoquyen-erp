import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRound } from "@/lib/payment/payment-service";
import { RoundDetailClient } from "./round-detail-client";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) notFound();

  const [round, suppliers, projects, dbUser] = await Promise.all([
    getRound(Number(id)),
    prisma.supplier.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isDirector: true, isLeader: true, role: true },
    }),
  ]);
  if (!round) notFound();

  return (
    <RoundDetailClient
      round={round}
      suppliers={suppliers}
      projects={projects}
      currentUser={{
        id: session.user.id,
        role: dbUser?.role ?? session.user.role ?? null,
        isDirector: dbUser?.isDirector ?? false,
      }}
    />
  );
}
