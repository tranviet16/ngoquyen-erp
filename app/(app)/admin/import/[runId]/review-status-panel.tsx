import type { StoredBundleInfo, StoredReview } from "@/lib/import/import-review";

/** Trạng thái duyệt của run: phiên bản review, lỗi chặn, xác nhận còn thiếu. */
export function ReviewStatusPanel({
  reviewVersion,
  review,
  missingAcks,
}: {
  reviewVersion: number;
  review: StoredReview;
  missingAcks: string[];
}) {
  const clean = review.blocking.length === 0 && missingAcks.length === 0;
  return (
    <div className="border rounded-lg p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-semibold">Duyệt</h2>
        <span className="text-xs text-muted-foreground">Phiên bản xem trước: v{reviewVersion}</span>
        {clean && <span className="text-xs text-green-700 dark:text-green-300">Không có lỗi chặn hay mục chờ xác nhận</span>}
      </div>
      {review.blocking.length > 0 && (
        <div>
          <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">
            Lỗi chặn ({review.blocking.length})
          </div>
          <ul className="list-disc pl-5 space-y-1 text-red-700 dark:text-red-300">
            {review.blocking.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {missingAcks.length > 0 && (
        <div>
          <div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
            Chưa xác nhận ({missingAcks.length})
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {missingAcks.map((code) => (
              <li key={code} className="font-mono text-xs break-all">{code}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Danh sách file trong gói thư mục và file bị bỏ qua. */
export function BundleFilesPanel({ bundle }: { bundle: StoredBundleInfo }) {
  return (
    <div className="border rounded-lg p-4 space-y-2 text-sm">
      <details>
        <summary className="cursor-pointer font-semibold">Gói thư mục: {bundle.files.length} file</summary>
        <ul className="mt-2 space-y-0.5">
          {bundle.files.map((f) => (
            <li key={f.path} className="flex justify-between gap-4">
              <span className="break-all">{f.path}</span>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatSize(f.size)}</span>
            </li>
          ))}
        </ul>
      </details>
      {bundle.skipped.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">Bỏ qua {bundle.skipped.length} file</summary>
          <ul className="mt-2 space-y-0.5">
            {bundle.skipped.map((f) => (
              <li key={f.path} className="flex justify-between gap-4">
                <span className="break-all">{f.path}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{f.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
