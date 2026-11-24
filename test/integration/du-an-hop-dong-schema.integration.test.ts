/**
 * Integration test: ràng buộc DB của danh mục hợp đồng dự án
 * (migration 20261118120000_du_an_danh_muc_hop_dong).
 *  - Mỗi CHECK của hợp đồng / bản scan / hóa đơn CĐT có một case bị từ chối và một case được nhận.
 *  - Khóa ngoại RESTRICT chặn xóa cứng hợp đồng đang có scan.
 *  - Unique hóa đơn CĐT theo (ký hiệu, số), NULL coi như bằng nhau, bỏ qua dòng đã xóa mềm.
 *  - INSERT theo đúng bộ cột của adapter import vẫn chạy, `valueVnd` giữ nguyên.
 *  - Hoàn tác import bị chặn khi hợp đồng của run đã gắn đối tác hoặc có scan (kể cả đã xóa mềm).
 * Ghi thô bằng $executeRaw để chạm thẳng ràng buộc DB (không qua zod/service).
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { rollbackImportRun } from "@/lib/import/import-engine";
import { RollbackBlockedError } from "@/lib/import/import-errors";

/** Gom message + meta + cause của lỗi Prisma/driver để so mã SQLSTATE hoặc tên ràng buộc. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) parts.push(current.message);
    const meta = (current as { meta?: unknown }).meta;
    if (meta) parts.push(JSON.stringify(meta));
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" | ");
}

async function expectDbRejects(promise: Promise<unknown>, markers: string[]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "DB phải từ chối thao tác").not.toBeNull();
  const text = describeError(error);
  expect(markers.some((m) => text.includes(m)), `lỗi không khớp ${markers.join("/")}: ${text}`).toBe(true);
}

async function seed() {
  const user = await prisma.user.create({ data: { name: "Người tải", email: "scan@nq.local", role: "admin" } });
  const supplier = await prisma.supplier.create({ data: { name: "NCC Hợp đồng" } });
  const contractor = await prisma.contractor.create({ data: { name: "Đội Hợp đồng" } });
  const project = await prisma.project.create({ data: { code: "HD-1", name: "Công trình HĐ", status: "active" } });
  return { user, supplier, contractor, project };
}

/** INSERT đúng bộ cột của `du-an-xay-dung.adapter.ts` (đoạn INSERT INTO project_contracts). */
async function insertLikeImport(projectId: number, docName: string, importRunId: number | null) {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO project_contracts
      ("projectId", "docName", "docType", "partyName", "valueVnd", "signedDate",
       "expiryDate", status, storage, note, "importRunId", "createdAt", "updatedAt")
    VALUES
      (${projectId}, ${docName}, 'contract', 'Bên B', ${1_234_567_890.5}, NULL, NULL,
       'pending', NULL, NULL, ${importRunId}, NOW(), NOW())
    RETURNING id`;
  return rows[0].id;
}

async function insertContract(projectId: number, docType: string, party: string, supplierId: number | null, contractorId: number | null) {
  return prisma.$executeRaw`
    INSERT INTO project_contracts ("projectId", "docName", "docType", "partyKind", "supplierId", "contractorId")
    VALUES (${projectId}, 'HĐ thử', ${docType}, ${party}, ${supplierId}, ${contractorId})`;
}

async function insertInvoice(projectId: number, symbol: string | null, no: string, amount: number, deletedAt: Date | null = null) {
  return prisma.$executeRaw`
    INSERT INTO project_cdt_invoices ("projectId", "invoiceDate", "invoiceSymbol", "invoiceNo", "amountVnd", "deletedAt")
    VALUES (${projectId}, '2026-11-01', ${symbol}, ${no}, ${amount}, ${deletedAt})`;
}

describe("ràng buộc DB danh mục hợp đồng dự án (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("đối tác của hợp đồng: đúng bốn tổ hợp, loại hợp lệ, chỉ docType = contract", async () => {
    const { supplier, contractor, project } = await seed();
    const p = project.id;
    // Bốn tổ hợp hợp lệ.
    await expect(insertContract(p, "contract", "ncc", supplier.id, null)).resolves.toBe(1);
    await expect(insertContract(p, "contract", "doi_thi_cong", null, contractor.id)).resolves.toBe(1);
    await expect(insertContract(p, "contract", "cdt", null, null)).resolves.toBe(1);
    await expect(
      prisma.$executeRaw`INSERT INTO project_contracts ("projectId", "docName", "docType") VALUES (${p}, 'GP', 'license')`,
    ).resolves.toBe(1);

    // Loại lạ vi phạm cả hai CHECK; Postgres chỉ báo một tên — nhận tên nào cũng được, rồi kiểm riêng
    // rằng CHECK loại đối tác có mặt với đúng danh sách.
    await expectDbRejects(insertContract(p, "contract", "khac", null, null), [
      "project_contracts_party_kind_check",
      "project_contracts_party_binding_check",
    ]);
    const [kindCheck] = await prisma.$queryRaw<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'project_contracts_party_kind_check'`;
    expect(kindCheck.def).toMatch(/ncc.*doi_thi_cong.*cdt/);
    await expectDbRejects(insertContract(p, "contract", "ncc", null, null), ["project_contracts_party_binding_check"]);
    await expectDbRejects(insertContract(p, "contract", "ncc", supplier.id, contractor.id), ["project_contracts_party_binding_check"]);
    await expectDbRejects(insertContract(p, "contract", "doi_thi_cong", supplier.id, null), ["project_contracts_party_binding_check"]);
    await expectDbRejects(insertContract(p, "contract", "cdt", supplier.id, null), ["project_contracts_party_binding_check"]);
    await expectDbRejects(
      prisma.$executeRaw`
        INSERT INTO project_contracts ("projectId", "docName", "docType", "supplierId") VALUES (${p}, 'HĐ', 'contract', ${supplier.id})`,
      ["project_contracts_party_binding_check"],
    );
    await expectDbRejects(insertContract(p, "license", "ncc", supplier.id, null), ["project_contracts_party_doc_type_check"]);
  });

  it("giá trị theo TT không âm; 0 và NULL được nhận", async () => {
    const { project } = await seed();
    await expectDbRejects(
      prisma.$executeRaw`INSERT INTO project_contracts ("projectId", "docName", "docType", "valueTtVnd") VALUES (${project.id}, 'HĐ', 'contract', -1)`,
      ["project_contracts_value_tt_nonneg"],
    );
    await expect(
      prisma.$executeRaw`INSERT INTO project_contracts ("projectId", "docName", "docType", "valueTtVnd") VALUES (${project.id}, 'HĐ', 'contract', 0)`,
    ).resolves.toBe(1);
    await expect(
      prisma.$executeRaw`INSERT INTO project_contracts ("projectId", "docName", "docType", "valueTtVnd") VALUES (${project.id}, 'HĐ', 'contract', NULL)`,
    ).resolves.toBe(1);
  });

  it("bản scan: MIME whitelist, cỡ 1..25MB, storedPath duy nhất; FK RESTRICT chặn xóa cứng hợp đồng", async () => {
    const { user, project } = await seed();
    const contractId = await insertLikeImport(project.id, "HĐ có scan", null);
    const scan = (mime: string, size: number, path: string) => prisma.$executeRaw`
      INSERT INTO project_contract_attachments ("contractId", "uploaderId", filename, "storedPath", "mimeType", "sizeBytes")
      VALUES (${contractId}, ${user.id}, 'a.pdf', ${path}, ${mime}, ${size})`;

    await expect(scan("application/pdf", 26_214_400, "p/1")).resolves.toBe(1);
    await expect(scan("image/jpeg", 1, "p/2")).resolves.toBe(1);
    await expect(scan("image/png", 100, "p/3")).resolves.toBe(1);
    await expectDbRejects(scan("application/msword", 100, "p/4"), ["project_contract_attachments_mime_check"]);
    await expectDbRejects(scan("application/pdf", 26_214_401, "p/5"), ["project_contract_attachments_size_check"]);
    await expectDbRejects(scan("application/pdf", 0, "p/6"), ["project_contract_attachments_size_check"]);
    await expectDbRejects(scan("application/pdf", 100, "p/1"), ["storedPath", "23505"]);

    await expectDbRejects(prisma.$executeRaw`DELETE FROM project_contracts WHERE id = ${contractId}`, [
      "project_contract_attachments_contractId_fkey",
      "23503",
    ]);
  });

  it("hóa đơn CĐT: unique (ký hiệu, số) NULLS NOT DISTINCT, bỏ qua dòng đã xóa mềm; âm được, 0 và số trống bị chặn", async () => {
    const { project } = await seed();
    const p = project.id;
    await expect(insertInvoice(p, null, "0001", 100)).resolves.toBe(1);
    await expectDbRejects(insertInvoice(p, null, "0001", 200), ["project_cdt_invoices_symbol_no_active_unique", "23505"]);
    await expect(insertInvoice(p, "1C26TAA", "0001", 100)).resolves.toBe(1);
    await expectDbRejects(insertInvoice(p, "1C26TAA", "0001", 100), ["project_cdt_invoices_symbol_no_active_unique", "23505"]);
    await expect(insertInvoice(p, "1C26TAA", "0002", 100, new Date())).resolves.toBe(1);
    await expect(insertInvoice(p, "1C26TAA", "0002", 100)).resolves.toBe(1);

    await expect(insertInvoice(p, null, "0003", -10)).resolves.toBe(1);
    await expectDbRejects(insertInvoice(p, null, "0004", 0), ["project_cdt_invoices_amount_nonzero"]);
    await expectDbRejects(insertInvoice(p, null, "   ", 10), ["project_cdt_invoices_invoice_no_check"]);
  });

  it("INSERT theo bộ cột của adapter import vẫn chạy; valueVnd và status giữ nguyên", async () => {
    const { project } = await seed();
    const id = await insertLikeImport(project.id, "HĐ import", null);
    const row = await prisma.projectContract.findUniqueOrThrow({ where: { id } });
    expect(row.valueVnd?.toString()).toBe("1234567890.5");
    expect(row.status).toBe("pending");
    expect(row.partyKind).toBeNull();
    expect(row.valueTtVnd).toBeNull();
  });

  describe("guard hoàn tác import", () => {
    async function makeRun() {
      const run = await prisma.importRun.create({
        data: { fileName: "du-an.xlsx", fileHash: `h-${Math.random()}`, adapter: "du-an-xay-dung", status: "committed", createdBy: "admin" },
      });
      return run.id;
    }

    /** Mốc commit = sau lúc import ghi hợp đồng (như engine: INSERT NOW() rồi mới đặt committedAt). */
    async function commit(runId: number) {
      await prisma.importRun.update({ where: { id: runId }, data: { committedAt: new Date(Date.now() + 1000) } });
    }

    it("hợp đồng của run chưa sửa → hoàn tác được và xóa hợp đồng", async () => {
      const { project } = await seed();
      const runId = await makeRun();
      await insertLikeImport(project.id, "HĐ chưa sửa", runId);
      await commit(runId);
      await rollbackImportRun(runId);
      expect(await prisma.projectContract.count({ where: { importRunId: runId } })).toBe(0);
    });

    it("hợp đồng của run đã gắn đối tác → bị chặn, nêu tên hợp đồng", async () => {
      const { supplier, project } = await seed();
      const runId = await makeRun();
      const id = await insertLikeImport(project.id, "HĐ đã gắn NCC", runId);
      await commit(runId);
      await prisma.$executeRaw`UPDATE project_contracts SET "partyKind" = 'ncc', "supplierId" = ${supplier.id} WHERE id = ${id}`;
      const err = await rollbackImportRun(runId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RollbackBlockedError);
      expect((err as RollbackBlockedError).message).toContain("«HĐ đã gắn NCC»");
      expect(await prisma.projectContract.count({ where: { importRunId: runId } })).toBe(1);
    });

    it("hợp đồng của run có scan đã xóa mềm → vẫn bị chặn; admin xóa vĩnh viễn rồi thì qua", async () => {
      const { user, project } = await seed();
      const runId = await makeRun();
      const id = await insertLikeImport(project.id, "HĐ có scan", runId);
      await commit(runId);
      await prisma.$executeRaw`
        INSERT INTO project_contract_attachments ("contractId", "uploaderId", filename, "storedPath", "mimeType", "sizeBytes", "deletedAt")
        VALUES (${id}, ${user.id}, 'a.pdf', 'contract-scans/x', 'application/pdf', 10, NOW())`;
      const err = await rollbackImportRun(runId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RollbackBlockedError);
      expect((err as RollbackBlockedError).message).toContain("«HĐ có scan»");

      await prisma.$executeRaw`DELETE FROM project_contract_attachments WHERE "contractId" = ${id}`;
      await rollbackImportRun(runId);
      expect(await prisma.projectContract.count({ where: { importRunId: runId } })).toBe(0);
    });

    it("hợp đồng của run sửa thông tin sau commit → bị chặn; người dùng xóa hợp đồng đó (không có scan) thì qua", async () => {
      const { project } = await seed();
      const runId = await makeRun();
      const id = await insertLikeImport(project.id, "HĐ sửa tên", runId);
      await commit(runId);
      await prisma.$executeRaw`UPDATE project_contracts SET "docName" = 'HĐ sửa tên (mới)', "updatedAt" = NOW() + interval '1 hour' WHERE id = ${id}`;
      const err = await rollbackImportRun(runId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RollbackBlockedError);
      expect((err as RollbackBlockedError).message).toContain(`/hop-dong/${id}`);

      await prisma.$executeRaw`UPDATE project_contracts SET "deletedAt" = NOW() WHERE id = ${id}`;
      await rollbackImportRun(runId);
      expect(await prisma.projectContract.count({ where: { importRunId: runId } })).toBe(0);
    });
  });
});
