"use client";

import { useState, useTransition } from "react";
import { deleteRun, rollbackRun, getRunRollbackInfo } from "./import-actions";

export function DeleteRunButton({ id, status }: { id: number; status: string }) {
  const [pending, startTransition] = useTransition();

  if (status === "committed") {
    return <RollbackButton id={id} pending={pending} startTransition={startTransition} />;
  }

  return (
    <button
      type="button"
      disabled={pending}
      title="Xóa lần import này"
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
      className="text-red-600 hover:underline text-xs disabled:text-gray-400 disabled:cursor-not-allowed"
    >
      {pending ? "Đang xóa..." : "Xóa"}
    </button>
  );
}

function RollbackButton({
  id,
  pending,
  startTransition,
}: {
  id: number;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [checking, setChecking] = useState(false);

  const handleClick = async () => {
    setChecking(true);
    let info: { total: number; ledgerTransactions: number; ledgerOpeningBalances: number };
    try {
      info = await getRunRollbackInfo(id);
    } catch (e) {
      alert(String(e));
      setChecking(false);
      return;
    }
    setChecking(false);

    if (info.total === 0) {
      alert(
        "Run này không thể hoàn tác — được tạo trước khi tính năng rollback có hiệu lực, hoặc dữ liệu đã bị xóa thủ công.",
      );
      return;
    }

    const msg =
      `Hoàn tác run #${id}?\n\n` +
      `Sẽ xóa:\n` +
      `  • ${info.ledgerTransactions} giao dịch\n` +
      `  • ${info.ledgerOpeningBalances} số dư đầu kỳ\n\n` +
      `Master data (NCC, Chủ thể, Dự án) sẽ KHÔNG bị xóa.\nHành động không hoàn tác.`;
    if (!confirm(msg)) return;
    if (!confirm(`Xác nhận lần 2: Xóa ${info.total} dòng dữ liệu của run #${id}?`)) return;

    startTransition(async () => {
      try {
        const result = await rollbackRun(id);
        alert(`Đã hoàn tác: xóa ${result.total} rows.`);
      } catch (e) {
        alert(String(e));
      }
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
