import { requireModuleAccess } from "@/lib/acl/guards";
import { prisma } from "@/lib/prisma";
import { getLaborDetailReport } from "@/lib/cong-no-nc/balance-report-service";
import { DetailReportTable } from "@/components/ledger/detail-report-table";
import { DetailReportFilter } from "@/components/ledger/detail-report-filter";
import type { ViewMode } from "@/lib/cong-no-nc/balance-report-service";

interface PageProps {
  searchParams: Promise<{
    year?: string;
    month?: string;
    entityIds?: string;
    projectIds?: string;
    view?: string;
    showZero?: string;
  }>;
}

export default async function ChiTietNcPage({ searchParams }: PageProps) {
  await requireModuleAccess("cong-no-nc.chi-tiet", { minLevel: "read", scope: "module" });

  const sp = await searchParams;

  // Parse filters from URL
  const year = sp.year ? parseInt(sp.year, 10) : undefined;
  const month = sp.month ? parseInt(sp.month, 10) : undefined;

  const entityIds: number[] =
    sp.entityIds
      ?.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0) ?? [];

  const projectIds: number[] =
    sp.projectIds
      ?.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0) ?? [];

  const validViews: ViewMode[] = ["trong-thang", "luy-ke", "ca-hai"];
  const view: ViewMode = validViews.includes(sp.view as ViewMode)
    ? (sp.view as ViewMode)
    : "ca-hai";

  const showZero = sp.showZero === "1";

  // Load entities + initial cascade projects in parallel
  const entityIdsParam = entityIds.length > 0 ? entityIds : null;
  const [allEntities, cascadeProjectIdRows] = await Promise.all([
    prisma.entity.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.$queryRaw<{ project_id: number | null }[]>`
      SELECT DISTINCT "projectId" AS project_id
      FROM ledger_transactions
      WHERE "ledgerType" = 'labor'
        AND "deletedAt" IS NULL
        AND "projectId" IS NOT NULL
        AND (${entityIdsParam}::int[] IS NULL OR "entityId" = ANY(${entityIdsParam}::int[]))

      UNION

      SELECT DISTINCT "projectId" AS project_id
      FROM ledger_opening_balances
      WHERE "ledgerType" = 'labor'
        AND "projectId" IS NOT NULL
        AND (${entityIdsParam}::int[] IS NULL OR "entityId" = ANY(${entityIdsParam}::int[]))
    `,
  ]);

  const cascadeIds = cascadeProjectIdRows
    .map((r) => r.project_id)
    .filter((id): id is number => id != null);

  const initialProjects = cascadeIds.length > 0
    ? await prisma.project.findMany({
        where: { id: { in: cascadeIds }, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // Fetch report data
  const { rows, subtotals } = await getLaborDetailReport({
    year,
    month,
    entityIds: entityIds.length > 0 ? entityIds : undefined,
    projectIds: projectIds.length > 0 ? projectIds : undefined,
    view,
    showZero,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Công nợ chi tiết – Nhân công</h1>
        <p className="text-sm text-muted-foreground">
          Phát sinh / Đã trả / Nợ theo (Chủ thể × Đội thi công × Công trình)
        </p>
      </div>

      <DetailReportFilter
        entities={allEntities}
        initialProjects={initialProjects}
        ledgerType="labor"
        partyLabel="Đội thi công"
        defaultValues={{
          year,
          month,
          entityIds,
          projectIds,
          view,
          showZero,
        }}
      />

      <DetailReportTable
        rows={rows}
        subtotals={subtotals}
        view={view}
        partyLabel="Đội thi công"
      />
    </div>
  );
}
