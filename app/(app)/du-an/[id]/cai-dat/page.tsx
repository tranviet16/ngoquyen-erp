import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSettings } from "@/lib/du-an/settings-service";
import { CaiDatClient } from "./cai-dat-client";
import { serializeDecimals } from "@/lib/serialize";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CaiDatPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const canEdit = await canAccessEntitlement(userId, "du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId },
  });

  const settings = await getSettings(projectId);

  return (
    <Suspense>
      <CaiDatClient projectId={projectId} initialSettings={serializeDecimals(settings)} canEdit={canEdit} />
    </Suspense>
  );
}
