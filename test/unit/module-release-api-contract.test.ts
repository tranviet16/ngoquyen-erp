import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireReleased: vi.fn(),
  listNotifications: vi.fn(),
  countUnread: vi.fn(),
  getAttachment: vi.fn(),
}));

vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: mocks.requireReleased,
  moduleRequestStatus: vi.fn(() => 503),
}));
vi.mock("@/lib/notification/notification-service", () => ({
  listMyNotifications: mocks.listNotifications,
  countMyUnread: mocks.countUnread,
}));
vi.mock("@/lib/task/attachment-service", () => ({
  getAttachmentForDownload: mocks.getAttachment,
}));

import { GET as getNotifications } from "@/app/api/notifications/route";
import { GET as getNotificationStream } from "@/app/api/notifications/stream/route";
import { GET as getAttachment } from "@/app/api/tasks/[id]/attachments/[attId]/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireReleased.mockRejectedValue(new Error("internal rollout detail"));
});

describe("module release API contracts", () => {
  it("returns a stable 503 without querying notification data", async () => {
    const response = await getNotifications();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Module đang phát triển" });
    expect(mocks.requireReleased).toHaveBeenCalledWith("thong-bao");
    expect(mocks.listNotifications).not.toHaveBeenCalled();
    expect(mocks.countUnread).not.toHaveBeenCalled();
  });

  it.each([
    ["notifications", "thong-bao"],
    ["comments", "van-hanh.cong-viec"],
  ])("scopes the %s stream to its owning module", async (channel, moduleKey) => {
    const response = await getNotificationStream(
      new Request(`http://localhost/api/notifications/stream?channel=${channel}`),
    );
    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("Module đang phát triển");
    expect(mocks.requireReleased).toHaveBeenCalledWith(moduleKey);
  });

  it("blocks attachment data before opening a stream and hides internal errors", async () => {
    const response = await getAttachment(new Request("http://localhost"), {
      params: Promise.resolve({ id: "1", attId: "42" }),
    });
    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("Module đang phát triển");
    expect(mocks.requireReleased).toHaveBeenCalledWith("van-hanh.cong-viec");
    expect(mocks.getAttachment).not.toHaveBeenCalled();
  });
});
