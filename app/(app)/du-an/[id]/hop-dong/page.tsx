import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { listContracts, listContractorOptions } from "@/lib/du-an/contract-service";
import { listSupplierOptions } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { getSettings } from "@/lib/du-an/settings-service";
import { loadContractListFigures } from "@/lib/du-an/contract-detail/contract-detail-loader";
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

  const [contracts, figures, settings, canCreate, canEdit] = await Promise.all([
    listContracts(projectId),
    loadContractListFigures(projectId),
    getSettings(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  // Danh sách chọn đối tác chỉ cần cho form (tạo / sửa).
  const needsForm = canCreate || canEdit;
  const [supplierOptions, contractorOptions, project] = needsForm
    ? await Promise.all([
        listSupplierOptions(projectId),
        listContractorOptions(projectId),
        prisma.project.findUnique({ where: { id: projectId }, select: { ownerInvestor: true } }),
      ])
    : [[], [], null];

  const warningDays = settings?.contractWarningDays ?? 90;

  return (
    <Suspense>
      <HopDongClient
        projectId={projectId}
        initialData={serializeDecimals(contracts)}
        warningDays={warningDays}
        canCreate={canCreate}
        canEdit={canEdit}
        supplierOptions={supplierOptions}
        contractorOptions={contractorOptions}
        ownerInvestor={project?.ownerInvestor ?? null}
        figures={figures}
      />
    </Suspense>
  );
}
