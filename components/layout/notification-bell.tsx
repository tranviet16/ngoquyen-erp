"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { markReadAction } from "@/app/(app)/thong-bao/actions";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  async function fetchData() {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setItems(j.items ?? []);
      setUnread(j.unread ?? 0);
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, []);

  function handleClick(n: NotificationItem) {
    if (!n.readAt) {
      startTransition(async () => {
        try {
          await markReadAction(n.id);
          setItems((cur) =>
            cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date() } : x)),
          );
          setUnread((u) => Math.max(0, u - 1));
        } catch {
          // silent
        }
      });
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center rounded p-2 hover:bg-muted"
        aria-label="Thông báo"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute top-0 right-0 min-w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center px-1">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="font-semibold text-sm">Thông báo</h3>
              <Link
                href="/thong-bao"
                onClick={() => setOpen(false)}
                className="text-xs text-blue-600 hover:underline"
              >
                Xem tất cả
              </Link>
            </div>
            {items.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-6">
                Không có thông báo
              </p>
            ) : (
              <ul>
                {items.slice(0, 10).map((n) => (
                  <li
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`cursor-pointer border-b px-3 py-2 text-sm hover:bg-muted ${
                      !n.readAt ? "bg-blue-50" : ""
                    }`}
                  >
                    <p className="font-medium line-clamp-1">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(n.createdAt).toLocaleString("vi-VN")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
