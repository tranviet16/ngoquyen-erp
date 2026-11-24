import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listEstimates } from "@/lib/du-an/estimate-service";
import { queryProjectById } from "@/lib/master-data/project-query";
import { serializeDecimals } from "@/lib/serialize";
import { toSearchParams } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { DU_TOAN_KINDLESS, kindlessEstimateIds, parseDuToanQuery } from "@/lib/du-an/dt-hd-tt/screen-links";
import { DuToanClient } from "./du-toan-client";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DuToanPage({ params, searchParams }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  const { userId, role } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [estimates, project, canCreate, canEdit, query] = await Promise.all([
    listEstimates(projectId),
    queryProjectById(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
    searchParams,
  ]);
  const categories = project?.categories ?? [];
  // ?loai=thieu (chỉ xem): dòng có hạng mục chưa có loại VL / NC / MTC — cùng quy tắc báo cáo dùng cho
  // "Dự toán chưa có loại" ở Phần III (cả dòng có hạng mục đã xóa), nên Tổng quan đếm đúng tập này.
  const kindlessIds = kindlessEstimateIds(estimates, categories);

  return (
    <Suspense>
      <DuToanClient
        projectId={projectId}
        initialData={serializeDecimals(estimates)}
        categories={categories}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canEdit}
        isAdmin={role === "admin"}
        kindlessIds={kindlessIds}
        kindlessOnly={parseDuToanQuery(toSearchParams(query)).loai === DU_TOAN_KINDLESS}
      />
    </Suspense>
  );
}
