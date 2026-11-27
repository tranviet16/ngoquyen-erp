import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccess } from "@/lib/acl/effective";
import { loadProjectLedger, parseSupplierFilter } from "@/lib/du-an/project-ledger/project-ledger-loader";
import { CongNoClient } from "./cong-no-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Công Nợ NCC: công nợ từng NCC của công trình theo sổ Công nợ vật tư (lũy kế toàn bộ, cộng mọi Chủ thể).
 * Người đọc được dự án thấy bảng này (giống tab Hợp đồng); từng dòng sổ nằm ở tab Giao Dịch.
 */
export default async function CongNoPage({ params, searchParams }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const supplierIds = parseSupplierFilter((await searchParams).ncc);
  const [ledger, canOpenSupplierBook] = await Promise.all([
    loadProjectLedger(projectId, { supplierIds, withRows: false }),
    canAccess(userId, "vat-tu-ncc", { minLevel: "read", scope: "module" }),
  ]);

  return (
    <CongNoClient
      projectId={projectId}
      suppliers={ledger.suppliers}
      options={ledger.options}
      totals={ledger.totals}
      pending={ledger.pending}
      selected={supplierIds ?? []}
      canOpenSupplierBook={canOpenSupplierBook}
    />
  );
}
