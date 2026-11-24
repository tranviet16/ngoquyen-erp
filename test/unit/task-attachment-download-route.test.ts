import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findAttachment: vi.fn(),
  getUserContext: vi.fn(),
  getDeptAccessMap: vi.fn(),
  hasDeptAccess: vi.fn(),
  exists: vi.fn(),
  getStream: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { taskAttachment: { findUnique: mocks.findAttachment } },
}));
vi.mock("@/lib/department-rbac", () => ({ getUserContext: mocks.getUserContext }));
vi.mock("@/lib/dept-access", () => ({
  getDeptAccessMap: mocks.getDeptAccessMap,
  hasDeptAccess: mocks.hasDeptAccess,
}));
vi.mock("@/lib/storage", () => ({
  store: { exists: mocks.exists, getStream: mocks.getStream },
  safeFilename: (name: string) => name,
}));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn(async () => undefined),
  moduleRequestStatus: vi.fn(() => 500),
}));

import { GET } from "@/app/api/tasks/[id]/attachments/[attId]/route";

const content = Buffer.from("%PDF-1.4 attachment body");

function download(attId = "7") {
  return GET(new Request(`http://localhost/api/tasks/3/attachments/${attId}`), {
    params: Promise.resolve({ id: "3", attId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "viewer" } });
  mocks.getUserContext.mockResolvedValue({ userId: "u1" });
  mocks.getDeptAccessMap.mockResolvedValue(new Map());
  mocks.hasDeptAccess.mockReturnValue(true);
  mocks.findAttachment.mockResolvedValue({
    id: 7,
    taskId: 3,
    filename: "biên bản.pdf",
    storedPath: "task-attachments/3/uuid-bien-ban.pdf",
    mimeType: "application/pdf",
    sizeBytes: content.length,
    task: { deptId: 2, creatorId: "someone-else" },
  });
  mocks.getStream.mockImplementation(() => Readable.from([content]));
});

describe("GET task attachment download", () => {
  it("streams the stored file with its name and size", async () => {
    mocks.exists.mockResolvedValue(true);

    const response = await download();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe(String(content.length));
    expect(response.headers.get("Content-Disposition")).toContain("filename*=UTF-8''bi%C3%AAn%20b%E1%BA%A3n.pdf");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(content);
    expect(mocks.exists).toHaveBeenCalledWith("task-attachments/3/uuid-bien-ban.pdf");
  });

  it("answers 404 without opening a stream when the file is gone from storage", async () => {
    mocks.exists.mockResolvedValue(false);

    const response = await download();

    expect(response.status).toBe(404);
    expect(await response.text()).toMatch(/Không tìm thấy file/);
    expect(mocks.getStream).not.toHaveBeenCalled();
  });

  it("checks access before touching storage", async () => {
    mocks.hasDeptAccess.mockReturnValue(false);

    const response = await download();

    expect(response.status).toBe(403);
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.getStream).not.toHaveBeenCalled();
  });
});
