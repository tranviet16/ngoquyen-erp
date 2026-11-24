/**
 * Integration test: ba sổ nhập liệu "Đối chiếu DT-HĐ-TT" (Hóa đơn, Thực tế nhập, Chi thực tế) trên
 * Postgres thật, với ACL thật (chỉ phiên đăng nhập là giả lập). Kiểm:
 *   - thêm / sửa / xóa mềm từng sổ;
 *   - quyền: `read` chỉ xem, `create` thêm được nhưng không sửa / xóa, `edit` sửa / xóa được;
 *   - id đầu mối / dòng của công trình khác, NCC đã ngừng dùng bị từ chối;
 *   - dòng hóa đơn sinh / cập nhật / gỡ giao dịch HĐ của các tab cũ; tên chưa gán → Phần B của DT-HĐ
 *     (đối soát vẫn ✓) và "Ngoài DT" ở tab cũ;
 *   - sửa dòng của run import làm hoàn tác run đó bị từ chối;
 *   - sửa một phần (chỉ ô đổi) gộp dưới khóa, không ghi đè lần sửa khác; tiền VAT / ngày giao dịch
 *     theo quy tắc của sổ; công trình còn giao dịch HĐ cũ chưa được thay thì không nhập hóa đơn tay.
 * Action ghi trả `ActionResult` (từ chối = `{ ok: false, message }` tiếng Việt), không ném.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { authMock, clearSession, mockSession } from "@/test/helpers/session-mock";

// React cache() chỉ là passthrough ngoài RSC — mỗi lần gọi đọc lại quyền từ DB.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { dtLineKeyOf, itemKeyOf } from "@/lib/du-an/dt-hd-tt/keys";
import { createInvoiceLine, listInvoiceLines, softDeleteInvoiceLine, updateInvoiceLine } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { createReceipt, listReceipts, softDeleteReceipt, updateReceipt } from "@/lib/du-an/dt-hd-tt/receipt-service";
import { createPayment, listPayments, softDeletePayment, updatePayment } from "@/lib/du-an/dt-hd-tt/payment-service";
import { getDtHdTtReports } from "@/lib/du-an/dt-hd-tt/report-service";
import { rollbackImportRun } from "@/lib/import/import-engine";
import type { ActionResult } from "@/lib/du-an/dt-hd-tt/entry-action-result";

const ADMIN = "dt-admin";
const READER = "dt-reader";
const CREATOR = "dt-creator";
const EDITOR = "dt-editor";
const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-01-02T00:00:00Z");

interface World {
  projectId: number;
  otherProjectId: number;
  vlCategoryId: number;
  supplierId: number;
  retiredSupplierId: number;
  counterpartyId: number;
  otherCounterpartyId: number;
}

async function seed(): Promise<World> {
  for (const [id, role] of [[ADMIN, "admin"], [READER, "viewer"], [CREATOR, "viewer"], [EDITOR, "viewer"]]) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@test.local`, role } });
  }
  const project = await prisma.project.create({ data: { code: "MNTC-GD1", name: "Mầm Non Trại Chuối GĐ1", status: "active" } });
  const other = await prisma.project.create({ data: { code: "TC", name: "Trại Chuối", status: "active" } });
  for (const [userId, level] of [[READER, "read"], [CREATOR, "create"], [EDITOR, "edit"]]) {
    await prisma.modulePermission.create({ data: { userId, moduleKey: "du-an", level: "edit" } });
    await prisma.projectPermission.create({ data: { userId, projectId: project.id, level } });
  }
  const vl = await prisma.projectCategory.create({ data: { projectId: project.id, code: "HM1-VL", name: "Vật liệu" } });
  await prisma.projectCategory.create({ data: { projectId: project.id, code: "HM1-NC", name: "Nhân công" } });
  await prisma.projectEstimate.create({
    data: { projectId: project.id, categoryId: vl.id, itemCode: "VL-001", itemName: "Cát vàng", unit: "m3", qty: 100, unitPrice: 500_000, totalVnd: 50_000_000 },
  });
  for (const source of ["hd", "tt"]) {
    await prisma.projectItemAlias.create({
      data: { projectId: project.id, source, itemKey: itemKeyOf("Cát vàng", "m3"), itemName: "Cát vàng", unit: "m3", dtKey: dtLineKeyOf("Cát vàng", "m3", "VL"), status: "xac_nhan" },
    });
  }
  const supplier = await prisma.supplier.create({ data: { name: "Vật liệu Thanh Tùng", taxCode: "0100000001" } });
  const retired = await prisma.supplier.create({ data: { name: "NCC đã gộp", deletedAt: T0 } });
  const cp = await prisma.projectCounterparty.create({ data: { projectId: project.id, name: "Thanh Tùng", kind: "ncc", actualBasis: "receipts" } });
  const otherCp = await prisma.projectCounterparty.create({ data: { projectId: other.id, name: "Đầu mối công trình khác", kind: "ncc" } });
  return {
    projectId: project.id, otherProjectId: other.id, vlCategoryId: vl.id, supplierId: supplier.id, retiredSupplierId: retired.id,
    counterpartyId: cp.id, otherCounterpartyId: otherCp.id,
  };
}

const as = (id: string) => mockSession({ id, role: id === ADMIN ? "admin" : "viewer" });

const NO_PERMISSION = "Bạn không có quyền thao tác này trên công trình.";

/** Action ghi trả `ActionResult`: lấy dữ liệu khi được, ném thông điệp khi bị từ chối. */
async function ok<T extends object>(pending: Promise<ActionResult<T>>): Promise<T> {
  const result = await pending;
  if (!result.ok) throw new Error(`Bị từ chối ngoài dự kiến: ${result.message}`);
  return result;
}

/** Action ghi phải bị từ chối (trả về, không ném); trả thông điệp hiển thị cho người dùng. */
async function refused(pending: Promise<ActionResult<object>>): Promise<string> {
  const result = await pending;
  if (result.ok) throw new Error("Action được chấp nhận ngoài dự kiến");
  return result.message;
}
const liveDerived = (lineId: number) => prisma.projectTransaction.findMany({ where: { sourceInvoiceLineId: lineId, deletedAt: null } });

describe("sổ nhập liệu Đối chiếu DT-HĐ-TT", () => {
  let w: World;
  beforeEach(async () => {
    // The previous test's session user is gone after truncate; seeding under it would fail the audit FK.
    clearSession();
    await truncateAll();
    w = await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  const invoice = () => ({
    projectId: w.projectId, supplierId: w.supplierId, invoiceNo: "0001", invoiceDate: "2026-11-17", itemName: "Cát vàng", unit: "m³",
    qty: 10, unitPrice: 520_000, vatPct: 0.08,
  });

  it("Hóa đơn: thêm sinh giao dịch HĐ; sửa cập nhật đúng giao dịch đó; xóa mềm gỡ giao dịch", async () => {
    as(EDITOR);
    const { row } = await ok(createInvoiceLine(invoice()));
    expect(row).toMatchObject({ amountVnd: 5_200_000, vatVnd: 416_000, mapped: true, invoiceDate: "2026-11-17", supplierName: "Vật liệu Thanh Tùng" });
    expect((await prisma.projectInvoiceLine.findUniqueOrThrow({ where: { id: row.id } })).itemKey).toBe(itemKeyOf("Cát vàng", "m3"));
    const [tx] = await liveDerived(row.id);
    expect(tx).toMatchObject({ projectId: w.projectId, categoryId: w.vlCategoryId, itemCode: "VL-001", partyName: "Vật liệu Thanh Tùng", invoiceNo: "0001", status: "approved", transactionType: "lay_hang" });
    expect(tx.amountHd.toNumber()).toBe(5_200_000);
    expect(tx.amountTt.toNumber()).toBe(0);

    const { row: edited } = await ok(updateInvoiceLine(row.id, w.projectId, { qty: 12 }));
    expect(edited).toMatchObject({ qty: 12, amountVnd: 6_240_000, vatVnd: 499_200 });
    const afterEdit = await liveDerived(row.id);
    expect(afterEdit.map((t) => t.id)).toEqual([tx.id]);
    expect(afterEdit[0].amountHd.toNumber()).toBe(6_240_000);

    // Tên mới chưa có alias → "chưa gán" ở sổ, "Ngoài DT" (mã tổng hợp HD-…) ở tab cũ.
    const { row: renamed } = await ok(updateInvoiceLine(row.id, w.projectId, { itemName: "Đá mi bụi lạ" }));
    expect(renamed).toMatchObject({ mapped: false, qty: 12, amountVnd: 6_240_000 });
    const [outside] = await liveDerived(row.id);
    expect(outside.id).toBe(tx.id);
    expect(outside.itemCode).toMatch(/^HD-/);

    const audits = await prisma.auditLog.findMany({ where: { tableName: "ProjectInvoiceLine", recordId: String(row.id) } });
    expect(audits.map((a) => a.action).sort()).toEqual(["create", "update", "update"]);
    expect(audits.every((a) => a.userId === EDITOR)).toBe(true);

    await ok(softDeleteInvoiceLine(row.id, w.projectId));
    expect((await prisma.projectInvoiceLine.findUniqueOrThrow({ where: { id: row.id } })).deletedAt).not.toBeNull();
    expect(await liveDerived(row.id)).toEqual([]);
    expect(await prisma.projectTransaction.count({ where: { sourceInvoiceLineId: row.id } })).toBe(1); // xóa mềm, không xóa cứng
    expect(await listInvoiceLines(w.projectId)).toEqual([]);
  });

  it("sửa một phần: hai lần sửa hai ô khác nhau cùng lúc không ghi đè nhau", async () => {
    as(EDITOR);
    const { row } = await ok(createInvoiceLine(invoice()));
    // Gửi cùng lúc, như hai ô sửa liên tiếp khi lần lưu đầu chưa về: khóa công trình xếp hàng hai lần ghi.
    await Promise.all([ok(updateInvoiceLine(row.id, w.projectId, { qty: 12 })), ok(updateInvoiceLine(row.id, w.projectId, { unitPrice: 600_000 }))]);
    const stored = await prisma.projectInvoiceLine.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.qty?.toNumber()).toBe(12);
    expect(stored.unitPrice?.toNumber()).toBe(600_000);
    expect(stored.amountVnd.toNumber()).toBe(7_200_000);
    expect(stored.vatVnd.toNumber()).toBe(576_000);
    expect((await liveDerived(row.id))[0].amountHd.toNumber()).toBe(7_200_000);
  });

  it("xóa VAT % → tiền VAT 0; xóa ngày → giao dịch HĐ lấy ngày dòng vào sổ (như import)", async () => {
    as(EDITOR);
    const { row } = await ok(createInvoiceLine(invoice()));
    const { row: noVat } = await ok(updateInvoiceLine(row.id, w.projectId, { vatPct: null }));
    expect(noVat).toMatchObject({ vatPct: null, vatVnd: 0, amountVnd: 5_200_000 });

    expect((await liveDerived(row.id))[0].date.toISOString()).toBe("2026-11-17T00:00:00.000Z");
    await ok(updateInvoiceLine(row.id, w.projectId, { invoiceDate: null }));
    const stored = await prisma.projectInvoiceLine.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.invoiceDate).toBeNull();
    expect((await liveDerived(row.id))[0].date.getTime()).toBe(stored.createdAt.getTime());
  });

  it("công trình còn giao dịch HĐ cũ chưa được sổ thay: từ chối nhập hóa đơn tay (tránh cộng hai lần)", async () => {
    const legacy = (amountHd: number, extra: object = {}) =>
      prisma.projectTransaction.create({
        data: { projectId: w.projectId, date: T0, transactionType: "lay_hang", categoryId: w.vlCategoryId, itemCode: "VL-001", itemName: "Cát vàng", qty: 1, unit: "m3", amountHd, ...extra },
      });
    // Không chặn: dòng chỉ có tiền thực tế, dòng đã bị sổ thay (xóa mềm + supersededByRunId).
    await legacy(0);
    const run = await prisma.importRun.create({ data: { fileName: "x.xlsx", fileHash: "x", adapter: "du-an-dt-hd-tt", status: "committed", createdBy: ADMIN, committedAt: T1 } });
    await legacy(3_000_000, { deletedAt: T1, supersededByRunId: run.id });

    as(EDITOR);
    const { row: first } = await ok(createInvoiceLine(invoice()));

    const live = await legacy(1_000_000);
    const message = await refused(createInvoiceLine({ ...invoice(), invoiceNo: "0002" }));
    expect(message).toMatch(/còn 1 giao dịch HĐ cũ/);
    expect(await prisma.projectInvoiceLine.count({ where: { deletedAt: null } })).toBe(1);

    // Sửa dòng đã có vẫn được (không thêm HĐ mới); bỏ dòng cũ đi thì nhập tiếp được.
    await ok(updateInvoiceLine(first.id, w.projectId, { note: "đã đối chiếu" }));
    await prisma.projectTransaction.update({ where: { id: live.id }, data: { deletedAt: new Date() } });
    await ok(createInvoiceLine({ ...invoice(), invoiceNo: "0002" }));
  });

  it("dòng hóa đơn tên mới hiện ở Phần B của DT-HĐ; mọi khối và tổng vẫn khớp sổ Hóa đơn", async () => {
    as(EDITOR);
    await ok(createInvoiceLine(invoice()));
    const { row: unseen } = await ok(createInvoiceLine({ ...invoice(), itemName: "Đá mi bụi lạ", unit: "m3", qty: null, unitPrice: null, amountVnd: 1_000_000 }));
    expect(unseen.mapped).toBe(false);

    as(READER);
    const reports = await getDtHdTtReports(w.projectId);
    expect(reports.dtHd.partB.flatMap((p) => p.lines.map((l) => l.invoiceLineId))).toEqual([unseen.id]);
    expect(reports.dtHd.partBTotal).toBe(1_000_000);
    expect(reports.dtHd.grandCheck.ok).toBe(true);
    expect(reports.dtHd.blocks.every((b) => b.tieOut.ok)).toBe(true);
    expect((await liveDerived(unseen.id))[0].itemCode).toMatch(/^HD-/);
  });

  it("Thực tế nhập: dòng mới bắt buộc đầu mối của đúng công trình; sửa, xóa mềm", async () => {
    as(EDITOR);
    const base = { projectId: w.projectId, date: "2026-11-17", itemName: "Cát vàng", unit: "m3", qty: 2, unitPrice: 560_000 };
    await refused(createReceipt({ ...base, counterpartyId: undefined as unknown as number }));
    expect(await refused(createReceipt({ ...base, counterpartyId: w.otherCounterpartyId }))).toMatch(/Đầu mối không thuộc công trình này/);

    const { row } = await ok(createReceipt({ ...base, counterpartyId: w.counterpartyId }));
    expect(row).toMatchObject({ amountVnd: 1_120_000, counterpartyId: w.counterpartyId, mapped: true });
    expect(await refused(updateReceipt(row.id, w.projectId, { counterpartyId: null }))).toMatch(/Không được bỏ trống đầu mối/);
    expect(await refused(updateReceipt(row.id, w.projectId, { counterpartyId: w.otherCounterpartyId }))).toMatch(/Đầu mối không thuộc công trình này/);

    const { row: edited } = await ok(updateReceipt(row.id, w.projectId, { amountVnd: 1_100_000, note: "giảm giá" }));
    expect(edited).toMatchObject({ amountVnd: 1_100_000, note: "giảm giá", counterpartyId: w.counterpartyId });
    const { row: requantified } = await ok(updateReceipt(row.id, w.projectId, { qty: 3 }));
    expect(requantified).toMatchObject({ qty: 3, amountVnd: 1_680_000, note: "giảm giá" });
    expect((await listReceipts(w.projectId)).map((r) => r.id)).toEqual([row.id]);

    await ok(softDeleteReceipt(row.id, w.projectId));
    expect(await listReceipts(w.projectId)).toEqual([]);
    expect(await prisma.projectActualReceipt.count()).toBe(1);
  });

  it("Chi thực tế: đầu mối của công trình khác và NCC đã ngừng dùng bị từ chối; sửa, xóa mềm", async () => {
    as(EDITOR);
    const base = { projectId: w.projectId, date: "2026-11-17", content: "Trả tiền cát", bankVnd: 5_000_000, section: "IV" as const };
    expect(await refused(createPayment({ ...base, counterpartyId: w.otherCounterpartyId }))).toMatch(/Đầu mối không thuộc công trình này/);
    expect(await refused(createPayment({ ...base, supplierId: w.retiredSupplierId }))).toMatch(/Nhà cung cấp không tồn tại/);

    const { row } = await ok(createPayment({ ...base, counterpartyId: w.counterpartyId, supplierId: w.supplierId }));
    expect(row).toMatchObject({ bankVnd: 5_000_000, cashVnd: 0, section: "IV", supplierName: "Vật liệu Thanh Tùng" });
    expect(await refused(updatePayment(row.id, w.projectId, { counterpartyId: w.otherCounterpartyId }))).toMatch(/Đầu mối không thuộc công trình này/);
    expect(await refused(updatePayment(row.id, w.projectId, { section: "V" as never }))).toMatch(/Chọn mục I–IV/);

    const { row: edited } = await ok(updatePayment(row.id, w.projectId, { cashVnd: 300_000, section: "I", counterpartyId: null }));
    expect(edited).toMatchObject({ bankVnd: 5_000_000, cashVnd: 300_000, section: "I", counterpartyId: null, supplierId: w.supplierId });

    await ok(softDeletePayment(row.id, w.projectId));
    expect(await listPayments(w.projectId)).toEqual([]);
    expect(await prisma.projectCashPayment.count()).toBe(1);
  });

  it("quyền: read chỉ xem; create thêm được nhưng không sửa / xóa; không có quyền công trình thì không xem", async () => {
    as(READER);
    expect(await refused(createInvoiceLine(invoice()))).toBe(NO_PERMISSION);
    expect(await refused(createPayment({ projectId: w.projectId, content: "x", bankVnd: 1, section: "I" }))).toBe(NO_PERMISSION);
    expect(await listInvoiceLines(w.projectId)).toEqual([]);

    as(CREATOR);
    const { row: line } = await ok(createInvoiceLine(invoice()));
    const { row: receipt } = await ok(createReceipt({ projectId: w.projectId, itemName: "Cát vàng", unit: "m3", amountVnd: 1, counterpartyId: w.counterpartyId }));
    expect(await refused(updateInvoiceLine(line.id, w.projectId, { qty: 1 }))).toBe(NO_PERMISSION);
    expect(await refused(softDeleteInvoiceLine(line.id, w.projectId))).toBe(NO_PERMISSION);
    expect(await refused(softDeleteReceipt(receipt.id, w.projectId))).toBe(NO_PERMISSION);

    as(READER);
    expect(await refused(updateReceipt(receipt.id, w.projectId, { amountVnd: 2 }))).toBe(NO_PERMISSION);
    // Trang đọc (RSC) vẫn ném lỗi quyền như các trang khác.
    await expect(listInvoiceLines(w.otherProjectId)).rejects.toThrow("Forbidden");
    expect(await prisma.projectInvoiceLine.count({ where: { deletedAt: null } })).toBe(1);
    expect((await prisma.projectInvoiceLine.findUniqueOrThrow({ where: { id: line.id } })).qty?.toNumber()).toBe(10);
  });

  it("dòng của công trình khác không sửa / xóa được qua công trình đang mở", async () => {
    as(ADMIN);
    // Công trình chưa có hạng mục: không có chỗ ghi giao dịch HĐ cho tab cũ → từ chối trước khi ghi,
    // không để lại dòng audit "create" của lần bị từ chối.
    expect(await refused(createInvoiceLine({ ...invoice(), projectId: w.otherProjectId }))).toMatch(/chưa có hạng mục/);
    expect(await prisma.projectInvoiceLine.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { tableName: "ProjectInvoiceLine" } })).toBe(0);

    await prisma.projectCategory.create({ data: { projectId: w.otherProjectId, code: "HM1-VL", name: "Vật liệu" } });
    const { row: foreign } = await ok(createInvoiceLine({ ...invoice(), projectId: w.otherProjectId }));
    expect(await refused(updateInvoiceLine(foreign.id, w.projectId, { qty: 1 }))).toMatch(/không còn trong công trình này/);
    expect(await refused(softDeleteInvoiceLine(foreign.id, w.projectId))).toMatch(/không còn trong công trình này/);
    const [derived] = await liveDerived(foreign.id);
    expect(derived.projectId).toBe(w.otherProjectId);
    expect(derived.itemCode).toMatch(/^HD-/); // công trình khác không có dự toán / ánh xạ của công trình đang mở
    expect((await prisma.projectInvoiceLine.findUniqueOrThrow({ where: { id: foreign.id } })).deletedAt).toBeNull();
  });

  it("sửa dòng hóa đơn của run import: giao dịch của run cập nhật tại chỗ, hoàn tác run bị từ chối", async () => {
    const run = await prisma.importRun.create({
      data: { fileName: "Can Doi Vat Tu 2.xlsx", fileHash: "dt-hd-tt", adapter: "du-an-dt-hd-tt", status: "committed", createdBy: ADMIN, committedAt: T1, reviewJson: { expected: { superseded: {} } } },
    });
    const [line] = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO project_invoice_lines ("projectId", "supplierId", "invoiceNo", "itemName", unit, "itemKey", qty, "amountVnd", "vatVnd", "importRunId", "createdAt", "updatedAt")
      VALUES (${w.projectId}, ${w.supplierId}, '0009', 'Cát vàng', 'm3', ${itemKeyOf("Cát vàng", "m3")}, 1, 500000, 40000, ${run.id}, ${T0}, ${T0}) RETURNING id`;
    await prisma.$executeRaw`
      INSERT INTO project_transactions ("projectId", date, "transactionType", "categoryId", "itemCode", "itemName", qty, unit, "amountHd", status, "sourceInvoiceLineId", "importRunId", "createdAt", "updatedAt")
      VALUES (${w.projectId}, ${T0}, 'lay_hang', ${w.vlCategoryId}, 'VL-001', 'Cát vàng', 1, 'm3', 500000, 'approved', ${line.id}, ${run.id}, ${T0}, ${T0})`;

    // Trước khi sửa: hoàn tác đã bị chặn vì dòng sổ nhập ngoài run (seed), nhưng chưa vì dòng hóa đơn.
    const before = (await rollbackImportRun(run.id).then(() => null, (e: unknown) => e)) as Error | null;
    expect(before).toBeInstanceOf(Error);
    expect(before!.message).toMatch(/không thuộc run/);
    expect(before!.message).not.toMatch(/hóa đơn của run đã sửa/);

    as(EDITOR);
    // Dòng import chỉ có tiền VAT (không VAT %): đổi đơn giá tính lại thành tiền, giữ tiền VAT và nhắc kiểm lại.
    const result = await ok(updateInvoiceLine(line.id, w.projectId, { unitPrice: 520_000 }));
    expect(result.row).toMatchObject({ amountVnd: 520_000, vatVnd: 40_000 });
    expect(result.warning).toMatch(/kiểm lại tiền VAT/);
    const derived = await liveDerived(line.id);
    expect(derived).toHaveLength(1);
    expect(derived[0].importRunId).toBe(run.id); // cập nhật tại chỗ, không tạo dòng ngoài run
    expect(derived[0].amountHd.toNumber()).toBe(520_000);
    expect(derived[0].date.getTime()).toBe(T0.getTime()); // dòng không có ngày → ngày dòng vào sổ
    await expect(rollbackImportRun(run.id)).rejects.toThrow(/1 dòng hóa đơn của run đã sửa hoặc xóa sau khi commit/);
    expect(await prisma.projectInvoiceLine.count({ where: { importRunId: run.id } })).toBe(1);
  });
});
