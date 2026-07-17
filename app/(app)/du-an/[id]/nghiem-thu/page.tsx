import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listAcceptances } from "@/lib/du-an/acceptance-service";
import { queryProjectById } from "@/lib/master-data/project-query";
import { serializeDecimals } from "@/lib/serialize";
import { NghiemThuClient } from "./nghiem-thu-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NghiemThuPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId, role } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [acceptances, project, canCreate, canEdit] = await Promise.all([
    listAcceptances(projectId),
    queryProjectById(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return (
    <Suspense>
      <NghiemThuClient projectId={projectId} initialData={serializeDecimals(acceptances)} categories={project?.categories ?? []} canCreate={canCreate} canEdit={canEdit} canDelete={canEdit} isAdmin={role === "admin"} />
    </Suspense>
  );
}
