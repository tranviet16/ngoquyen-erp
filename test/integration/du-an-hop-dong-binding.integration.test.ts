/**
 * Integration test: gắn đối tác cho hợp đồng dự án trên Postgres thật, ACL thật (chỉ phiên đăng nhập
 * là giả lập). Kiểm:
 *   - đổi lần lượt NCC → Đội → Khác → CĐT: mỗi bước qua CHECK, khóa cũ về null;
 *   - xóa giá trị TT và ngày hết hạn về null; đổi sang giấy phép thì bộ ba đối tác bị xóa;
 *   - gắn NCC đã bị xóa mềm bị từ chối; giữ NCC đã bị xóa sau khi gắn thì được;
 *   - sửa dòng `pending` kiểu import để gắn đối tác: trạng thái giữ `pending`;
 *   - IDOR: người sửa được công trình P1 không sửa / xóa được hợp đồng của P2;
 *   - người chỉ đọc không tạo / sửa được; tạo trả `{ ok: true, id }` không lẫn Decimal.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { authMock, clearSession, mockSession } from "@/test/helpers/session-mock";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { createContract, softDeleteContract, updateContract } from "@/lib/du-an/contract-service";
import type { ContractInput } from "@/lib/du-an/schemas";
import type { ActionResult } from "@/lib/du-an/dt-hd-tt/entry-action-result";

const READER = "hd-reader";
const EDITOR = "hd-editor";
const NOT_FOUND = "Không tìm thấy hợp đồng ở công trình này";
const NO_PERMISSION = "Bạn không có quyền thao tác này trên công trình.";

interface World {
  p1: number;
  p2: number;
  supplierId: number;
  retiredSupplierId: number;
  contractorId: number;
}

async function seed(): Promise<World> {
  for (const id of [READER, EDITOR]) await prisma.user.create({ data: { id, name: id, email: `${id}@test.local`, role: "viewer" } });
  const p1 = await prisma.project.create({ data: { code: "P1", name: "Công trình 1", status: "active", ownerInvestor: "UBND Huyện" } });
  const p2 = await prisma.project.create({ data: { code: "P2", name: "Công trình 2", status: "active" } });
  for (const [userId, level] of [[READER, "read"], [EDITOR, "edit"]]) {
    await prisma.modulePermission.create({ data: { userId, moduleKey: "du-an", level: "edit" } });
    await prisma.projectPermission.create({ data: { userId, projectId: p1.id, level } });
  }
  const supplier = await prisma.supplier.create({ data: { name: "Bê tông HP" } });
  const retired = await prisma.supplier.create({ data: { name: "NCC đã gộp", deletedAt: new Date("2026-01-01T00:00:00Z") } });
  const contractor = await prisma.contractor.create({ data: { name: "Đội anh Tuấn" } });
  return { p1: p1.id, p2: p2.id, supplierId: supplier.id, retiredSupplierId: retired.id, contractorId: contractor.id };
}

const as = (id: string) => mockSession({ id, role: "viewer" });

async function ok<T extends object>(pending: Promise<ActionResult<T>>): Promise<T> {
  const result = await pending;
  if (!result.ok) throw new Error(`Bị từ chối ngoài dự kiến: ${result.message}`);
  return result;
}

async function refused(pending: Promise<ActionResult<object>>): Promise<string> {
  const result = await pending;
  if (result.ok) throw new Error("Phải bị từ chối");
  return result.message;
}

const input = (projectId: number, patch: Partial<ContractInput> = {}): ContractInput => ({
  projectId,
  docName: "HĐ thi công",
  docType: "contract",
  status: "active",
  valueVnd: 2_000_000_000,
  valueTtVnd: 1_800_000_000,
  expiryDate: "2026-12-31",
  ...patch,
});

const row = (id: number) => prisma.projectContract.findUniqueOrThrow({ where: { id } });

describe("gắn đối tác hợp đồng dự án (integration)", () => {
  let w: World;
  beforeEach(async () => {
    clearSession(); // seed chạy không phiên: dòng audit không trỏ tới user chưa tạo
    await truncateAll();
    w = await seed();
    as(EDITOR);
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("tạo trả { ok, id } không lẫn Decimal; đổi NCC → Đội → Khác → CĐT, khóa cũ về null", async () => {
    const created = await createContract(input(w.p1, { partyKind: "ncc", supplierId: w.supplierId }));
    expect(created).toEqual({ ok: true, id: expect.any(Number) });
    const id = (created as { id: number }).id;
    expect(await row(id)).toMatchObject({ partyKind: "ncc", supplierId: w.supplierId, contractorId: null, partyName: "Bê tông HP" });

    await ok(updateContract(id, input(w.p1, { partyKind: "doi_thi_cong", contractorId: w.contractorId })));
    expect(await row(id)).toMatchObject({ partyKind: "doi_thi_cong", supplierId: null, contractorId: w.contractorId, partyName: "Đội anh Tuấn" });

    await ok(updateContract(id, input(w.p1, { partyKind: null, partyName: "Công ty ngoài danh mục" })));
    expect(await row(id)).toMatchObject({ partyKind: null, supplierId: null, contractorId: null, partyName: "Công ty ngoài danh mục" });

    await ok(updateContract(id, input(w.p1, { partyKind: "cdt" })));
    expect(await row(id)).toMatchObject({ partyKind: "cdt", supplierId: null, contractorId: null, partyName: "UBND Huyện" });
  });

  it("xóa giá trị TT và ngày hết hạn về null; đổi sang giấy phép xóa bộ ba đối tác", async () => {
    const { id } = await ok(createContract(input(w.p1, { partyKind: "ncc", supplierId: w.supplierId })));
    const before = await row(id);
    await ok(updateContract(id, input(w.p1, { partyKind: "ncc", supplierId: w.supplierId, valueTtVnd: null, expiryDate: null })));
    const after = await row(id);
    expect(after.valueTtVnd).toBeNull();
    expect(after.expiryDate).toBeNull();
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());

    await ok(updateContract(id, input(w.p1, { docType: "license", partyKind: null })));
    expect(await row(id)).toMatchObject({ docType: "license", partyKind: null, supplierId: null, contractorId: null, valueTtVnd: null });
  });

  it("gắn NCC đã bị xóa mềm bị từ chối; NCC bị xóa sau khi gắn thì giữ nguyên được", async () => {
    const msg = await refused(createContract(input(w.p1, { partyKind: "ncc", supplierId: w.retiredSupplierId })));
    expect(msg).toContain("đã bị xóa khỏi danh mục");

    const { id } = await ok(createContract(input(w.p1, { partyKind: "ncc", supplierId: w.supplierId })));
    await prisma.supplier.update({ where: { id: w.supplierId }, data: { deletedAt: new Date() } });
    await ok(updateContract(id, input(w.p1, { docName: "HĐ đổi tên", partyKind: "ncc", supplierId: w.supplierId })));
    expect(await row(id)).toMatchObject({ docName: "HĐ đổi tên", supplierId: w.supplierId });
  });

  it("dòng pending kiểu import gắn được đối tác, trạng thái giữ pending", async () => {
    const [{ id }] = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO project_contracts
        ("projectId", "docName", "docType", "partyName", "valueVnd", "signedDate",
         "expiryDate", status, storage, note, "importRunId", "createdAt", "updatedAt")
      VALUES (${w.p1}, 'HĐ import', 'contract', 'Bê tông', 500000000, NULL, NULL, 'pending', NULL, NULL, NULL, NOW(), NOW())
      RETURNING id`;
    await ok(updateContract(id, input(w.p1, { docName: "HĐ import", status: "pending", valueVnd: 500_000_000, partyKind: "ncc", supplierId: w.supplierId })));
    expect(await row(id)).toMatchObject({ status: "pending", partyKind: "ncc", supplierId: w.supplierId });
  });

  it("IDOR: người sửa được P1 không sửa / xóa được hợp đồng của P2", async () => {
    const other = await prisma.projectContract.create({ data: { projectId: w.p2, docName: "HĐ của P2", docType: "contract" } });
    expect(await refused(updateContract(other.id, input(w.p1, { docName: "chiếm" })))).toBe(NOT_FOUND);
    expect(await refused(softDeleteContract(other.id, w.p1))).toBe(NOT_FOUND);
    // Khai đúng công trình của dòng thì guard của P2 từ chối.
    expect(await refused(updateContract(other.id, input(w.p2, { docName: "chiếm" })))).toBe(NO_PERMISSION);
    expect(await refused(softDeleteContract(other.id, w.p2))).toBe(NO_PERMISSION);
    expect(await row(other.id)).toMatchObject({ docName: "HĐ của P2", deletedAt: null });
  });

  it("người chỉ đọc không tạo / sửa / xóa được", async () => {
    as(EDITOR);
    const { id } = await ok(createContract(input(w.p1)));
    as(READER);
    expect(await refused(createContract(input(w.p1)))).toBe(NO_PERMISSION);
    expect(await refused(updateContract(id, input(w.p1, { docName: "đổi" })))).toBe(NO_PERMISSION);
    expect(await refused(softDeleteContract(id, w.p1))).toBe(NO_PERMISSION);
    expect(await prisma.projectContract.count()).toBe(1);
  });
});
