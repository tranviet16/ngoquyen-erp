import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listChangeOrders } from "@/lib/du-an/change-order-service";
import { queryProjectById } from "@/lib/master-data/project-query";
import { serializeDecimals } from "@/lib/serialize";
import { PhatSinhClient } from "./phat-sinh-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PhatSinhPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId, role } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [changeOrders, project, canCreate, canEdit] = await Promise.all([
    listChangeOrders(projectId),
    queryProjectById(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return (
    <Suspense>
      <PhatSinhClient projectId={projectId} initialData={serializeDecimals(changeOrders)} categories={project?.categories ?? []} canCreate={canCreate} canEdit={canEdit} canDelete={canEdit} isAdmin={role === "admin"} />
    </Suspense>
  );
}
