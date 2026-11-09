import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireModuleAccess } from "@/lib/acl/guards";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import {
  PairProjectRequired,
  parseProjectIdParam,
  requireActivePairProject,
} from "@/components/vat-tu-ncc/pair-project-required";
import { KiemTraKhopClient } from "./kiem-tra-khop-client";

interface Props {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function KiemTraKhopPage({ params, searchParams }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();
  await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  await requireActiveAdmin();
  const projectId = parseProjectIdParam((await searchParams).projectId);
  if (projectId == null) return <PairProjectRequired supplierId={id} tab="kiem-tra-khop" />;
  await requireActivePairProject(projectId);

  return (
    <Suspense>
      <KiemTraKhopClient supplierId={id} projectId={projectId} />
    </Suspense>
  );
}
