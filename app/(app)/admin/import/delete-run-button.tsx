"use client";

import { useTransition } from "react";
import { deleteRun } from "./import-actions";

export function DeleteRunButton({ id, status }: { id: number; status: string }) {
  const [pending, startTransition] = useTransition();
  const disabled = status === "committed" || pending;

  return (
    <button
      type="button"
      disabled={disabled}
      title={status === "committed" ? "Không thể xóa lần import đã commit" : "Xóa lần import này"}
      onClick={() => {
        if (!confirm(`Xóa lần import #${id}? Hành động không hoàn tác.`)) return;
        startTransition(async () => {
          try {
            await deleteRun(id);
          } catch (e) {
            alert(String(e));
          }
        });
      }}
      className="text-red-600 hover:underline text-xs disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
    >
      {pending ? "Đang xóa..." : "Xóa"}
    </button>
  );
}
