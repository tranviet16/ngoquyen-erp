import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listReconciliationsDerived } from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { DoiChieuClient } from "./doi-chieu-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function DoiChieuPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });

  const [reconciliations, canCreate, canEdit, isAdmin] = await Promise.all([
    listReconciliationsDerived(id),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "create", scope: "module" }),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" }),
    requireActiveAdmin().then(() => true).catch(() => false),
  ]);

  return (
    <Suspense>
      <DoiChieuClient
        supplierId={id}
        initialData={reconciliations}
        canCreate={canCreate}
        canDelete={canEdit}
        isAdmin={isAdmin}
      />
    </Suspense>
  );
}
