/**
 * Integration test: bản scan hợp đồng dự án — server action (tải lên / xóa mềm / xóa vĩnh viễn) và route
 * GET tải / xem, trên Postgres thật, kho lưu tệp thật (thư mục tạm), ACL thật (phiên giả lập).
 *  - allow: người sửa tải lên PDF / JPG / PNG; người đọc tải về được, header đúng theo MIME;
 *  - deny: người đọc không tải lên / xóa; người không phải admin không xóa vĩnh viễn; tệp đổi đuôi,
 *    tệp quá 25 MB bị chặn bằng câu tiếng Việt; lỗi kho lưu không lộ đường dẫn;
 *  - cross-scope: không có quyền dự án → 403; scan / hợp đồng của nơi khác → 404; IDOR action;
 *  - audit: mỗi thao tác (kể cả tải về / xem) đúng một dòng audit có người thao tác;
 *  - recovery: hợp đồng / scan đã xóa → 404, tệp vẫn còn; tệp mất → 404; tạo dòng lỗi thì dọn tệp;
 *    admin xóa vĩnh viễn rồi thì hoàn tác import không còn bị scan chặn.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rmSync } from "node:fs";

const UPLOAD_ROOT = vi.hoisted(() => {
  // Kho lưu đọc UPLOAD_DIR lúc nạp module → đặt trước mọi import.
  const dir = `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/nq-scan-it-${process.pid}`;
  process.env.UPLOAD_DIR = dir;
  return dir;
});

import { authMock, clearSession, mockSession } from "@/test/helpers/session-mock";
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { prisma } from "@/lib/prisma";
import { store } from "@/lib/storage";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { deleteContractScan, purgeContractScan, uploadContractScan } from "@/app/(app)/du-an/[id]/hop-dong/[contractId]/scan-actions";
import { GET } from "@/app/api/du-an/[id]/hop-dong/[contractId]/scan/[scanId]/route";
import { rollbackImportRun } from "@/lib/import/import-engine";

const ADMIN = "sc-admin";
const EDITOR = "sc-editor"; // sửa P1
const READER = "sc-reader"; // đọc P1
const OUTSIDER = "sc-outsider"; // không có quyền dự án
const NOT_FOUND = "Không tìm thấy hợp đồng ở công trình này";

const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 0x20)]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

interface World { p1: number; p2: number; c1: number; c2: number }

async function seed(): Promise<World> {
  for (const [id, role] of [[ADMIN, "admin"], [EDITOR, "viewer"], [READER, "viewer"], [OUTSIDER, "viewer"]]) {
    await prisma.user.create({ data: { id, name: `Người ${id}`, email: `${id}@test.local`, role } });
  }
  const p1 = await prisma.project.create({ data: { code: "SC-1", name: "CT 1", status: "active" } });
  const p2 = await prisma.project.create({ data: { code: "SC-2", name: "CT 2", status: "active" } });
  for (const [userId, level] of [[EDITOR, "edit"], [READER, "read"]]) {
    await prisma.modulePermission.create({ data: { userId, moduleKey: "du-an", level: "edit" } });
    await prisma.projectPermission.create({ data: { userId, projectId: p1.id, level } });
  }
  await prisma.modulePermission.create({ data: { userId: OUTSIDER, moduleKey: "du-an", level: "edit" } });
  const c1 = await prisma.projectContract.create({ data: { projectId: p1.id, docName: "HĐ P1", docType: "contract" } });
  const c2 = await prisma.projectContract.create({ data: { projectId: p2.id, docName: "HĐ P2", docType: "contract" } });
  return { p1: p1.id, p2: p2.id, c1: c1.id, c2: c2.id };
}

const as = (id: string) => mockSession({ id, role: id === ADMIN ? "admin" : "viewer" });

function form(projectId: number, contractId: number, file: File) {
  const fd = new FormData();
  fd.set("projectId", String(projectId));
  fd.set("contractId", String(contractId));
  fd.set("file", file);
  return fd;
}

async function upload(w: World, buf: Buffer, name: string, type: string) {
  return uploadContractScan(form(w.p1, w.c1, new File([new Uint8Array(buf)], name, { type })));
}

async function uploaded(w: World, buf = PDF, name = "hop-dong.pdf", type = "application/pdf"): Promise<number> {
  const res = await upload(w, buf, name, type);
  if (!res.ok) throw new Error(res.message);
  return res.id;
}

function get(projectId: number, contractId: number, scanId: number, view = false) {
  const url = `http://localhost/api/du-an/${projectId}/hop-dong/${contractId}/scan/${scanId}${view ? "?xem=1" : ""}`;
  return GET(new Request(url), { params: Promise.resolve({ id: String(projectId), contractId: String(contractId), scanId: String(scanId) }) });
}

const audits = (recordId: number) =>
  prisma.auditLog.findMany({ where: { tableName: "ProjectContractAttachment", recordId: String(recordId) }, orderBy: { id: "asc" } });

describe("bản scan hợp đồng dự án (integration)", () => {
  let w: World;
  beforeEach(async () => {
    clearSession();
    vi.restoreAllMocks();
    rmSync(UPLOAD_ROOT, { recursive: true, force: true });
    await truncateAll();
    w = await seed();
  });
  afterAll(async () => {
    rmSync(UPLOAD_ROOT, { recursive: true, force: true });
    await closeTestDb();
  });

  it("allow: người sửa tải lên PDF / JPG / PNG; người đọc tải về và xem với header đúng theo MIME", async () => {
    as(EDITOR);
    const pdf = await uploaded(w);
    const png = await uploaded(w, PNG, "anh.png", "image/png");
    await uploaded(w, JPG, "anh chụp.jpg", "image/jpeg");
    expect(await prisma.projectContractAttachment.count({ where: { contractId: w.c1 } })).toBe(3);

    as(READER);
    const dl = await get(w.p1, w.c1, pdf);
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer()).equals(PDF)).toBe(true);
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    expect(dl.headers.get("cache-control")).toBe("private, no-store");

    const viewPdf = await get(w.p1, w.c1, pdf, true);
    await viewPdf.arrayBuffer();
    expect(viewPdf.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(viewPdf.headers.get("content-security-policy")).not.toContain("sandbox");
    const viewPng = await get(w.p1, w.c1, png, true);
    await viewPng.arrayBuffer();
    expect(viewPng.headers.get("content-security-policy")).toBe("sandbox");
  });

  it("deny: người đọc không tải lên / xóa; không phải admin không xóa vĩnh viễn; tệp sai bị chặn bằng câu tiếng Việt", async () => {
    as(EDITOR);
    const id = await uploaded(w);
    as(READER);
    expect(await upload(w, PDF, "a.pdf", "application/pdf")).toMatchObject({ ok: false, message: "Bạn không có quyền thao tác này trên công trình." });
    expect((await deleteContractScan(id, w.p1)).ok).toBe(false);
    as(EDITOR);
    expect(await purgeContractScan(id, w.p1)).toEqual({ ok: false, message: "Chỉ admin được thao tác" });

    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100)]);
    expect(await upload(w, exe, "virus.pdf", "application/pdf")).toEqual({ ok: false, message: "«virus.pdf»: nội dung không đúng định dạng" });
    expect(await upload(w, PDF, "x.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
      .toEqual({ ok: false, message: "«x.docx»: chỉ nhận PDF, JPG, PNG" });
    const big = Buffer.concat([PDF, Buffer.alloc(25 * 1024 * 1024 + 1 - PDF.length)]);
    expect(await upload(w, big, "lon.pdf", "application/pdf")).toEqual({ ok: false, message: "«lon.pdf» nặng 25,0 MB, tối đa 25 MB" });
  });

  it("deny: lỗi kho lưu (EACCES) không lộ đường dẫn trên máy chủ", async () => {
    vi.spyOn(store, "putFile").mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied, mkdir '/data/uploads/contract-scans/1'"), { code: "EACCES" }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    as(EDITOR);
    const res = await upload(w, PDF, "a.pdf", "application/pdf");
    expect(res.ok).toBe(false);
    expect(res).toEqual({ ok: false, message: "Không lưu được tệp, liên hệ admin" });
    expect(await prisma.projectContractAttachment.count()).toBe(0);
  });

  it("allow: trình duyệt khai application/octet-stream cho tệp .pdf thật vẫn nhận (suy theo đuôi, kiểm chữ ký)", async () => {
    as(EDITOR);
    const id = await uploaded(w, PDF, "scan.pdf", "application/octet-stream");
    expect(await prisma.projectContractAttachment.findUniqueOrThrow({ where: { id } })).toMatchObject({ mimeType: "application/pdf" });
  });

  it("recovery: hợp đồng đã xóa mềm còn scan — admin vẫn xóa vĩnh viễn được, người sửa thì không", async () => {
    as(EDITOR);
    const id = await uploaded(w);
    await prisma.projectContract.update({ where: { id: w.c1 }, data: { deletedAt: new Date() } });
    expect(await deleteContractScan(id, w.p1)).toEqual({ ok: false, message: NOT_FOUND });
    expect(await purgeContractScan(id, w.p1)).toEqual({ ok: false, message: "Chỉ admin được thao tác" });
    as(ADMIN);
    expect(await purgeContractScan(id, w.p1)).toEqual({ ok: true });
    expect(await prisma.projectContractAttachment.count()).toBe(0);
  });

  it("cross-scope: không có quyền dự án → 403; scan / hợp đồng của nơi khác → 404; IDOR action", async () => {
    as(EDITOR);
    const id = await uploaded(w);
    const otherC1 = await prisma.projectContract.create({ data: { projectId: w.p1, docName: "HĐ khác", docType: "contract" } });
    as(ADMIN);
    const theirs = await uploadContractScan(form(w.p2, w.c2, new File([new Uint8Array(PDF)], "p2.pdf", { type: "application/pdf" })));
    if (!theirs.ok) throw new Error(theirs.message);

    as(OUTSIDER);
    expect((await get(w.p1, w.c1, id)).status).toBe(403);
    as(READER);
    expect((await get(w.p1, otherC1.id, id)).status).toBe(404); // scan của hợp đồng khác
    expect((await get(w.p1, w.c2, theirs.id)).status).toBe(404); // hợp đồng của công trình khác
    expect((await get(w.p2, w.c2, theirs.id)).status).toBe(403);

    as(EDITOR);
    const before = await prisma.projectContractAttachment.count();
    expect(await uploadContractScan(form(w.p1, w.c2, new File([new Uint8Array(PDF)], "x.pdf", { type: "application/pdf" })))).toEqual({ ok: false, message: NOT_FOUND });
    expect(await deleteContractScan(theirs.id, w.p1)).toEqual({ ok: false, message: NOT_FOUND });
    expect(await purgeContractScan(theirs.id, w.p1)).toEqual({ ok: false, message: NOT_FOUND });
    expect(await prisma.projectContractAttachment.count()).toBe(before);
    expect(await prisma.projectContractAttachment.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ deletedAt: null });
  });

  it("audit: tải lên, tải về, xem, xóa mềm, xóa vĩnh viễn đều đúng một dòng có người thao tác", async () => {
    as(EDITOR);
    const id = await uploaded(w);
    as(READER);
    await (await get(w.p1, w.c1, id)).arrayBuffer();
    await (await get(w.p1, w.c1, id, true)).arrayBuffer();
    as(EDITOR);
    expect((await deleteContractScan(id, w.p1)).ok).toBe(true);
    as(ADMIN);
    expect((await purgeContractScan(id, w.p1)).ok).toBe(true);
    const rows = await audits(id);
    expect(rows.map((r) => [r.action, r.userId])).toEqual([
      ["create", EDITOR], ["download", READER], ["view", READER], ["update", EDITOR], ["delete", ADMIN],
    ]);
  });

  it("recovery: hợp đồng / scan đã xóa → 404 (tệp vẫn còn); tệp mất → 404; tạo dòng lỗi thì dọn tệp; purge gỡ chặn hoàn tác", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    as(EDITOR);
    const id = await uploaded(w);
    const path = (await prisma.projectContractAttachment.findUniqueOrThrow({ where: { id } })).storedPath;
    expect((await deleteContractScan(id, w.p1)).ok).toBe(true);
    expect((await get(w.p1, w.c1, id)).status).toBe(404);
    expect(await store.exists(path)).toBe(true);

    const id2 = await uploaded(w);
    const path2 = (await prisma.projectContractAttachment.findUniqueOrThrow({ where: { id: id2 } })).storedPath;
    await store.deleteFile(path2);
    expect((await get(w.p1, w.c1, id2)).status).toBe(404);

    await prisma.projectContract.update({ where: { id: w.c1 }, data: { deletedAt: new Date() } });
    const id3 = await prisma.projectContractAttachment.create({
      data: { contractId: w.c1, uploaderId: EDITOR, filename: "c.pdf", storedPath: "contract-scans/x/c.pdf", mimeType: "application/pdf", sizeBytes: 10 },
    });
    expect((await get(w.p1, w.c1, id3.id)).status).toBe(404);
    await prisma.projectContract.update({ where: { id: w.c1 }, data: { deletedAt: null } });

    // Tạo dòng lỗi thì tệp vừa ghi bị xóa.
    const written: string[] = [];
    const realPut = store.putFile.bind(store);
    vi.spyOn(store, "putFile").mockImplementation(async (rel, body) => { written.push(rel); return realPut(rel, body); });
    vi.spyOn(prisma.projectContractAttachment, "create").mockRejectedValueOnce(new Error("lỗi DB giả lập"));
    expect((await upload(w, PDF, "d.pdf", "application/pdf")).ok).toBe(false);
    expect(written).toHaveLength(1);
    expect(await store.exists(written[0])).toBe(false);
    vi.restoreAllMocks();

    // Hợp đồng của run import có scan (đã xóa mềm) chặn hoàn tác; admin xóa vĩnh viễn thì gỡ chặn.
    const run = await prisma.importRun.create({
      data: { fileName: "du-an.xlsx", fileHash: "h-scan", adapter: "du-an-xay-dung", status: "committed", createdBy: ADMIN, committedAt: new Date() },
    });
    await prisma.projectContract.update({ where: { id: w.c1 }, data: { importRunId: run.id } });
    await prisma.$executeRaw`DELETE FROM project_contract_attachments WHERE id IN (${id2}, ${id3.id})`;
    await expect(rollbackImportRun(run.id)).rejects.toThrow(/HĐ P1/);
    as(ADMIN);
    expect((await purgeContractScan(id, w.p1)).ok).toBe(true);
    expect(await store.exists(path)).toBe(false);
    await rollbackImportRun(run.id);
    expect(await prisma.projectContract.count({ where: { id: w.c1 } })).toBe(0);
  });
});
