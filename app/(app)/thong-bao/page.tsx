import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  countMyUnread,
  listMyNotifications,
} from "@/lib/notification/notification-service";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";

  const [items, unread] = await Promise.all([
    listMyNotifications({ unreadOnly, limit: 100 }),
    countMyUnread(),
  ]);

  return (
    <NotificationsClient
      items={items.map((n) => ({
        ...n,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      }))}
      unreadCount={unread}
      unreadOnly={unreadOnly}
    />
  );
}
