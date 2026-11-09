"use client";

import { useState, useTransition } from "react";
import { deleteRun, rollbackRun, getRunRollbackInfo } from "./import-actions";

/**
 * Thao tác theo trạng thái run:
 * - `committed` → Hoàn tác (run chuyển `rolled_back`, không bị xóa);
 * - `preview` / `failed` không còn dữ liệu → Xóa;
 * - còn lại (đã hoàn tác, run lỗi cũ còn dữ liệu) → không có nút.
 */
export function DeleteRunButton({
  id,
  status,
  supportsRollback,
  hasData,
}: {
  id: number;
  status: string;
  supportsRollback: boolean;
  hasData: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (status === "committed") {
    return (
      <RollbackButton
        id={id}
        supportsRollback={supportsRollback}
        pending={pending}
        startTransition={startTransition}
      />
    );
  }

  if (status !== "preview" && status !== "failed") return null;

  if (hasData) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="Run còn dữ liệu gắn importRunId nên không xóa được — liên hệ quản trị hệ thống."
      >
        Còn dữ liệu
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      title="Xóa lần import này"
      onClick={() => {
        if (!confirm(`Xóa lần import #${id}? Hành động không hoàn tác.`)) return;
        startTransition(async () => {
          const result = await deleteRun(id);
          if (!result.ok) alert(result.message);
        });
      }}
      className="text-red-600 hover:underline text-xs disabled:text-gray-400 disabled:cursor-not-allowed"
    >
      {pending ? "Đang xóa..." : "Xóa"}
    </button>
  );
}

function RollbackButton({
  id,
  supportsRollback,
  pending,
  startTransition,
}: {
  id: number;
  supportsRollback: boolean;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [checking, setChecking] = useState(false);

  const handleClick = async () => {
    if (!supportsRollback) {
      alert(
        "Adapter của run này ghi dữ liệu bằng upsert idempotent — mỗi lần import ghi đè dữ liệu mới nhất, " +
          "không gắn thẻ theo từng run nên không thể hoàn tác tự động.\n\n" +
          "Để hoàn tác: import lại file nguồn đã sửa, hoặc reset thủ công các bảng của module trong cơ sở dữ liệu.",
      );
      return;
    }

    setChecking(true);
    const info = await getRunRollbackInfo(id);
    setChecking(false);
    if (!info.ok) {
      alert(info.message);
      return;
    }

    if (info.total === 0) {
      alert(
        "Run này không thể hoàn tác — được tạo trước khi tính năng rollback có hiệu lực, hoặc dữ liệu đã bị xóa thủ công.",
      );
      return;
    }

    const msg =
      `Hoàn tác run #${id}?\n\n` +
      `Sẽ xóa ${info.total} dòng dữ liệu đã import. Run được giữ lại ở trạng thái "Đã hoàn tác".\n\n` +
      `Master data (NCC, Chủ thể, Dự án) sẽ KHÔNG bị xóa.\nHành động không hoàn tác.`;
    if (!confirm(msg)) return;
    if (!confirm(`Xác nhận lần 2: Xóa ${info.total} dòng dữ liệu của run #${id}?`)) return;

    startTransition(async () => {
      const result = await rollbackRun(id);
      alert(result.ok ? `Đã hoàn tác: xóa ${result.total} dòng.` : result.message);
    });
  };

  return (
    <button
      type="button"
      disabled={pending || checking}
      title="Hoàn tác run này — xóa toàn bộ dữ liệu đã import"
      onClick={handleClick}
      className="text-orange-600 hover:underline text-xs disabled:text-gray-400 disabled:cursor-not-allowed"
    >
      {pending ? "Đang hoàn tác..." : checking ? "Đang kiểm tra..." : "Hoàn tác"}
    </button>
  );
}
