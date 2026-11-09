"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { doCommit } from "../import-actions";

interface Props {
  runId: number;
  /** Phiên bản review đang hiển thị — server từ chối nếu đã có bản mới hơn. */
  reviewVersion: number;
  blockingCount: number;
  missingAckCount: number;
}

/** Ghi run từ nguồn đã lưu (không tải lại file), đúng phiên bản review đang xem. */
export function CommitPanel({ runId, reviewVersion, blockingCount, missingAckCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const blocked = blockingCount > 0 || missingAckCount > 0;

  function handleCommit() {
    if (blocked) return;
    if (!confirm(`Ghi dữ liệu của run #${runId} (bản xem trước v${reviewVersion}) vào cơ sở dữ liệu?`)) return;
    startTransition(async () => {
      const result = await doCommit(runId, reviewVersion);
      if (result.ok) {
        toast.success(`Ghi thành công: ${result.rowsImported} dòng nhập, ${result.rowsSkipped} bỏ qua`);
      } else {
        toast.error(`Ghi thất bại: ${result.message}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/30 space-y-3">
      <h2 className="font-semibold text-blue-900 dark:text-blue-200">
        {blocked ? "Chưa ghi được" : "Sẵn sàng để ghi"}
      </h2>
      <p className="text-sm text-blue-700 dark:text-blue-300">
        {blocked
          ? `Còn ${blockingCount} lỗi chặn và ${missingAckCount} mục chưa xác nhận. Xử lý rồi "Lưu & tính lại" trước khi ghi.`
          : `Ghi đúng bản xem trước v${reviewVersion} từ nguồn đã tải lên, trong một giao dịch. Sau khi ghi chỉ có thể Hoàn tác.`}
      </p>
      <button
        type="button"
        onClick={handleCommit}
        disabled={isPending || blocked}
        className="px-4 py-2 bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50"
      >
        {isPending ? "Đang ghi..." : "Ghi dữ liệu"}
      </button>
    </div>
  );
}
