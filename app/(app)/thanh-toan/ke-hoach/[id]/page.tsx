import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRound } from "@/lib/payment/payment-service";
import { canAccess } from "@/lib/acl/effective";
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

  const [round, entities, suppliers, projects, dbUser] = await Promise.all([
    getRound(Number(id)),
    prisma.entity.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
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

  const deptScope = round.departmentId === null
    ? { kind: "dept" as const, deptId: -1 }
    : { kind: "dept" as const, deptId: round.departmentId };
  const [canCreateItem, canEdit] = await Promise.all([
    canAccess(session.user.id, "thanh-toan.ke-hoach", { minLevel: "create", scope: deptScope }),
    canAccess(session.user.id, "thanh-toan.ke-hoach", { minLevel: "edit", scope: deptScope }),
  ]);

  const actorRole: string | null = dbUser?.role ?? session.user.role ?? null;
  const isAdmin = actorRole === "admin";
  // Prisma Decimal instances are not serializable across the Server → Client boundary.
  // Keep the database representation in the service layer and send plain numbers to the UI.
  const clientRound = {
    ...round,
    items: round.items.map((item) => ({
      ...item,
      congNo: Number(item.congNo),
      luyKe: Number(item.luyKe),
      soDeNghi: Number(item.soDeNghi),
      soDuyet: item.soDuyet === null ? null : Number(item.soDuyet),
    })),
  };

  return (
    <RoundDetailClient
      round={clientRound}
      entities={entities}
      suppliers={suppliers}
      projects={projects}
      isAdmin={isAdmin}
      canCreateItem={canCreateItem && round.status === "draft"}
      canEdit={canEdit && round.status === "draft"}
      canApprove={Boolean(isAdmin || dbUser?.isDirector) && round.status === "submitted"}
      canClose={isAdmin && round.status === "approved"}
    />
  );
}
