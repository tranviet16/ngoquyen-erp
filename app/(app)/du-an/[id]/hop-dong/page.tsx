import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listContracts } from "@/lib/du-an/contract-service";
import { getSettings } from "@/lib/du-an/settings-service";
import { serializeDecimals } from "@/lib/serialize";
import { HopDongClient } from "./hop-dong-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HopDongPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [contracts, settings, canCreate, canEdit] = await Promise.all([
    listContracts(projectId),
    getSettings(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  const warningDays = settings?.contractWarningDays ?? 90;

  return (
    <Suspense>
      <HopDongClient projectId={projectId} initialData={serializeDecimals(contracts)} warningDays={warningDays} canCreate={canCreate} canEdit={canEdit} canDelete={canEdit} />
    </Suspense>
  );
}
