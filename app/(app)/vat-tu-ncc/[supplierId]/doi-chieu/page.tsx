import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listReconciliationsDerived } from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { DoiChieuClient } from "./doi-chieu-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import {
  PairProjectRequired,
  parseProjectIdParam,
  requireActivePairProject,
} from "@/components/vat-tu-ncc/pair-project-required";

interface Props {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function DoiChieuPage({ params, searchParams }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  // Đối chiếu theo cặp NCC × công trình: thiếu công trình thì chọn trước.
  const projectId = parseProjectIdParam((await searchParams).projectId);
  if (projectId == null) return <PairProjectRequired supplierId={id} tab="doi-chieu" />;
  await requireActivePairProject(projectId);

  const [reconciliations, canCreate, canEdit, isAdmin] = await Promise.all([
    listReconciliationsDerived(id, projectId),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "create", scope: "module" }),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" }),
    requireActiveAdmin().then(() => true).catch(() => false),
  ]);

  return (
    <Suspense>
      <DoiChieuClient
        supplierId={id}
        projectId={projectId}
        initialData={reconciliations}
        canCreate={canCreate}
        canDelete={canEdit}
        isAdmin={isAdmin}
      />
    </Suspense>
  );
}
