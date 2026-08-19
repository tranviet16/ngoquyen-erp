import { notFound } from "next/navigation";
import { listEstimateAdjusted } from "@/lib/du-an/norm-service";
import { DuToanDieuChinhClient } from "./du-toan-dieu-chinh-client";
import { serializeDecimals } from "@/lib/serialize";
import { requireModuleAccess } from "@/lib/acl/guards";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DuToanDieuChinhPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [rows, categories] = await Promise.all([
    listEstimateAdjusted(projectId),
    prisma.projectCategory.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
  ]);

  return <DuToanDieuChinhClient rows={serializeDecimals(rows)} categories={categories} />;
}
