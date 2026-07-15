"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { severity: "P1" } });
  }, [error]);

  return (
    <html lang="vi">
      <body className="flex min-h-dvh items-center justify-center p-6">
        <main className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Hệ thống gặp sự cố</h1>
          <p className="mt-2 text-sm text-muted-foreground">Lỗi đã được ghi nhận an toàn. Vui lòng thử lại.</p>
          <button className="mt-4 min-h-11 rounded-md border px-4" type="button" onClick={reset}>Thử lại</button>
        </main>
      </body>
    </html>
  );
}
