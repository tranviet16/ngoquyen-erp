import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listTransactions } from "@/lib/du-an/transaction-service";
import { queryProjectById } from "@/lib/master-data/project-query";
import { serializeDecimals } from "@/lib/serialize";
import { GiaoDichClient } from "./giao-dich-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GiaoDichPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId, role } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [transactions, project, canCreate, canEdit] = await Promise.all([
    listTransactions(projectId),
    queryProjectById(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return (
    <Suspense>
      <GiaoDichClient projectId={projectId} initialData={serializeDecimals(transactions)} categories={project?.categories ?? []} canCreate={canCreate} canEdit={canEdit} canDelete={canEdit} isAdmin={role === "admin"} />
    </Suspense>
  );
}
