import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/acl/guards";
import { listPairsOfProject } from "@/lib/vat-tu-ncc/project-overview-service";
import { formatDate } from "@/lib/utils/format";
import { parseProjectIdParam } from "@/components/vat-tu-ncc/project-id-param";
import { ProjectPairTable } from "@/components/vat-tu-ncc/project-pair-table";

interface Props {
  params: Promise<{ projectId: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Các NCC của một công trình. Cột nợ TT/HĐ chỉ hiện khi người dùng có quyền đọc `cong-no-vt`
 * (service tự kiểm quyền — trang chỉ yêu cầu, không tự quyết).
 */
export default async function VatTuCongTrinhDetailPage({ params }: Props) {
  const { projectId: raw } = await params;
  const projectId = parseProjectIdParam(raw);
  if (projectId == null) notFound();
  await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });

  const result = await listPairsOfProject(projectId, { includeDebt: true });
  if (!result) notFound();
  const activeIds = new Set(result.pairs.map((p) => p.supplierId));
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const { project } = result;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/vat-tu-ncc" className="hover:underline">Vật tư NCC</Link>
          <span>/</span>
          <Link href="/vat-tu-ncc/cong-trinh" className="hover:underline">Theo công trình</Link>
          <span>/</span>
          <span>{project.code}</span>
        </div>
        <h1 className="text-xl font-bold">{project.code} — {project.name}</h1>
        <p className="text-sm text-muted-foreground">
          Chủ thể:{" "}
          {project.entityName ?? (
            <span className="text-destructive">chưa gán — gán ở Master data &gt; Dự án trước khi chốt kỳ / ghi sổ</span>
          )}
          {result.debtVisible && <> · Còn nợ tính đến hết ngày {formatDate(result.debtAsOf)}</>}
        </p>
      </div>
      <ProjectPairTable
        projectId={project.id}
        pairs={result.pairs}
        debtVisible={result.debtVisible}
        showPaymentLink={result.debtVisible}
        otherSuppliers={suppliers.filter((s) => !activeIds.has(s.id))}
      />
    </div>
  );
}
