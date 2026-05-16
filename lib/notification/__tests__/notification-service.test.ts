import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  notification: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const mockAuth = vi.hoisted(() => ({ getSession: vi.fn() }));
const mockSse = vi.hoisted(() => ({ broadcastToUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: mockAuth } }));
vi.mock("@/lib/notification/sse-emitter", () => mockSse);

import {
  createNotification,
  createNotificationsBulk,
  listMyNotifications,
  countMyUnread,
  markRead,
} from "@/lib/notification/notification-service";

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.getSession.mockResolvedValue({ user: { id: "u1" } });
});

const created = (id: number) => ({
  id,
  title: "T",
  body: "B",
  link: null,
  createdAt: new Date("2026-05-16T00:00:00Z"),
});

describe("createNotification", () => {
  it("persists the notification and broadcasts it over SSE", async () => {
    mockDb.notification.create.mockResolvedValue(created(1));
    await createNotification({ userId: "u1", type: "task_assigned", title: "T", body: "B" });
    expect(mockDb.notification.create).toHaveBeenCalledOnce();
    expect(mockSse.broadcastToUser).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ type: "notification", id: 1 }),
    );
  });
});

describe("createNotificationsBulk", () => {
  it("does nothing for an empty input list", async () => {
    await createNotificationsBulk([]);
    expect(mockDb.notification.create).not.toHaveBeenCalled();
  });

  it("creates and broadcasts one notification per input", async () => {
    mockDb.notification.create.mockResolvedValueOnce(created(1)).mockResolvedValueOnce(created(2));
    await createNotificationsBulk([
      { userId: "u1", type: "task_assigned", title: "T", body: "B" },
      { userId: "u2", type: "comment_mention", title: "T", body: "B" },
    ]);
    expect(mockDb.notification.create).toHaveBeenCalledTimes(2);
    expect(mockSse.broadcastToUser).toHaveBeenCalledTimes(2);
  });
});

describe("listMyNotifications", () => {
  it("caps the limit at 200 and filters unread when requested", async () => {
    mockDb.notification.findMany.mockResolvedValue([]);
    await listMyNotifications({ unreadOnly: true, limit: 999 });
    const arg = mockDb.notification.findMany.mock.calls[0][0];
    expect(arg.take).toBe(200);
    expect(arg.where).toEqual({ userId: "u1", readAt: null });
  });
});

describe("countMyUnread", () => {
  it("counts unread notifications for the current user", async () => {
    mockDb.notification.count.mockResolvedValue(4);
    expect(await countMyUnread()).toBe(4);
  });
});

describe("markRead", () => {
  it("rejects marking another user's notification", async () => {
    mockDb.$transaction.mockImplementation((fn) => fn(mockDb));
    mockDb.notification.findUnique.mockResolvedValue({ id: 1, userId: "other", readAt: null });
    await expect(markRead(1)).rejects.toThrow("Không có quyền");
  });

  it("throws when the notification does not exist", async () => {
    mockDb.$transaction.mockImplementation((fn) => fn(mockDb));
    mockDb.notification.findUnique.mockResolvedValue(null);
    await expect(markRead(1)).rejects.toThrow("Không tìm thấy thông báo");
  });
});
