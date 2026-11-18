/**
 * Bản scan của hợp đồng dự án: kiểm tệp, ghi / xóa tệp ở kho lưu (`UPLOAD_DIR`), dòng
 * `project_contract_attachments`. Quyền do nơi gọi kiểm (server action / route GET).
 *
 * Mọi lời gọi kho lưu bọc try/catch: lỗi chi tiết chỉ ghi log phía server, ra ngoài là câu cố định
 * `STORAGE_ERROR_MESSAGE`, nên đường dẫn trên máy chủ không bao giờ tới client.
 *
 * Cố ý KHÔNG nằm trong file "use server": hàm nội bộ, không được lộ thành server action.
 */

import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { safeFilename, store } from "@/lib/storage";
import { validateMagicBytes } from "@/lib/task/file-signature";

export const MAX_SCAN_BYTES = 25 * 1024 * 1024;
export const SCAN_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type ScanMimeType = (typeof SCAN_MIME_TYPES)[number];

const EXT_MIME: Record<string, ScanMimeType> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
const MAX_NAME_BYTES = 150;

/** Câu báo lỗi kho lưu: cố định, không chứa đường dẫn; chi tiết (gồm đường dẫn) chỉ ghi log. */
export const STORAGE_ERROR_MESSAGE = "Không lưu được tệp, liên hệ admin";

async function storageCall<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[du-an/scan] ${what} thất bại`, err);
    // Error thuần: `runAction` trả nguyên văn câu cố định này cho người dùng.
    throw new Error(STORAGE_ERROR_MESSAGE);
  }
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const isScanMime = (t: string): t is ScanMimeType => (SCAN_MIME_TYPES as readonly string[]).includes(t);

/**
 * MIME của tệp: MIME khai báo nếu thuộc whitelist, không thì suy từ đuôi tệp (trình duyệt có thể khai
 * `application/octet-stream`, `image/pjpeg`…). Nội dung vẫn được kiểm bằng chữ ký đầu tệp.
 */
export function scanMimeOf(name: string, declared: string): ScanMimeType | null {
  if (isScanMime(declared)) return declared;
  return EXT_MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

/** Tên lưu: `safeFilename` rồi cắt theo byte UTF-8 (≤ 150 byte), giữ đuôi tệp khi được. */
export function storedName(name: string): string {
  const safe = safeFilename(name);
  const enc = new TextEncoder();
  if (enc.encode(safe).length <= MAX_NAME_BYTES) return safe;
  const dot = safe.lastIndexOf(".");
  const ext = dot > 0 && safe.length - dot <= 10 ? safe.slice(dot) : "";
  let stem = safe.slice(0, safe.length - ext.length);
  while (stem.length > 0 && enc.encode(stem + ext).length > MAX_NAME_BYTES) stem = [...stem].slice(0, -1).join("");
  return (stem || "file") + ext;
}

/** Kiểm cỡ và loại (trước khi đọc nội dung). Ném Error tiếng Việt nêu tên tệp. */
export function assertScanAcceptable(file: { name: string; size: number; type: string }): ScanMimeType {
  const mime = scanMimeOf(file.name, file.type);
  if (!mime) throw new Error(`«${file.name}»: chỉ nhận PDF, JPG, PNG`);
  if (file.size > MAX_SCAN_BYTES) throw new Error(`«${file.name}» nặng ${formatMb(file.size)} MB, tối đa 25 MB`);
  if (file.size < 1) throw new Error(`«${file.name}»: tệp rỗng`);
  return mime;
}

/** Ghi tệp trước, tạo dòng sau; tạo dòng lỗi thì xóa tệp vừa ghi. Trả id dòng mới. */
export async function saveContractScan(args: { projectId: number; contractId: number; uploaderId: string; file: File }): Promise<number> {
  const { projectId, contractId, uploaderId, file } = args;
  const mimeType = assertScanAcceptable(file);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!validateMagicBytes(buf, mimeType)) throw new Error(`«${file.name}»: nội dung không đúng định dạng`);

  const filename = storedName(file.name || "file");
  const storedPath = `contract-scans/${projectId}/${contractId}/${randomUUID()}-${filename}`;
  const { size } = await storageCall("ghi tệp", () => store.putFile(storedPath, buf));
  try {
    const row = await prisma.projectContractAttachment.create({
      data: { contractId, uploaderId, filename, storedPath, mimeType, sizeBytes: size },
    });
    return row.id;
  } catch (err) {
    await store.deleteFile(storedPath).catch((e) => console.error("[du-an/scan] dọn tệp sau lỗi tạo dòng thất bại", e));
    throw err;
  }
}

/** Xóa mềm: đặt `deletedAt`, tệp giữ trên đĩa. */
export async function softDeleteScan(scanId: number): Promise<void> {
  await prisma.projectContractAttachment.update({ where: { id: scanId }, data: { deletedAt: new Date() } });
}

/** Xóa vĩnh viễn: xóa cứng dòng (audit "delete" tự ghi), rồi xóa tệp; tệp không xóa được chỉ ghi log. */
export async function purgeScan(scanId: number, storedPath: string): Promise<void> {
  await prisma.projectContractAttachment.delete({ where: { id: scanId }, select: { id: true } });
  await store.deleteFile(storedPath).catch((e) => console.error("[du-an/scan] xóa tệp khi xóa vĩnh viễn thất bại", e));
}

export type ScanOpenResult =
  | { kind: "not_found" }
  | { kind: "missing_file"; id: number }
  | { kind: "ok"; id: number; filename: string; mimeType: ScanMimeType; sizeBytes: number; stream: Readable };

/** Bản scan còn hiệu lực của hợp đồng còn hiệu lực thuộc đúng công trình; tệp thiếu thì báo riêng. */
export async function openContractScan(projectId: number, contractId: number, scanId: number): Promise<ScanOpenResult> {
  const scan = await prisma.projectContractAttachment.findFirst({
    where: { id: scanId, contractId, deletedAt: null, contract: { projectId, deletedAt: null } },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, storedPath: true },
  });
  const mime = scan ? scanMimeOf("", scan.mimeType) : null;
  if (!scan || !mime) return { kind: "not_found" };
  if (!(await storageCall("kiểm tệp", () => store.exists(scan.storedPath)))) return { kind: "missing_file", id: scan.id };
  const stream = await storageCall("mở tệp", async () => store.getStream(scan.storedPath));
  return { kind: "ok", id: scan.id, filename: scan.filename, mimeType: mime, sizeBytes: scan.sizeBytes, stream };
}
