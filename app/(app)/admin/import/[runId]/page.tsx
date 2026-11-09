import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { missingAcks, parseStoredReview, readStoredMapping, type StoredReview } from "@/lib/import/import-review";
import { getRun } from "../import-actions";
import { importRunStatusLabel } from "../run-status";
import { CommitPanel } from "./commit-panel";
import { AdapterReviewSection } from "./adapter-review-components";
import { BundleFilesPanel, ReviewStatusPanel } from "./review-status-panel";
import { ServerSortableTableHead } from "@/components/server-sortable-table-head";
import { stableSemanticSort } from "@/lib/table/semantic-compare";
import type { SortSelection } from "@/lib/table/sort-state";

interface Props {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ sort?: string }>;
}

export default async function ImportRunDetailPage({ params, searchParams }: Props) {
  await requireActiveAdmin();

  const { runId } = await params;
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const run = await getRun(id);
  if (!run) notFound();

  const review: StoredReview = parseStoredReview(run.reviewJson) ?? { payload: null, blocking: [], requiredAcks: [], acks: {} };
  const missing = missingAcks(review);
  const hasReview = run.reviewVersion > 0;

  const errors = Array.isArray(run.errors) ? (run.errors as { rowIndex: number; message: string }[]) : [];
  const { sort: rawSort } = await searchParams;
  const [sortCol, sortDir] = rawSort?.split(":") ?? [];
  const sort: SortSelection = (sortDir === "asc" || sortDir === "desc") && (sortCol === "rowIndex" || sortCol === "message")
    ? { mode: sortDir, col: sortCol }
    : { mode: "default" };
  const displayedErrors = sort.mode === "default"
    ? [...errors]
    : stableSemanticSort(
        errors,
        (error) => error[sort.col as "rowIndex" | "message"],
        sort.mode,
        sort.col === "rowIndex" ? "number" : "text",
      );
  const sortParams = new URLSearchParams(rawSort ? { sort: rawSort } : {});

  function statusColor(s: string) {
    if (s === "committed") return "text-green-700";
    if (s === "failed") return "text-red-600";
    if (s === "preview") return "text-blue-600";
    if (s === "rolled_back") return "text-gray-600";
    return "text-yellow-600";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Run #{run.id}</h1>
        <p className="text-sm text-muted-foreground">{run.fileName}</p>
      </div>

      <div className="border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">Adapter</div>
          <div className="font-mono">{run.adapter}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Trạng thái</div>
          <div className={`font-semibold ${statusColor(run.status)}`} title={run.status}>
            {importRunStatusLabel(run.status)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Tổng dòng</div>
          <div>{run.rowsTotal}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Đã nhập / Bỏ qua</div>
          <div>{run.rowsImported} / {run.rowsSkipped}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Tạo lúc</div>
          <div>{new Date(run.createdAt).toLocaleString("vi-VN")}</div>
        </div>
        {run.committedAt && (
          <div>
            <div className="text-muted-foreground text-xs">Ghi lúc</div>
            <div>{new Date(run.committedAt).toLocaleString("vi-VN")}</div>
          </div>
        )}
        {run.rolledBackAt && (
          <div>
            <div className="text-muted-foreground text-xs">Hoàn tác lúc</div>
            <div>{new Date(run.rolledBackAt).toLocaleString("vi-VN")}</div>
          </div>
        )}
        <div className="col-span-2">
          <div className="text-muted-foreground text-xs">File hash (SHA-256)</div>
          <div className="font-mono text-xs break-all">{run.fileHash}</div>
        </div>
      </div>

      {review.bundle && <BundleFilesPanel bundle={review.bundle} />}

      {hasReview && <ReviewStatusPanel reviewVersion={run.reviewVersion} review={review} missingAcks={missing} />}

      {hasReview && (
        <AdapterReviewSection
          runId={run.id}
          adapterName={run.adapter}
          status={run.status}
          editable={run.status === "preview"}
          reviewVersion={run.reviewVersion}
          mapping={readStoredMapping(run.mapping)}
          review={review}
          missingAcks={missing}
        />
      )}

      {run.status === "preview" && hasReview && (
        <CommitPanel
          runId={run.id}
          reviewVersion={run.reviewVersion}
          blockingCount={review.blocking.length}
          missingAckCount={missing.length}
        />
      )}

      {run.status === "preview" && !hasReview && (
        <div className="border rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300">
          Run này chưa có kết quả xem trước (tạo trước khi engine lưu nguồn, hoặc bước xem trước bị gián đoạn).
          Xóa run và tải lên lại.
        </div>
      )}

      {errors.length > 0 && (
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2 text-red-600">Lỗi ({errors.length})</h2>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <ServerSortableTableHead basePath={`/admin/import/${run.id}`} params={sortParams}
                    column="rowIndex" label="Dòng" sort={sort} align="right" className="w-20" />
                  <ServerSortableTableHead basePath={`/admin/import/${run.id}`} params={sortParams}
                    column="message" label="Thông báo" sort={sort} />
                </tr>
              </thead>
              <tbody>
                {displayedErrors.map((e, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 text-right font-mono tabular-nums">{e.rowIndex >= 0 ? e.rowIndex + 1 : "—"}</td>
                    <td className="p-2 text-red-700">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-sm">
        <Link href="/admin/import" className="text-blue-600 hover:underline">
          &larr; Quay lại danh sách import
        </Link>
      </div>
    </div>
  );
}
