import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getUserContext } from "@/lib/department-rbac";
import { listDepartments } from "@/lib/department-service";
import {
  getEscalatedForms,
  groupByExecutorDept,
} from "@/lib/coordination-form/sla-stats";
import { formatDateTime, formatDate } from "@/lib/utils/format";
import { stableSemanticSort, type SemanticKind } from "@/lib/table/semantic-compare";
import { nextSortState, type SortSelection } from "@/lib/table/sort-state";
import { ChevronDown, ChevronLeft, ChevronUp, ChevronsUpDown } from "lucide-react";

export const dynamic = "force-dynamic";

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : fallback;
}

function parseSort(raw: string | undefined, columns: readonly string[]): SortSelection {
  if (!raw) return { mode: "default" };
  const [col, dir] = raw.split(":");
  return columns.includes(col) && (dir === "asc" || dir === "desc")
    ? { mode: dir, col }
    : { mode: "default" };
}

function SortHead({
  params,
  paramName,
  column,
  label,
  sort,
  align = "left",
}: {
  params: URLSearchParams;
  paramName: "summarySort" | "detailSort";
  column: string;
  label: string;
  sort: SortSelection;
  align?: "left" | "right";
}) {
  const active = sort.mode !== "default" && sort.col === column;
  const mode = active ? sort.mode : "default";
  const next = nextSortState(column, sort);
  const nextParams = new URLSearchParams(params);
  if (next.mode === "default") nextParams.delete(paramName);
  else nextParams.set(paramName, `${next.col}:${next.mode}`);
  const Icon = mode === "asc" ? ChevronUp : mode === "desc" ? ChevronDown : ChevronsUpDown;
  const currentLabel = mode === "asc" ? "tăng dần" : mode === "desc" ? "giảm dần" : "mặc định";
  const nextLabel = next.mode === "asc" ? "tăng dần" : next.mode === "desc" ? "giảm dần" : "mặc định";

  return (
    <th scope="col" aria-sort={mode === "asc" ? "ascending" : mode === "desc" ? "descending" : "none"} className="p-0">
      <Link
        href={`/van-hanh/phieu-phoi-hop/thong-ke-sla?${nextParams}`}
        aria-label={`${label}: đang sắp xếp ${currentLabel}; chọn để sắp xếp ${nextLabel}`}
        className={`flex min-h-11 items-center gap-1 px-3 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          align === "right" ? "justify-end text-right" : "justify-start text-left"
        }`}
        title={mode === "default" ? "Thứ tự mặc định" : mode === "asc" ? "Tăng dần" : "Giảm dần"}
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </Link>
    </th>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    deptId?: string;
    summarySort?: string;
    detailSort?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const role = session.user.role ?? "viewer";
  const ctx = await getUserContext(session.user.id);
  if (role !== "admin" && !ctx?.isDirector) {
    redirect("/van-hanh/phieu-phoi-hop");
  }

  const sp = await searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const from = parseDate(sp.from, defaultFrom);
  const to = parseDate(sp.to, defaultTo);
  to.setHours(23, 59, 59, 999);
  const deptId = sp.deptId ? Number(sp.deptId) : undefined;

  const [rows, groups, depts] = await Promise.all([
    getEscalatedForms({ from, to, executorDeptId: deptId }),
    groupByExecutorDept({ from, to }),
    listDepartments({ activeOnly: false }),
  ]);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const params = new URLSearchParams({ from: fromStr, to: toStr });
  if (deptId) params.set("deptId", String(deptId));
  if (sp.summarySort) params.set("summarySort", sp.summarySort);
  if (sp.detailSort) params.set("detailSort", sp.detailSort);

  const summarySort = parseSort(sp.summarySort, ["deptName", "count"]);
  const summaryAccessors: Record<string, { accessor: (row: (typeof groups)[number]) => unknown; kind: SemanticKind }> = {
    deptName: { accessor: (row) => row.deptName, kind: "text" },
    count: { accessor: (row) => row.count, kind: "number" },
  };
  const summaryColumn = summarySort.mode === "default" ? undefined : summaryAccessors[summarySort.col];
  const sortedGroups = summaryColumn
    ? stableSemanticSort(groups, summaryColumn.accessor, summarySort.mode, summaryColumn.kind)
    : [...groups];

  const detailSort = parseSort(sp.detailSort, [
    "code", "creatorName", "executorDeptName", "escalatedFromUserName",
    "escalatedAt", "finalStatus", "finalActionAt",
  ]);
  const detailAccessors: Record<string, { accessor: (row: (typeof rows)[number]) => unknown; kind: SemanticKind }> = {
    code: { accessor: (row) => row.code, kind: "text" },
    creatorName: { accessor: (row) => row.creatorName, kind: "text" },
    executorDeptName: { accessor: (row) => row.executorDeptName, kind: "text" },
    escalatedFromUserName: { accessor: (row) => row.escalatedFromUserName, kind: "text" },
    escalatedAt: { accessor: (row) => row.escalatedAt, kind: "date" },
    finalStatus: { accessor: (row) => row.finalStatus, kind: "text" },
    finalActionAt: { accessor: (row) => row.finalActionAt, kind: "date" },
  };
  const detailColumn = detailSort.mode === "default" ? undefined : detailAccessors[detailSort.col];
  const sortedRows = detailColumn
    ? stableSemanticSort(rows, detailColumn.accessor, detailSort.mode, detailColumn.kind)
    : [...rows];

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/van-hanh/hieu-suat"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Quay lại Hiệu suất
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Thống kê phiếu quá hạn SLA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phiếu phối hợp bị escalate (TBP không duyệt trong 24h, chuyển Giám đốc).
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 shadow-sm" method="get">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Từ ngày</label>
          <input type="date" name="from" defaultValue={fromStr} className="h-9 rounded-md border border-input bg-transparent px-3 text-base md:text-sm" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Đến ngày</label>
          <input type="date" name="to" defaultValue={toStr} className="h-9 rounded-md border border-input bg-transparent px-3 text-base md:text-sm" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Phòng thực hiện</label>
          <select name="deptId" defaultValue={deptId ?? ""} className="h-9 rounded-md border border-input bg-transparent px-3 text-base md:text-sm">
            <option value="">Tất cả phòng</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Lọc
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-3 py-2 text-sm font-semibold bg-muted/40">
            Tổng quan ({rows.length} phiếu)
          </div>
          {groups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Không có phiếu nào quá hạn trong khoảng thời gian này.</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <SortHead params={params} paramName="summarySort" column="deptName" label="Phòng thực hiện" sort={summarySort} />
                  <SortHead params={params} paramName="summarySort" column="count" label="Số phiếu" sort={summarySort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedGroups.map((g) => (
                  <tr key={g.deptId} className="border-t">
                    <td className="px-3 py-2">{g.deptName}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <SortHead params={params} paramName="detailSort" column="code" label="Mã" sort={detailSort} />
              <SortHead params={params} paramName="detailSort" column="creatorName" label="Người tạo" sort={detailSort} />
              <SortHead params={params} paramName="detailSort" column="executorDeptName" label="Phòng thực hiện" sort={detailSort} />
              <SortHead params={params} paramName="detailSort" column="escalatedFromUserName" label="TBP để quá hạn" sort={detailSort} />
              <SortHead params={params} paramName="detailSort" column="escalatedAt" label="Thời điểm escalate" sort={detailSort} />
              <SortHead params={params} paramName="detailSort" column="finalStatus" label="Trạng thái" sort={detailSort} />
              <SortHead params={params} paramName="detailSort" column="finalActionAt" label="Đóng lúc" sort={detailSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Không có dữ liệu</td></tr>
            ) : (
              sortedRows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 even:bg-muted/20 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link href={`/van-hanh/phieu-phoi-hop/${r.id}`} className="font-mono text-xs text-primary hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.creatorName}</td>
                  <td className="px-3 py-2">{r.executorDeptName}</td>
                  <td className="px-3 py-2">{r.escalatedFromUserName ?? "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDateTime(r.escalatedAt)}</td>
                  <td className="px-3 py-2 text-xs">{r.finalStatus}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{r.finalActionAt ? formatDate(r.finalActionAt) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
