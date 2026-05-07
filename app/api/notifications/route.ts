import { NextResponse } from "next/server";
import {
  countMyUnread,
  listMyNotifications,
} from "@/lib/notification/notification-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [items, unread] = await Promise.all([
      listMyNotifications({ limit: 20 }),
      countMyUnread(),
    ]);
    return NextResponse.json({ items, unread });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 401 },
    );
  }
}
