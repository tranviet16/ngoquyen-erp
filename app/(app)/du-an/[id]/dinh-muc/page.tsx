import { notFound } from "next/navigation";
import { listNorm } from "@/lib/du-an/norm-service";
import { getSettings } from "@/lib/du-an/settings-service";
import { listGroups } from "@/lib/du-an/material-group-service";
import { DinhMucClient } from "./dinh-muc-client";
import { serializeDecimals } from "@/lib/serialize";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DinhMucPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const settings = await getSettings(projectId);
  const thresholds = {
    yellow: Number(settings?.normYellowThreshold ?? 0.8),
    red: Number(settings?.normRedThreshold ?? 0.95),
  };

  const [rows, groups, canEdit] = await Promise.all([
    listNorm(projectId, {
      normYellowThreshold: thresholds.yellow,
      normRedThreshold: thresholds.red,
    }),
    listGroups(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return (
    <DinhMucClient
      projectId={projectId}
      rows={serializeDecimals(rows)}
      groups={groups}
      thresholds={thresholds}
      canEdit={canEdit}
    />
  );
}
