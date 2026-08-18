import { notFound } from "next/navigation";
import { listCanDoiVatTu } from "@/lib/du-an/can-doi-service";
import { serializeDecimals } from "@/lib/serialize";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { CanDoiVatTuClient } from "./can-doi-vat-tu-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CanDoiVatTuPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [data, canEdit] = await Promise.all([
    listCanDoiVatTu(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return <CanDoiVatTuClient projectId={projectId} data={serializeDecimals(data)} canEdit={canEdit} />;
}
