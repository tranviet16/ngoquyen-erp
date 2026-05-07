import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserContext, type UserContext } from "@/lib/department-rbac";
import { getDeptAccessMap, hasDeptAccess, type DeptAccessMap } from "@/lib/dept-access";
import { safeFilename, store } from "@/lib/storage";
import { canDeleteAttachment } from "./attachment-rbac";
import { validateMagicBytes } from "./file-signature";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
]);

export interface AttachmentRow {
  id: number;
  taskId: number;
  uploaderId: string;
  uploaderName: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  canDelete: boolean;
}

async function requireSession(): Promise<{ userId: string; role: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  return { userId: session.user.id, role: session.user.role ?? "viewer" };
}

async function requireContext(): Promise<{ ctx: UserContext; role: string; accessMap: DeptAccessMap }> {
  const { userId, role } = await requireSession();
  const ctx = await getUserContext(userId);
  if (!ctx) throw new Error("Không tìm thấy thông tin người dùng");
  const accessMap = await getDeptAccessMap(userId);
  return { ctx, role, accessMap };
}

function canAccessTask(
  task: { creatorId: string; deptId: number },
  ctx: UserContext,
  accessMap: DeptAccessMap,
  min: "read" | "comment" | "edit",
): boolean {
  if (task.creatorId === ctx.userId) return true;
  return hasDeptAccess(accessMap, task.deptId, min);
}

export async function listAttachments(taskId: number): Promise<AttachmentRow[]> {
  const { ctx, role, accessMap } = await requireContext();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, deptId: true, creatorId: true },
  });
  if (!task) throw new Error("Không tìm thấy task");
  if (!canAccessTask(task, ctx, accessMap, "read")) throw new Error("Bạn không có quyền xem task này");

  const rows = await prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    uploaderId: r.uploaderId,
    uploaderName: r.uploader?.name ?? null,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    canDelete: canDeleteAttachment(r, task, ctx, role),
  }));
}

export async function uploadAttachment(taskId: number, file: File): Promise<AttachmentRow> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File vượt quá 25MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Loại file không được phép: ${file.type || "unknown"}`);
  }

  const { ctx, accessMap } = await requireContext();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, deptId: true, creatorId: true },
  });
  if (!task) throw new Error("Không tìm thấy task");
  if (!canAccessTask(task, ctx, accessMap, "edit")) throw new Error("Bạn không có quyền với task này");

  const original = safeFilename(file.name || "file");
  const uuid = randomUUID();
  const relPath = `task-attachments/${taskId}/${uuid}-${original}`;
  const buf = Buffer.from(await file.arrayBuffer());

  if (!validateMagicBytes(buf, file.type)) {
    throw new Error("Nội dung file không khớp định dạng được khai báo");
  }

  const { size } = await store.putFile(relPath, buf);

  try {
    const created = await prisma.taskAttachment.create({
      data: {
        taskId,
        uploaderId: ctx.userId,
        filename: original,
        storedPath: relPath,
        mimeType: file.type,
        sizeBytes: size,
      },
      include: { uploader: { select: { id: true, name: true } } },
    });
    return {
      id: created.id,
      taskId: created.taskId,
      uploaderId: created.uploaderId,
      uploaderName: created.uploader?.name ?? null,
      filename: created.filename,
      mimeType: created.mimeType,
      sizeBytes: created.sizeBytes,
      createdAt: created.createdAt,
      canDelete: true,
    };
  } catch (err) {
    // Roll back the file write so we don't leave orphans on DB failure.
    await store.deleteFile(relPath).catch(() => {});
    throw err;
  }
}

export async function deleteAttachment(id: number): Promise<void> {
  const { ctx, role } = await requireContext();
  const att = await prisma.taskAttachment.findUnique({
    where: { id },
    include: { task: { select: { deptId: true, creatorId: true } } },
  });
  if (!att) throw new Error("Không tìm thấy file");
  if (!canDeleteAttachment(att, att.task, ctx, role)) {
    throw new Error("Bạn không có quyền xoá file này");
  }
  // Delete file first; ignore ENOENT (handled in store). DB row removed regardless.
  await store.deleteFile(att.storedPath).catch(() => {});
  await prisma.taskAttachment.delete({ where: { id } });
}

export async function getAttachmentForDownload(id: number): Promise<{
  stream: Readable;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const { ctx, accessMap } = await requireContext();
  const att = await prisma.taskAttachment.findUnique({
    where: { id },
    include: { task: { select: { deptId: true, creatorId: true } } },
  });
  if (!att) throw new Error("Không tìm thấy file");
  if (!canAccessTask(att.task, ctx, accessMap, "read")) {
    throw new Error("Bạn không có quyền tải file này");
  }
  return {
    stream: store.getStream(att.storedPath),
    filename: att.filename,
    mimeType: att.mimeType,
    sizeBytes: att.sizeBytes,
  };
}
