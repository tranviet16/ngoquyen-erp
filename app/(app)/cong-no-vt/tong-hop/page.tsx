import { requireModuleAccess } from "@/lib/acl/guards";
import { prisma } from "@/lib/prisma";
import { getMaterialDebtMatrix } from "@/lib/cong-no-vt/material-ledger-service";
import { resolveReportPeriod } from "@/lib/ledger/report-period";
import { pickMatrixEntities } from "@/lib/ledger/debt-matrix-columns";
import { DebtMatrix } from "@/components/ledger/debt-matrix";
import { ExcelExportButton, PrintButton } from "@/components/export-buttons";
import { TongHopFilter } from "./tong-hop-filter";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TongHopPage({ searchParams }: PageProps) {
  await requireModuleAccess("cong-no-vt", { minLevel: "read", scope: "module" });

  const sp = await searchParams;
  const options = { defaultPreset: "all", legacyMode: "cutoff", today: new Date() } as const;
  const requested = resolveReportPeriod(sp, options);
  const periodError = "error" in requested ? requested.error : null;
  const period = "error" in requested ? resolveReportPeriod({}, options) : requested;
  if ("error" in period) throw new Error(period.error);

  const entityIds = (one(sp.entityIds)?.split(",") ?? [])
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  const hideZero = one(sp.hideZero) === "1";
  const from = isoDay(period.from);
  const to = isoDay(period.to);

  const [matrix, allEntities] = await Promise.all([
    periodError
      ? Promise.resolve([])
      : getMaterialDebtMatrix({ from, to, entityIds: entityIds.length > 0 ? entityIds : undefined }),
    // Gồm cả Chủ thể đã xoá mềm để cột luôn cộng đủ vào tổng công ty.
    prisma.entity.findMany({ select: { id: true, name: true, deletedAt: true } }),
  ]);

  const suppliers =
    matrix.length > 0
      ? await prisma.supplier.findMany({
          where: { id: { in: matrix.map((r) => r.partyId) } },
          select: { id: true, name: true },
        })
      : [];
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const rows = matrix
    .map((r) => ({ ...r, partyName: supplierName.get(r.partyId) ?? `NCC #${r.partyId}` }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName, "vi"));
  const columnEntities = pickMatrixEntities(allEntities, rows, entityIds);
  const filterEntities = allEntities
    .filter((e) => e.deletedAt === null)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tổng hợp công nợ vật tư – NCC × Chủ thể</h1>
          <p className="text-sm text-muted-foreground">
            Kỳ xem: {period.label}. LH = Đầu kỳ + Phát sinh tăng; Nợ = LH − Trả (TT = thực tế, HĐ = hợp đồng).
          </p>
        </div>
        <div className="flex gap-2">
          <ExcelExportButton
            template="cong-no-tong-hop"
            params={{ from, to, entityIds }}
            label="Xuất Excel"
            filename={`cong-no-tong-hop-${from ?? "toan-bo"}-${to ?? "den-nay"}.xlsx`}
          />
          <PrintButton />
        </div>
      </div>

      <TongHopFilter
        currentPeriod={period.params}
        entities={filterEntities}
        selectedEntityIds={entityIds}
        hideZero={hideZero}
      />
      {periodError && (
        <p role="alert" className="text-sm text-destructive">
          {periodError}. Chưa tải dữ liệu; hãy chọn lại mốc thời gian.
        </p>
      )}

      <DebtMatrix rows={rows} entities={columnEntities} partyLabel="NCC" hideZero={hideZero} />
    </div>
  );
}
