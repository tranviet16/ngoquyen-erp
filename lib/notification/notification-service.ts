import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToUser } from "./sse-emitter";

export type NotificationType =
  | "form_submitted"
  | "form_approved"
  | "form_rejected"
  | "form_revising"
  | "task_assigned"
  | "task_status_changed"
  | "task_unassigned"
  | "comment_mention";

type TxClient = Pick<typeof prisma, "notification">;

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}

export async function createNotification(
  input: CreateNotificationInput,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? prisma;
  const created = await client.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
    },
  });
  broadcastToUser(input.userId, {
    type: "notification",
    id: created.id,
    title: created.title,
    body: created.body,
    link: created.link,
    createdAt: created.createdAt.toISOString(),
  });
}

export async function createNotificationsBulk(
  inputs: CreateNotificationInput[],
  tx?: TxClient,
): Promise<void> {
  if (inputs.length === 0) return;
  const client = tx ?? prisma;
  for (const input of inputs) {
    const created = await client.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      },
    });
    broadcastToUser(input.userId, {
      type: "notification",
      id: created.id,
      title: created.title,
      body: created.body,
      link: created.link,
      createdAt: created.createdAt.toISOString(),
    });
  }
}

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  return session.user.id;
}

export async function listMyNotifications(opts: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Array<{
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}>> {
  const userId = await requireUserId();
  const limit = Math.min(opts.limit ?? 50, 200);
  return prisma.notification.findMany({
    where: {
      userId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countMyUnread(): Promise<number> {
  const userId = await requireUserId();
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(id: number): Promise<void> {
  const userId = await requireUserId();
  await prisma.$transaction(async (tx) => {
    const n = await tx.notification.findUnique({ where: { id } });
    if (!n) throw new Error("Không tìm thấy thông báo");
    if (n.userId !== userId) throw new Error("Không có quyền");
    if (n.readAt) return;
    await tx.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  });
}

export async function markAllRead(): Promise<number> {
  const userId = await requireUserId();
  const unread = await prisma.notification.findMany({
    where: { userId, readAt: null },
    select: { id: true },
  });
  if (unread.length === 0) return 0;
  const now = new Date();
  await prisma.$transaction(
    unread.map((n) =>
      prisma.notification.update({
        where: { id: n.id },
        data: { readAt: now },
      }),
    ),
  );
  return unread.length;
}
