/**
 * Integration test: màn Ánh xạ, Đầu mối, Mã nhóm của "Đối chiếu DT-HĐ-TT" trên Postgres thật, với ACL
 * thật (chỉ phiên đăng nhập là giả lập). Kiểm:
 *   - xác nhận alias đưa dòng hóa đơn từ "chưa gán" vào dòng DT, và chuyển giao dịch HĐ sinh tự động
 *     sang hạng mục / mã vật tư của dòng dự toán; bỏ gán đưa về "Ngoài DT"; đổi loại dòng DT đổi loại
 *     giao dịch;
 *   - đổi nguồn thực tế của đầu mối đổi T của HĐ-TT; H nhập tay đổi I;
 *   - Mã nhóm / đầu mối / Dòng DT của công trình khác bị từ chối;
 *   - quyền: `read` chỉ xem, `create` thêm được nhưng không sửa / xóa / nhập H-S-X-Z, `edit` làm được hết;
 *   - mỗi NCC một dòng, tên đầu mối / mã nhóm trùng → thông điệp tiếng Việt; xác nhận hàng loạt ghi đúng
 *     một dòng audit;
 *   - dòng nguồn của khóa đang mở (`loadAliasSourceLines`): tối đa 20 dòng, chỉ trong công trình, người
 *     không có quyền đọc công trình bị từ chối.
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
import { syncDerivedTransactions } from "@/lib/du-an/dt-hd-tt/invoice-transaction-sync";
import { confirmAliases, createAlias, listAliasBoard, softDeleteAlias, updateAlias } from "@/lib/du-an/dt-hd-tt/alias-service";
import { loadAliasSourceLines } from "@/lib/du-an/dt-hd-tt/alias-source-lines";
import { createGroupCode, listGroupCodes, softDeleteGroupCode, updateGroupCode } from "@/lib/du-an/dt-hd-tt/group-code-service";
import {
  createCounterparty, createCounterpartySupplier, listCounterparties, updateCounterparty, updateCounterpartySupplier,
} from "@/lib/du-an/dt-hd-tt/counterparty-service";
import { getDtHdTtReports } from "@/lib/du-an/dt-hd-tt/report-service";

const ADMIN = "map-admin";
const READER = "map-reader";
const CREATOR = "map-creator";
const EDITOR = "map-editor";
const NO_PERMISSION = { ok: false, message: "Bạn không có quyền thao tác này trên công trình." };

const DT_KEY = dtLineKeyOf("Cát vàng", "m3", "VL");
const HD_KEY = itemKeyOf("Cát vàng loại 1", "m³");

interface World {
  projectId: number;
  otherProjectId: number;
  firstVlCategoryId: number;
  estimateCategoryId: number;
  supplierId: number;
  counterpartyId: number;
  otherCounterpartyId: number;
  otherGroupId: number;
  lineId: number;
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
  // Hạng mục VL đầu tiên nhận giao dịch "Ngoài DT"; dự toán nằm ở hạng mục VL thứ hai để thấy giao dịch chuyển chỗ.
  const firstVl = await prisma.projectCategory.create({ data: { projectId: project.id, code: "HM1-VL", name: "Móng – vật liệu" } });
  const estimateVl = await prisma.projectCategory.create({ data: { projectId: project.id, code: "HM2-VL", name: "Thân – vật liệu" } });
  await prisma.projectEstimate.create({
    data: { projectId: project.id, categoryId: estimateVl.id, itemCode: "VL-002", itemName: "Cát vàng", unit: "m3", qty: 100, unitPrice: 500_000, totalVnd: 50_000_000 },
  });
  const supplier = await prisma.supplier.create({ data: { name: "Vật liệu Thanh Tùng", taxCode: "0100000001" } });
  const cp = await prisma.projectCounterparty.create({
    data: { projectId: project.id, name: "Thanh Tùng", kind: "ncc", actualBasis: "manual", actualManualVnd: 7_000_000 },
  });
  const otherCp = await prisma.projectCounterparty.create({ data: { projectId: other.id, name: "Đầu mối công trình khác", kind: "ncc" } });
  const otherGroup = await prisma.projectGroupCode.create({ data: { projectId: other.id, code: "CAT", name: "Cát (công trình khác)" } });
  // Dòng hóa đơn tên mới: chưa có alias → "chưa gán"; giao dịch HĐ sinh như khi nhập ở sổ Hóa đơn.
  const line = await prisma.projectInvoiceLine.create({
    data: {
      projectId: project.id, supplierId: supplier.id, invoiceNo: "0001", invoiceDate: new Date("2026-11-17T00:00:00Z"), itemName: "Cát vàng loại 1",
      unit: "m³", itemKey: HD_KEY, qty: 10, unitPrice: 520_000, amountVnd: 5_200_000, vatPct: 0.08, vatVnd: 416_000,
    },
  });
  await syncDerivedTransactions(prisma, project.id, [line.id]);
  await prisma.projectActualReceipt.create({
    data: { projectId: project.id, itemName: "Cát vàng", unit: "m3", itemKey: itemKeyOf("Cát vàng", "m3"), amountVnd: 3_000_000, counterpartyId: cp.id },
  });
  return {
    projectId: project.id, otherProjectId: other.id, firstVlCategoryId: firstVl.id, estimateCategoryId: estimateVl.id, supplierId: supplier.id,
    counterpartyId: cp.id, otherCounterpartyId: otherCp.id, otherGroupId: otherGroup.id, lineId: line.id,
  };
}

const as = (id: string) => mockSession({ id, role: id === ADMIN ? "admin" : "viewer" });
const derived = async (lineId: number) => {
  const rows = await prisma.projectTransaction.findMany({ where: { sourceInvoiceLineId: lineId, deletedAt: null } });
  expect(rows).toHaveLength(1);
  return rows[0];
};

/** Kết quả action phải thành công; trả phần dữ liệu. */
function expectOk<R extends { ok: boolean; message?: string }>(result: R): Extract<R, { ok: true }> {
  if (!result.ok) throw new Error(`Thao tác bị từ chối: ${result.message}`);
  return result as Extract<R, { ok: true }>;
}

describe("màn Ánh xạ, Đầu mối, Mã nhóm của Đối chiếu DT-HĐ-TT", () => {
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

  it("xác nhận alias đưa dòng hóa đơn từ chưa gán vào dòng DT và chuyển giao dịch HĐ sang hạng mục của dự toán", async () => {
    as(EDITOR);
    const before = await listAliasBoard(w.projectId);
    expect(before.tabs.hd[0]).toMatchObject({ itemKey: HD_KEY, alias: null, lineCount: 1, amount: 5_200_000, parties: "Vật liệu Thanh Tùng" });
    expect((await getDtHdTtReports(w.projectId)).dtHd.partB.flatMap((p) => p.lines.map((l) => l.invoiceLineId))).toEqual([w.lineId]);
    const outside = await derived(w.lineId);
    expect(outside).toMatchObject({ categoryId: w.firstVlCategoryId, transactionType: "lay_hang" });
    expect(outside.itemCode).toMatch(/^HD-/);

    const { alias } = expectOk(await createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, dtKey: DT_KEY, factor: 0, status: "xac_nhan" }));
    expect(alias).toMatchObject({ dtKey: DT_KEY, factor: null, status: "xac_nhan" });
    const stored = await prisma.projectItemAlias.findUniqueOrThrow({ where: { id: alias.id } });
    expect(stored).toMatchObject({ itemName: "Cát vàng loại 1", unit: "m³" }); // tên / ĐVT lấy từ sổ phía server

    const moved = await derived(w.lineId);
    expect(moved.id).toBe(outside.id); // cập nhật tại chỗ
    expect(moved).toMatchObject({ categoryId: w.estimateCategoryId, itemCode: "VL-002", transactionType: "lay_hang" });

    const reports = await getDtHdTtReports(w.projectId);
    expect(reports.dtHd.partB).toEqual([]);
    const dtLine = reports.dtHd.blocks.flatMap((b) => b.groups.flatMap((g) => g.lines)).find((l) => l.key === DT_KEY);
    expect(dtLine?.invoices.map((i) => i.invoiceLineId)).toEqual([w.lineId]);
    expect(reports.dtHd.grandCheck.ok).toBe(true);
    expect((await listAliasBoard(w.projectId)).tabs.hd[0].alias?.id).toBe(alias.id);

    // Đổi loại của dòng DT (alias dt) → loại giao dịch HĐ của dòng gán vào nó đổi theo.
    expectOk(await createAlias({ projectId: w.projectId, source: "dt", itemKey: DT_KEY, kind: "MTC", status: "xac_nhan" }));
    expect((await derived(w.lineId)).transactionType).toBe("may_moc");

    // Bỏ gán → dòng trở lại "chưa gán", giao dịch về mã tổng hợp HD-… ("Ngoài DT" ở tab cũ).
    expectOk(await softDeleteAlias(alias.id, w.projectId));
    expect((await derived(w.lineId)).itemCode).toMatch(/^HD-/);
    expect((await getDtHdTtReports(w.projectId)).dtHd.partBTotal).toBe(5_200_000);
  });

  it("sửa alias chỉ đổi trường được gửi; Ngoài DT xóa dòng DT; tổ hợp sai bị từ chối bằng tiếng Việt", async () => {
    as(EDITOR);
    const { alias } = expectOk(await createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, dtKey: DT_KEY, factor: 1.5, status: "de_xuat", note: "giữ" }));
    const patched = expectOk(await updateAlias(alias.id, w.projectId, { status: "xac_nhan" }));
    expect(patched.alias).toMatchObject({ dtKey: DT_KEY, factor: 1.5, note: "giữ", status: "xac_nhan" });

    const outside = expectOk(await updateAlias(alias.id, w.projectId, { status: "ngoai_dt" }));
    expect(outside.alias).toMatchObject({ dtKey: null, factor: null, groupCodeId: null, status: "ngoai_dt" });
    expect((await derived(w.lineId)).itemCode).toMatch(/^HD-/);

    await expect(updateAlias(alias.id, w.projectId, { status: "xac_nhan" })).resolves.toEqual({ ok: false, message: "Chọn Dòng DT hoặc Mã nhóm trước khi xác nhận" });
    await expect(updateAlias(alias.id, w.projectId, { factor: -2, status: "de_xuat" })).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Hệ số phải lớn hơn 0/) });
    await expect(createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, status: "de_xuat" })).resolves.toMatchObject({
      ok: false, message: expect.stringMatching(/đã có ánh xạ/),
    });
    await expect(createAlias({ projectId: w.projectId, source: "tt", itemKey: "khong co|m3", status: "de_xuat" })).resolves.toMatchObject({
      ok: false, message: expect.stringMatching(/Không còn dòng nào/),
    });
  });

  it("Mã nhóm, đầu mối và Dòng DT của công trình khác bị từ chối", async () => {
    as(EDITOR);
    await expect(createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, groupCodeId: w.otherGroupId, status: "xac_nhan" })).resolves.toEqual({
      ok: false, message: "Mã nhóm không thuộc công trình này",
    });
    await expect(createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, dtKey: dtLineKeyOf("Đá 1x2", "m3", "VL"), status: "xac_nhan" })).resolves.toEqual({
      ok: false, message: "Dòng DT không thuộc dự toán của công trình này",
    });
    await expect(createGroupCode({ projectId: w.projectId, code: "CAT", name: "Cát", counterpartyId: w.otherCounterpartyId })).resolves.toEqual({
      ok: false, message: "Đầu mối không thuộc công trình này",
    });
    await expect(createCounterpartySupplier({ projectId: w.projectId, supplierId: w.supplierId, counterpartyId: w.otherCounterpartyId })).resolves.toEqual({
      ok: false, message: "Đầu mối không thuộc công trình này",
    });
    // Sửa mã nhóm của công trình khác qua công trình đang mở: như dòng không tồn tại.
    await expect(updateGroupCode(w.otherGroupId, w.projectId, { name: "x" })).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/không còn trong công trình này/) });
    expect(await prisma.projectItemAlias.count()).toBe(0);
    expect(await prisma.projectGroupCode.count({ where: { projectId: w.projectId } })).toBe(0);
  });

  it("đổi nguồn thực tế của đầu mối đổi T của HĐ-TT; H nhập tay đổi I", async () => {
    as(EDITOR);
    const { row: link } = expectOk(await createCounterpartySupplier({ projectId: w.projectId, supplierId: w.supplierId, counterpartyId: w.counterpartyId }));
    const hdTtRow = async () => (await getDtHdTtReports(w.projectId)).hdTt.rows.find((r) => r.supplierId === w.supplierId)!;
    expect((await hdTtRow()).actual).toBe(7_000_000); // số chốt tay

    expectOk(await updateCounterparty(w.counterpartyId, w.projectId, { actualBasis: "receipts" }));
    expect((await hdTtRow()).actual).toBe(3_000_000); // Σ thực tế nhập gắn đầu mối

    expectOk(await updateCounterparty(w.counterpartyId, w.projectId, { actualBasis: "invoices" }));
    expect((await hdTtRow()).actual).toBeCloseTo(5_200_000 * 1.08, 2); // Σ HĐ × (1 + VAT mặc định)

    // Bản vá chỉ đổi nguồn: số chốt tay đang lưu còn nguyên.
    const stored = await prisma.projectCounterparty.findUniqueOrThrow({ where: { id: w.counterpartyId } });
    expect(stored.actualManualVnd?.toNumber()).toBe(7_000_000);

    expect((await hdTtRow()).paid).toBe(0);
    const typed = expectOk(await updateCounterpartySupplier(link.id, w.projectId, { paidOverrideVnd: 2_500_000, recoveredVnd: 100_000, todoNote: "lấy HĐ còn thiếu" }));
    expect(typed.row).toMatchObject({ paidOverrideVnd: 2_500_000, recoveredVnd: 100_000, todoNote: "lấy HĐ còn thiếu", counterpartyId: w.counterpartyId });
    expect(await hdTtRow()).toMatchObject({ paidOverride: 2_500_000, paid: 2_500_000, recovered: 100_000, todo: "lấy HĐ còn thiếu" });
  });

  it("mỗi NCC một dòng; tên đầu mối / mã nhóm trùng; mã nhóm đang dùng không xóa được", async () => {
    as(EDITOR);
    expectOk(await createCounterpartySupplier({ projectId: w.projectId, supplierId: w.supplierId, counterpartyId: w.counterpartyId }));
    await expect(createCounterpartySupplier({ projectId: w.projectId, supplierId: w.supplierId })).resolves.toEqual({
      ok: false, message: 'NCC "Vật liệu Thanh Tùng" đã thuộc đầu mối "Thanh Tùng" — mỗi NCC chỉ một dòng trong công trình',
    });
    await expect(createCounterparty({ projectId: w.projectId, name: " Thanh Tùng ", kind: "ncc", actualBasis: "receipts" })).resolves.toEqual({
      ok: false, message: 'Đầu mối "Thanh Tùng" đã có trong công trình',
    });

    const { row: group } = expectOk(await createGroupCode({ projectId: w.projectId, code: "CAT", name: "Cát", counterpartyId: w.counterpartyId, isMainMaterial: true }));
    expect(group).toMatchObject({ counterpartyName: "Thanh Tùng", isMainMaterial: true, aliasCount: 0 });
    await expect(createGroupCode({ projectId: w.projectId, code: "CAT", name: "Cát 2" })).resolves.toEqual({ ok: false, message: 'Mã nhóm "CAT" đã có trong công trình' });

    // Dòng hóa đơn gán vào dòng DT → nhóm của alias hd lấy theo nhóm của dòng DT.
    expectOk(await createAlias({ projectId: w.projectId, source: "dt", itemKey: DT_KEY, groupCodeId: group.id, status: "xac_nhan" }));
    const { alias } = expectOk(await createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, dtKey: DT_KEY, status: "xac_nhan" }));
    expect(alias.groupCodeId).toBe(group.id);

    await expect(softDeleteGroupCode(group.id, w.projectId)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/đang dùng ở 2 ánh xạ/) });
    expect((await listGroupCodes(w.projectId))[0]).toMatchObject({ code: "CAT", aliasCount: 2 });
    // Đầu mối còn mã nhóm / NCC / thực tế nhập → không xóa được (kiểm ở service); danh sách vẫn đủ.
    expect((await listCounterparties(w.projectId)).links).toHaveLength(1);
  });

  it("sửa ghi chú hay xác nhận không ghi lại giao dịch HĐ; đổi hệ số thì có", async () => {
    as(EDITOR);
    const { alias } = expectOk(await createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, dtKey: DT_KEY, status: "de_xuat" }));
    const tx = await derived(w.lineId);
    const txAudits = () => prisma.auditLog.count({ where: { tableName: "ProjectTransaction", recordId: String(tx.id) } });
    const before = await txAudits();

    expectOk(await updateAlias(alias.id, w.projectId, { note: "kiểm lại giá" }));
    expectOk(await updateAlias(alias.id, w.projectId, { status: "xac_nhan" }));
    expect(await txAudits()).toBe(before);
    expect((await derived(w.lineId)).updatedAt).toEqual(tx.updatedAt);

    expectOk(await updateAlias(alias.id, w.projectId, { factor: 2 }));
    expect(await txAudits()).toBe(before + 1);
    expect(Number((await derived(w.lineId)).qty)).toBe(20); // 10 m³ × hệ số 2
  });

  it("alias trỏ tới dòng DT đã mất vẫn sửa được ghi chú và bỏ chọn, nhưng không xác nhận lại được", async () => {
    as(EDITOR);
    const { alias } = expectOk(await createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, dtKey: DT_KEY, status: "de_xuat" }));
    const estimate = await prisma.projectEstimate.findFirstOrThrow({ where: { projectId: w.projectId } });
    await prisma.projectEstimate.update({ where: { id: estimate.id }, data: { deletedAt: new Date() } });

    const noted = expectOk(await updateAlias(alias.id, w.projectId, { note: "dự toán đã đổi" }));
    expect(noted.alias).toMatchObject({ dtKey: DT_KEY, note: "dự toán đã đổi" });
    await expect(updateAlias(alias.id, w.projectId, { status: "xac_nhan" })).resolves.toEqual({
      ok: false, message: "Dòng DT đã chọn không còn trong dự toán — chọn lại Dòng DT trước khi xác nhận",
    });
    const board = await listAliasBoard(w.projectId);
    expect(board.tabs.hd[0].alias?.dtKey).toBe(DT_KEY);
    expect(board.dtLines.some((l) => l.key === DT_KEY)).toBe(false);

    const cleared = expectOk(await updateAlias(alias.id, w.projectId, { dtKey: null }));
    expect(cleared.alias.dtKey).toBeNull();
  });

  it("Mã nhóm của alias hd theo nhóm hiện tại của dòng DT; bản sao nhóm cũ không chặn sửa hay xóa mã nhóm", async () => {
    as(EDITOR);
    const { row: g1 } = expectOk(await createGroupCode({ projectId: w.projectId, code: "CAT", name: "Cát" }));
    const { row: g2 } = expectOk(await createGroupCode({ projectId: w.projectId, code: "CAT-V", name: "Cát vàng" }));
    const { alias: dt } = expectOk(await createAlias({ projectId: w.projectId, source: "dt", itemKey: DT_KEY, groupCodeId: g1.id, status: "xac_nhan" }));
    const { alias: hd } = expectOk(await createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, dtKey: DT_KEY, status: "de_xuat" }));
    expect(hd.groupCodeId).toBe(g1.id); // lấy từ dòng DT
    await expect(updateAlias(hd.id, w.projectId, { groupCodeId: g2.id })).resolves.toEqual({
      ok: false, message: "Dòng DT đã chọn thuộc Mã nhóm khác — chọn lại Mã nhóm hoặc Dòng DT",
    });

    // Dòng DT chuyển sang g2: alias hd còn lưu g1, nhưng nhóm hiệu lực (bảng Ánh xạ, số ánh xạ) là g2.
    expectOk(await updateAlias(dt.id, w.projectId, { groupCodeId: g2.id }));
    expect((await prisma.projectItemAlias.findUniqueOrThrow({ where: { id: hd.id } })).groupCodeId).toBe(g1.id);
    expect((await listAliasBoard(w.projectId)).tabs.hd[0].alias?.groupCodeId).toBe(g2.id);
    expect(Object.fromEntries((await listGroupCodes(w.projectId)).map((g) => [g.code, g.aliasCount]))).toEqual({ CAT: 0, "CAT-V": 2 });
    expectOk(await softDeleteGroupCode(g1.id, w.projectId));

    // Sửa trạng thái alias hd: bản sao cũ (g1, đã xóa) không chặn; lưu nhóm hiện tại của dòng DT.
    const confirmed = expectOk(await updateAlias(hd.id, w.projectId, { status: "xac_nhan" }));
    expect(confirmed.alias.groupCodeId).toBe(g2.id);
  });

  it("xác nhận hàng loạt chỉ chuyển đề xuất đủ điều kiện và ghi đúng một dòng audit", async () => {
    const ready = await prisma.projectItemAlias.create({
      data: { projectId: w.projectId, source: "hd", itemKey: HD_KEY, itemName: "Cát vàng loại 1", unit: "m³", dtKey: DT_KEY, status: "de_xuat" },
    });
    const bare = await prisma.projectItemAlias.create({
      data: { projectId: w.projectId, source: "tt", itemKey: itemKeyOf("Cát vàng", "m3"), itemName: "Cát vàng", unit: "m3", status: "de_xuat" },
    });
    // Đề xuất trỏ tới dòng DT đã mất khỏi dự toán: bỏ qua và đếm riêng.
    const stale = await prisma.projectItemAlias.create({
      data: { projectId: w.projectId, source: "tt", itemKey: itemKeyOf("Đá 1x2", "m3"), itemName: "Đá 1x2", unit: "m3", dtKey: dtLineKeyOf("Đá 1x2", "m3", "VL"), status: "de_xuat" },
    });

    as(CREATOR);
    await expect(confirmAliases(w.projectId, [ready.id, bare.id])).resolves.toEqual(NO_PERMISSION);

    as(EDITOR);
    await expect(confirmAliases(w.projectId, [ready.id, bare.id, stale.id])).resolves.toEqual({ ok: true, confirmed: 1, skipped: 2, staleDtLine: 1 });
    expect((await prisma.projectItemAlias.findUniqueOrThrow({ where: { id: ready.id } })).status).toBe("xac_nhan");
    expect((await prisma.projectItemAlias.findUniqueOrThrow({ where: { id: bare.id } })).status).toBe("de_xuat");
    expect((await prisma.projectItemAlias.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("de_xuat");
    const audits = await prisma.auditLog.findMany({ where: { action: "bulk_confirm" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ userId: EDITOR, tableName: "ProjectItemAlias", recordId: `project:${w.projectId}` });
    expect(audits[0].afterJson).toEqual({ status: "xac_nhan", aliasIds: [ready.id] });
  });

  it("quyền: read chỉ xem; create thêm được nhưng không sửa / nhập H; công trình không có quyền thì không xem", async () => {
    as(READER);
    expect((await listAliasBoard(w.projectId)).tabs.hd).toHaveLength(1);
    await expect(createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, status: "de_xuat" })).resolves.toEqual(NO_PERMISSION);
    await expect(createGroupCode({ projectId: w.projectId, code: "CAT", name: "Cát" })).resolves.toEqual(NO_PERMISSION);
    await expect(updateCounterparty(w.counterpartyId, w.projectId, { actualBasis: "receipts" })).resolves.toEqual(NO_PERMISSION);
    await expect(listAliasBoard(w.otherProjectId)).rejects.toThrow("Forbidden");

    as(CREATOR);
    const { alias } = expectOk(await createAlias({ projectId: w.projectId, source: "hd", itemKey: HD_KEY, dtKey: DT_KEY, status: "de_xuat" }));
    const { row: link } = expectOk(await createCounterpartySupplier({ projectId: w.projectId, supplierId: w.supplierId, counterpartyId: w.counterpartyId }));
    expectOk(await createGroupCode({ projectId: w.projectId, code: "CAT", name: "Cát" }));
    await expect(updateAlias(alias.id, w.projectId, { status: "xac_nhan" })).resolves.toEqual(NO_PERMISSION);
    await expect(softDeleteAlias(alias.id, w.projectId)).resolves.toEqual(NO_PERMISSION);
    await expect(updateCounterpartySupplier(link.id, w.projectId, { paidOverrideVnd: 1 })).resolves.toEqual(NO_PERMISSION);
    expect((await prisma.projectCounterpartySupplier.findUniqueOrThrow({ where: { id: link.id } })).paidOverrideVnd).toBeNull();

    as(EDITOR);
    expectOk(await updateAlias(alias.id, w.projectId, { status: "xac_nhan" }));
    expectOk(await updateCounterpartySupplier(link.id, w.projectId, { paidOverrideVnd: 1 }));
    const audits = await prisma.auditLog.findMany({ where: { tableName: "ProjectItemAlias", recordId: String(alias.id) } });
    expect(audits.map((a) => [a.action, a.userId]).sort()).toEqual([["create", CREATOR], ["update", EDITOR]]);
  });

  it("dòng nguồn của khóa đang mở: tối đa 20 dòng, chỉ trong công trình, người không có quyền đọc bị từ chối", async () => {
    // Tên / số bịa cho test. 22 dòng cùng khóa trong công trình, ngày tăng dần; thêm một dòng đã xóa mềm
    // và một dòng cùng khóa ở công trình khác, cả hai ngày sớm hơn — lọt phạm vi thì sẽ đứng đầu danh sách.
    const key = itemKeyOf("Gạch mẫu thử", "viên");
    const line = (projectId: number, n: number, day: Date, deletedAt: Date | null = null) =>
      prisma.projectInvoiceLine.create({
        data: {
          projectId, supplierId: w.supplierId, invoiceNo: `T-${n}`, invoiceDate: day, itemName: "Gạch mẫu thử", unit: "viên", itemKey: key,
          qty: 10, unitPrice: 1_000, amountVnd: 10_000, deletedAt,
        },
      });
    for (let i = 0; i < 22; i++) await line(w.projectId, 100 + i, new Date(Date.UTC(2026, 10, 1 + i)));
    const deleted = await line(w.projectId, 900, new Date(Date.UTC(2026, 9, 1)), new Date());
    const foreign = await line(w.otherProjectId, 901, new Date(Date.UTC(2026, 9, 2)));
    await prisma.user.create({ data: { id: "map-outsider", name: "map-outsider", email: "map-outsider@test.local", role: "viewer" } });
    await prisma.modulePermission.create({ data: { userId: "map-outsider", moduleKey: "du-an", level: "edit" } });

    as(READER);
    const hd = await loadAliasSourceLines(w.projectId, "hd", key);
    expect(hd).toMatchObject({ source: "hd", itemKey: key });
    expect(hd.lines).toHaveLength(20);
    expect(hd.lines.map((l) => l.invoiceNo)).toEqual(Array.from({ length: 20 }, (_, i) => `T-${100 + i}`));
    const ids = hd.lines.map((l) => l.id);
    expect(ids).not.toContain(deleted.id);
    expect(ids).not.toContain(foreign.id);
    const stored = await prisma.projectInvoiceLine.findMany({ where: { id: { in: ids } }, select: { projectId: true, deletedAt: true } });
    expect(stored.every((r) => r.projectId === w.projectId && r.deletedAt === null)).toBe(true);
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: w.supplierId } });
    expect(hd.lines[0]).toMatchObject({ party: supplier.name, supplierId: w.supplierId, qty: 10, unitPrice: 1_000, amount: 10_000 });

    // Khóa thực tế nhập của seed: một dòng, gắn đầu mối của công trình.
    const tt = await loadAliasSourceLines(w.projectId, "tt", itemKeyOf("Cát vàng", "m3"));
    const cp = await prisma.projectCounterparty.findUniqueOrThrow({ where: { id: w.counterpartyId } });
    expect(tt.lines).toEqual([expect.objectContaining({ party: cp.name, supplierId: null, invoiceNo: null, amount: 3_000_000 })]);

    // Không có quyền đọc công trình (READER ở công trình khác; người chỉ có quyền module): bị từ chối.
    await expect(loadAliasSourceLines(w.otherProjectId, "hd", key)).rejects.toThrow("Forbidden");
    as("map-outsider");
    await expect(loadAliasSourceLines(w.projectId, "hd", key)).rejects.toThrow("Forbidden");
  });
});
