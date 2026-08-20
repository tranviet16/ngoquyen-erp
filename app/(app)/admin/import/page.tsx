import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { getRuns, getAdapters } from "./import-actions";
import { ImportUploadForm } from "./import-upload-form";
import { DeleteRunButton } from "./delete-run-button";
import { ServerSortableTableHead } from "@/components/server-sortable-table-head";
import { stableSemanticSort, type SemanticKind } from "@/lib/table/semantic-compare";
import type { SortSelection } from "@/lib/table/sort-state";

export default async function AdminImportPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  await requireActiveAdmin();

  const [runs, adapters] = await Promise.all([getRuns(), getAdapters()]);
  const { sort: rawSort } = await searchParams;
  const [sortCol, sortDir] = rawSort?.split(":") ?? [];
  const sortColumns: Record<string, { accessor: (row: (typeof runs)[number]) => unknown; kind: SemanticKind }> = {
    id: { accessor: (row) => row.id, kind: "number" },
    fileName: { accessor: (row) => row.fileName, kind: "text" },
    adapter: { accessor: (row) => row.adapter, kind: "text" },
    status: { accessor: (row) => row.status, kind: "text" },
    rowsImported: { accessor: (row) => row.rowsImported, kind: "number" },
    rowsSkipped: { accessor: (row) => row.rowsSkipped, kind: "number" },
    createdAt: { accessor: (row) => row.createdAt, kind: "date" },
  };
  const sort: SortSelection = (sortDir === "asc" || sortDir === "desc") && sortColumns[sortCol]
    ? { mode: sortDir, col: sortCol }
    : { mode: "default" };
  const displayedRuns = sort.mode === "default"
    ? [...runs]
    : stableSemanticSort(runs, sortColumns[sort.col].accessor, sort.mode, sortColumns[sort.col].kind);
  const sortParams = new URLSearchParams(rawSort ? { sort: rawSort } : {});
  const rollbackByAdapter = new Map(adapters.map((a) => [a.name, a.supportsRollback]));

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
      preview: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
      committed: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
      failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    };
    return colors[status] ?? "bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-300";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nhập dữ liệu Excel</h1>
        <p className="text-sm text-muted-foreground">
          Import dữ liệu lịch sử từ file Excel SOP. Chỉ admin mới có quyền thực hiện.
        </p>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <h2 className="font-semibold">Tải lên file mới</h2>
        <ImportUploadForm adapters={adapters} />
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Lịch sử import ({runs.length} lần)</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lần import nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <ServerSortableTableHead basePath="/admin/import" params={sortParams} column="id" label="#" sort={sort} />
                  <ServerSortableTableHead basePath="/admin/import" params={sortParams} column="fileName" label="File" sort={sort} />
                  <ServerSortableTableHead basePath="/admin/import" params={sortParams} column="adapter" label="Adapter" sort={sort} />
                  <ServerSortableTableHead basePath="/admin/import" params={sortParams} column="status" label="Trạng thái" sort={sort} />
                  <ServerSortableTableHead basePath="/admin/import" params={sortParams} column="rowsImported" label="Đã nhập" sort={sort} align="right" />
                  <ServerSortableTableHead basePath="/admin/import" params={sortParams} column="rowsSkipped" label="Bỏ qua" sort={sort} align="right" />
                  <ServerSortableTableHead basePath="/admin/import" params={sortParams} column="createdAt" label="Thời gian" sort={sort} />
                  <th className="p-2 text-left">Chi tiết</th>
                  <th className="p-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {displayedRuns.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/20">
                    <td className="p-2 font-mono text-xs">{r.id}</td>
                    <td className="p-2 max-w-[200px] truncate" title={r.fileName}>{r.fileName}</td>
                    <td className="p-2 font-mono text-xs">{r.adapter}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-2 text-right">{r.rowsImported}</td>
                    <td className="p-2 text-right">{r.rowsSkipped}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-2">
                      <a href={`/admin/import/${r.id}`} className="text-blue-600 hover:underline text-xs">
                        Xem
                      </a>
                    </td>
                    <td className="p-2">
                      <DeleteRunButton
                        id={r.id}
                        status={r.status}
                        supportsRollback={rollbackByAdapter.get(r.adapter) ?? true}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
