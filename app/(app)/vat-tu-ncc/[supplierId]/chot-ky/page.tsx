import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { previewPeriodClose } from "@/lib/vat-tu-ncc/period-close-service";
import {
  PairProjectRequired,
  parseProjectIdParam,
  requireActivePairProject,
} from "@/components/vat-tu-ncc/pair-project-required";
import { ChotKyClient } from "./chot-ky-client";

interface Props {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function ChotKyPage({ params, searchParams }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  // Chốt kỳ theo cặp NCC × công trình: thiếu công trình thì chọn trước.
  const projectId = parseProjectIdParam((await searchParams).projectId);
  if (projectId == null) return <PairProjectRequired supplierId={id} tab="chot-ky" />;
  await requireActivePairProject(projectId);
  const canEdit = await canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" });
  // Kỳ gợi ý (liền kề marker gần nhất của cặp / sau mốc số dư ban đầu) điền sẵn khi mở trang.
  const initialPreview = await previewPeriodClose(id, projectId);

  return (
    <Suspense>
      <ChotKyClient supplierId={id} projectId={projectId} canEdit={canEdit} initialPreview={initialPreview} />
    </Suspense>
  );
}
