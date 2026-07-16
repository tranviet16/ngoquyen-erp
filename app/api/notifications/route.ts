import { NextResponse } from "next/server";
import {
  countMyUnread,
  listMyNotifications,
} from "@/lib/notification/notification-service";
import {
  moduleRequestStatus,
  requireReleasedModuleRequest,
} from "@/lib/acl/released-module-request";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireReleasedModuleRequest("thong-bao");
    const [items, unread] = await Promise.all([
      listMyNotifications({ limit: 20 }),
      countMyUnread(),
    ]);
    return NextResponse.json({ items, unread });
  } catch (error) {
    const status = moduleRequestStatus(error);
    return NextResponse.json(
      {
        error:
          status === 503
            ? "Module đang phát triển"
            : status === 500
              ? "Lỗi hệ thống"
              : status === 403
                ? "Forbidden"
                : "Unauthorized",
      },
      { status },
    );
  }
}
