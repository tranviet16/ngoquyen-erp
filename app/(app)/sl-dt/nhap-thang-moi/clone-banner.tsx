"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cloneFromPreviousMonth } from "./actions";

export function CloneBanner({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClone = () => {
    setError(null);
    start(async () => {
      const res = await cloneFromPreviousMonth(year, month);
      if (res.cloned === 0) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="border rounded-lg p-6 bg-muted/30 space-y-3">
      <div>
        <div className="font-semibold">Tháng {month}/{year} chưa có dữ liệu</div>
        <div className="text-sm text-muted-foreground mt-1">
          Bấm nút bên dưới để khởi tạo dữ liệu tháng mới — kế thừa toàn bộ baseline (dự toán, HĐ, QT trát chưa, trát lũy kế),
          mốc tiến độ và 6 cột giai đoạn xây dựng từ tháng gần nhất. Các cột kỳ (kế hoạch / thực kỳ / trát kỳ) reset = 0.
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <button
          onClick={onClone}
          disabled={pending}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded disabled:opacity-60"
        >
          {pending ? "Đang clone…" : "Tạo từ tháng trước"}
        </button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
