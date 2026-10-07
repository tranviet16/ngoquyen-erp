import { requireModuleAccess } from "@/lib/acl/guards";
import { prisma } from "@/lib/prisma";
import { getMaterialDetailReport } from "@/lib/cong-no-vt/material-detail-report-service";
import { DetailReportTable } from "@/components/ledger/detail-report-table";
import { DetailReportFilter } from "@/components/ledger/detail-report-filter";
import { resolveReportPeriod } from "@/lib/ledger/report-period";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChiTietPage({ searchParams }: PageProps) {
  await requireModuleAccess("cong-no-vt", { minLevel: "read", scope: "module" });

  const sp = await searchParams;

  // Mốc thời gian: mặc định Toàn bộ; `?year=&month=` cũ là lũy kế đến hết tháng.
  const requested = resolveReportPeriod(sp, { defaultPreset: "all", legacyMode: "cutoff", today: new Date() });
  const periodError = "error" in requested ? requested.error : null;
  const period =
    "error" in requested
      ? resolveReportPeriod({}, { defaultPreset: "all", legacyMode: "cutoff", today: new Date() })
      : requested;
  if ("error" in period) throw new Error(period.error);
  const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const entityIds: number[] =
    one(sp.entityIds)
      ?.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0) ?? [];

  const projectIds: number[] =
    one(sp.projectIds)
      ?.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0) ?? [];

  const showZero = one(sp.showZero) === "1";

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
      WHERE "ledgerType" = 'material'
        AND "deletedAt" IS NULL
        AND "projectId" IS NOT NULL
        AND (${entityIdsParam}::int[] IS NULL OR "entityId" = ANY(${entityIdsParam}::int[]))

      UNION

      SELECT DISTINCT "projectId" AS project_id
      FROM ledger_opening_balances
      WHERE "ledgerType" = 'material'
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
  const { rows, subtotals } = await getMaterialDetailReport({
    from: isoDay(period.from),
    to: isoDay(period.to),
    entityIds: entityIds.length > 0 ? entityIds : undefined,
    projectIds: projectIds.length > 0 ? projectIds : undefined,
    showZero,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Công nợ lũy kế – Vật tư</h1>
        <p className="text-sm text-muted-foreground">
          Đầu kỳ / Phát sinh / Đã trả / Cuối kỳ (TT &amp; HĐ) theo (Chủ thể × NCC × Công trình)
        </p>
      </div>

      <DetailReportFilter
        entities={allEntities}
        initialProjects={initialProjects}
        ledgerType="material"
        partyLabel="NCC"
        initialPeriod={period.params}
        defaultValues={{
          entityIds,
          projectIds,
          showZero,
        }}
      />

      {periodError ? (
        <p role="alert" className="text-sm text-destructive">{periodError}. Đang hiển thị toàn bộ.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Kỳ xem: {period.label}</p>
      )}

      <DetailReportTable rows={rows} subtotals={subtotals} partyLabel="NCC" />
    </div>
  );
}
