"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAllReadAction, markReadAction } from "./actions";

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface Props {
  items: Notification[];
  unreadCount: number;
  unreadOnly: boolean;
}

export function NotificationsClient({ items, unreadCount, unreadOnly }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function markOne(id: number, link: string | null) {
    startTransition(async () => {
      try {
        await markReadAction(id);
        if (link) router.push(link);
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function markAll() {
    startTransition(async () => {
      try {
        const r = await markAllReadAction();
        toast.success(`Đã đánh dấu ${r.count} thông báo`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Thông báo</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} chưa đọc</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAll} disabled={pending}>
            Đánh dấu tất cả đã đọc
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Link
          href="/thong-bao"
          className={`rounded-md px-3 py-1 text-sm ${!unreadOnly ? "bg-primary text-primary-foreground" : "border"}`}
        >
          Tất cả
        </Link>
        <Link
          href="/thong-bao?filter=unread"
          className={`rounded-md px-3 py-1 text-sm ${unreadOnly ? "bg-primary text-primary-foreground" : "border"}`}
        >
          Chưa đọc ({unreadCount})
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8 border rounded-lg">
          Không có thông báo
        </p>
      ) : (
        <ul className="rounded-lg border divide-y">
          {items.map((n) => (
            <li
              key={n.id}
              onClick={() => markOne(n.id, n.link)}
              className={`cursor-pointer px-4 py-3 hover:bg-muted ${!n.readAt ? "bg-blue-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{n.title}</p>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(n.createdAt).toLocaleString("vi-VN")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
              {n.link && (
                <p className="text-xs text-blue-600 mt-1">→ {n.link}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
