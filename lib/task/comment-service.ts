import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserContext, type UserContext } from "@/lib/department-rbac";
import { getDeptAccessMap, hasDeptAccess, type DeptAccessMap } from "@/lib/dept-access";
import { broadcastToUser } from "@/lib/notification/sse-emitter";
import { createNotification } from "@/lib/notification/notification-service";
import { canEditComment, canDeleteComment, COMMENT_EDIT_WINDOW_MS } from "./comment-rbac";
import { extractMentions } from "./mention-parser";

export interface CommentRow {
  id: number;
  taskId: number;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  canEdit: boolean;
  canDelete: boolean;
}

const MAX_BODY = 4000;

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

function sanitizeBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Bình luận không được để trống");
  if (trimmed.length > MAX_BODY) throw new Error(`Bình luận tối đa ${MAX_BODY} ký tự`);
  return trimmed;
}

function shorten(s: string, n = 120): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1) + "…" : flat;
}

export async function listComments(taskId: number): Promise<CommentRow[]> {
  const { ctx, role, accessMap } = await requireContext();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, deptId: true, creatorId: true },
  });
  if (!task) throw new Error("Không tìm thấy task");
  if (!canAccessTask(task, ctx, accessMap, "read")) throw new Error("Bạn không có quyền xem task này");

  const rows = await prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    authorId: r.authorId,
    authorName: r.author?.name ?? null,
    body: r.body,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
    canEdit: canEditComment(r, ctx.userId, now),
    canDelete: canDeleteComment(r, task, ctx, role),
  }));
}

export async function createComment(taskId: number, bodyRaw: string): Promise<CommentRow> {
  const body = sanitizeBody(bodyRaw);
  const { ctx, role, accessMap } = await requireContext();

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: { id: true, deptId: true, creatorId: true, assigneeId: true, title: true },
    });
    if (!task) throw new Error("Không tìm thấy task");
    if (!canAccessTask(task, ctx, accessMap, "comment")) throw new Error("Bạn không có quyền bình luận task này");

    const created = await tx.taskComment.create({
      data: { taskId, authorId: ctx.userId, body },
      include: { author: { select: { id: true, name: true } } },
    });

    // Notification fan-out: assignee + creator, skip self, dedupe.
    const recipients = new Set<string>();
    if (task.assigneeId && task.assigneeId !== ctx.userId) recipients.add(task.assigneeId);
    if (task.creatorId && task.creatorId !== ctx.userId) recipients.add(task.creatorId);

    const authorLabel = created.author?.name ?? "Người dùng";

    // Resolve @email mentions; mentions are explicit so they bypass the
    // 5-min coalesce check and are always notified.
    const mentionEmails = extractMentions(body);
    const mentionedIds = new Set<string>();
    if (mentionEmails.length > 0) {
      const mentionedUsers = await tx.user.findMany({
        where: { email: { in: mentionEmails, mode: "insensitive" } },
        select: { id: true },
      });
      for (const u of mentionedUsers) {
        if (u.id !== ctx.userId) mentionedIds.add(u.id);
      }
    }

    for (const userId of mentionedIds) {
      await createNotification(
        {
          userId,
          type: "comment_mention",
          title: `${authorLabel} đã nhắc bạn trong "${task.title}"`,
          body: shorten(body),
          link: `/van-hanh/cong-viec?taskId=${taskId}`,
        },
        tx,
      );
      // Don't double-notify mentioned recipients via the coalesced path.
      recipients.delete(userId);
    }

    if (recipients.size > 0) {
      // Coalesce: skip if same actor commented on same task within 5 min.
      const since = new Date(Date.now() - 5 * 60 * 1000);
      const recent = await tx.taskComment.findFirst({
        where: {
          taskId,
          authorId: ctx.userId,
          id: { not: created.id },
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (!recent) {
        for (const userId of recipients) {
          await createNotification(
            {
              userId,
              type: "task_status_changed",
              title: `${authorLabel} đã bình luận trong "${task.title}"`,
              body: shorten(body),
              link: `/van-hanh/cong-viec?taskId=${taskId}`,
            },
            tx,
          );
        }
      }
    }

    // SSE comment push to anyone who can view this task — only signal to
    // assignee + creator; client filters by taskId. Cheaper than a full
    // dept-wide channel since the drawer is open in at most a handful of tabs.
    const ssePayload = {
      type: "comment" as const,
      taskId,
      commentId: created.id,
      action: "created" as const,
      authorId: ctx.userId,
      authorName: created.author?.name ?? null,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      editedAt: null,
    };
    const sseSent = new Set<string>();
    if (task.assigneeId) {
      broadcastToUser(task.assigneeId, ssePayload);
      sseSent.add(task.assigneeId);
    }
    if (task.creatorId && !sseSent.has(task.creatorId)) {
      broadcastToUser(task.creatorId, ssePayload);
      sseSent.add(task.creatorId);
    }
    for (const uid of mentionedIds) {
      if (!sseSent.has(uid)) broadcastToUser(uid, ssePayload);
    }

    return {
      id: created.id,
      taskId: created.taskId,
      authorId: created.authorId,
      authorName: created.author?.name ?? null,
      body: created.body,
      createdAt: created.createdAt,
      editedAt: created.editedAt,
      canEdit: true,
      canDelete: true,
    };
  });
}

export async function editComment(commentId: number, bodyRaw: string): Promise<CommentRow> {
  const body = sanitizeBody(bodyRaw);
  const { ctx, role } = await requireContext();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.taskComment.findUnique({
      where: { id: commentId },
      include: { task: { select: { id: true, deptId: true, creatorId: true, assigneeId: true } } },
    });
    if (!existing) throw new Error("Không tìm thấy bình luận");
    if (!canEditComment(existing, ctx.userId)) {
      throw new Error("Hết thời gian sửa (5 phút) hoặc bạn không phải tác giả");
    }

    const updated = await tx.taskComment.update({
      where: { id: commentId },
      data: { body, editedAt: new Date() },
      include: { author: { select: { id: true, name: true } } },
    });

    const ssePayload = {
      type: "comment" as const,
      taskId: existing.taskId,
      commentId: updated.id,
      action: "edited" as const,
      authorId: updated.authorId,
      authorName: updated.author?.name ?? null,
      body: updated.body,
      createdAt: updated.createdAt.toISOString(),
      editedAt: updated.editedAt?.toISOString() ?? null,
    };
    const t = existing.task;
    if (t.assigneeId) broadcastToUser(t.assigneeId, ssePayload);
    if (t.creatorId && t.creatorId !== t.assigneeId) broadcastToUser(t.creatorId, ssePayload);

    return {
      id: updated.id,
      taskId: updated.taskId,
      authorId: updated.authorId,
      authorName: updated.author?.name ?? null,
      body: updated.body,
      createdAt: updated.createdAt,
      editedAt: updated.editedAt,
      canEdit: canEditComment(updated, ctx.userId),
      canDelete: true,
    };
  });
}

export async function deleteComment(commentId: number): Promise<void> {
  const { ctx, role } = await requireContext();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.taskComment.findUnique({
      where: { id: commentId },
      include: { task: { select: { id: true, deptId: true, creatorId: true, assigneeId: true } } },
    });
    if (!existing) throw new Error("Không tìm thấy bình luận");
    if (!canDeleteComment(existing, existing.task, ctx, role)) {
      throw new Error("Bạn không có quyền xoá bình luận này");
    }
    await tx.taskComment.delete({ where: { id: commentId } });

    const ssePayload = {
      type: "comment" as const,
      taskId: existing.taskId,
      commentId: existing.id,
      action: "deleted" as const,
      authorId: existing.authorId,
      authorName: null,
      body: null,
      createdAt: existing.createdAt.toISOString(),
      editedAt: existing.editedAt?.toISOString() ?? null,
    };
    const t = existing.task;
    if (t.assigneeId) broadcastToUser(t.assigneeId, ssePayload);
    if (t.creatorId && t.creatorId !== t.assigneeId) broadcastToUser(t.creatorId, ssePayload);
  });
}

export { COMMENT_EDIT_WINDOW_MS };
