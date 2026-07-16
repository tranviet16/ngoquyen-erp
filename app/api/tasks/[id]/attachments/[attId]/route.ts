import { Readable } from "node:stream";
import { getAttachmentForDownload } from "@/lib/task/attachment-service";
import {
  moduleRequestStatus,
  requireReleasedModuleRequest,
} from "@/lib/acl/released-module-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; attId: string }>;
}

function encodeRfc5987(filename: string): string {
  return encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, "%2A");
}

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { attId } = await params;
  const id = Number(attId);
  if (!Number.isInteger(id)) return new Response("Bad request", { status: 400 });

  try {
    await requireReleasedModuleRequest("van-hanh.cong-viec");
    const { stream, filename, mimeType, sizeBytes } = await getAttachmentForDownload(id);
    const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    const safeAscii = filename.replace(/[^\x20-\x7e]/g, "_");
    return new Response(webStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(sizeBytes),
        "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeRfc5987(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const moduleStatus = moduleRequestStatus(err);
    if (moduleStatus !== 500) {
      const message =
        moduleStatus === 503
          ? "Module đang phát triển"
          : moduleStatus === 403
            ? "Forbidden"
            : "Unauthorized";
      return new Response(message, { status: moduleStatus });
    }
    const msg = err instanceof Error ? err.message : "Lỗi";
    const status = /quyền/i.test(msg) ? 403 : /không tìm thấy/i.test(msg) ? 404 : 500;
    return new Response(status === 500 ? "Lỗi hệ thống" : msg, { status });
  }
}
