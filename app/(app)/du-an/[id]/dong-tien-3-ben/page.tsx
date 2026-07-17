import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listCashflows, getCashflowSummary } from "@/lib/du-an/cashflow-service";
import { serializeDecimals } from "@/lib/serialize";
import { DongTien3BenClient } from "./dong-tien-3-ben-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DongTien3BenPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId, role } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [cashflows, summary, canCreate, canEdit] = await Promise.all([
    listCashflows(projectId),
    getCashflowSummary(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return (
    <Suspense>
      <DongTien3BenClient projectId={projectId} initialData={serializeDecimals(cashflows)} summary={serializeDecimals(summary)} canCreate={canCreate} canEdit={canEdit} canDelete={canEdit} isAdmin={role === "admin"} />
    </Suspense>
  );
}
