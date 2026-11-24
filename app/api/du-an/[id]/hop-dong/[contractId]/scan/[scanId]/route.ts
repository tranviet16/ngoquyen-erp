/**
 * Tải / xem bản scan hợp đồng. Ai đọc được công trình thì tải được; mỗi lượt ghi một dòng audit
 * ("download" hoặc "view"). Thứ tự: parse id → guard đọc công trình theo id trên URL → tra scan còn hiệu
 * lực của hợp đồng còn hiệu lực thuộc đúng công trình → kiểm tệp tồn tại → audit → stream.
 *
 * Header theo MIME: mặc định `attachment`; `?xem=1` với ảnh là `inline` + CSP sandbox; với PDF là
 * `inline` không sandbox (trình xem PDF của Chromium sẽ trắng trang) mà dùng CSP chặt.
 */
import { Readable } from "node:stream";
import { moduleRequestStatus, requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { writeAuditLog } from "@/lib/audit";
import { openContractScan } from "@/lib/du-an/contract-scan-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; contractId: string; scanId: string }>;
}

function encodeRfc5987(filename: string): string {
  return encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, "%2A");
}

const MODULE_MESSAGE: Record<number, string> = { 401: "Unauthorized", 403: "Forbidden", 503: "Module đang phát triển" };

export async function GET(req: Request, { params }: Params): Promise<Response> {
  const raw = await params;
  const [projectId, contractId, scanId] = [raw.id, raw.contractId, raw.scanId].map(Number);
  if (![projectId, contractId, scanId].every((n) => Number.isInteger(n) && n > 0)) {
    return new Response("Bad request", { status: 400 });
  }

  let userId: string;
  try {
    ({ userId } = await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } }));
  } catch (err) {
    const status = moduleRequestStatus(err);
    if (status === 500) throw err;
    return new Response(MODULE_MESSAGE[status] ?? "Forbidden", { status });
  }

  try {
    const scan = await openContractScan(projectId, contractId, scanId);
    if (scan.kind === "not_found") return new Response("Không tìm thấy bản scan", { status: 404 });
    if (scan.kind === "missing_file") {
      console.error(`[du-an/scan] dòng #${scan.id} còn nhưng tệp không có trên kho lưu`);
      return new Response("Không tìm thấy tệp trên ổ lưu trữ", { status: 404 });
    }

    const view = new URL(req.url).searchParams.get("xem") === "1";
    await writeAuditLog({ tableName: "ProjectContractAttachment", recordId: String(scan.id), action: view ? "view" : "download", userId });

    const safeAscii = scan.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
    const headers: Record<string, string> = {
      "Content-Type": scan.mimeType,
      "Content-Length": String(scan.sizeBytes),
      "Content-Disposition": `${view ? "inline" : "attachment"}; filename="${safeAscii}"; filename*=UTF-8''${encodeRfc5987(scan.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    };
    if (view) {
      headers["Content-Security-Policy"] =
        scan.mimeType === "application/pdf" ? "default-src 'none'; object-src 'self'; frame-ancestors 'none'" : "sandbox";
    }
    return new Response(Readable.toWeb(scan.stream) as ReadableStream<Uint8Array>, { headers });
  } catch (err) {
    console.error("[du-an/scan] tải bản scan thất bại", err);
    return new Response("Lỗi hệ thống", { status: 500 });
  }
}
