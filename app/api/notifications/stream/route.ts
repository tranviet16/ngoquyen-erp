/**
 * SSE stream of notifications for the current user.
 *
 * Auth via Better Auth session cookie. Sends:
 *  - "data: <json>\n\n" on each new notification
 *  - ": ping\n\n" comment heartbeat every 25s (defeats proxy buffering)
 *
 * Closes from server when client disconnects (controller throws on enqueue).
 */
import {
  moduleRequestStatus,
  requireReleasedModuleRequest,
} from "@/lib/acl/released-module-request";
import { subscribeUser, type SsePayload } from "@/lib/notification/sse-emitter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const channel = new URL(request.url).searchParams.get("channel") ?? "notifications";
  if (channel !== "notifications" && channel !== "comments") {
    return new Response("Bad request", { status: 400 });
  }

  const moduleKey = channel === "comments" ? "van-hanh.cong-viec" : "thong-bao";
  let userId: string;
  try {
    ({ userId } = await requireReleasedModuleRequest(moduleKey));
  } catch (error) {
    const status = moduleRequestStatus(error);
    const message =
      status === 503
        ? "Module đang phát triển"
        : status === 500
          ? "Lỗi hệ thống"
          : status === 403
            ? "Forbidden"
            : "Unauthorized";
    return new Response(message, { status });
  }
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      };

      // Initial connection event
      safeEnqueue(encoder.encode(`event: ready\ndata: {"userId":"${userId}"}\n\n`));

      unsubscribe = subscribeUser(userId, (payload: SsePayload) => {
        if (channel === "comments" && payload.type !== "comment") return;
        if (channel === "notifications" && payload.type !== "notification") return;
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      });

      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`: ping\n\n`));
      }, 25_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
