"use server";

/**
 * Sổ Hóa đơn của "Đối chiếu DT-HĐ-TT" (nhập tay). Quyền theo công trình: xem cần `read`, thêm dòng cần
 * `create`, sửa / xóa cần `edit`. Mọi lần ghi khóa công trình (`lockProjectDtHdTt`), tra lại NCC, tính
 * itemKey + tiền phía server, xóa mềm, và sinh lại giao dịch HĐ cho các tab cũ trong cùng transaction.
 *
 * Action ghi TRẢ `ActionResult` (không ném) để lý do từ chối hiện được ở production. Sửa nhận bản sửa
 * một phần (chỉ các ô đổi), gộp vào dòng đọc lại dưới khóa — hai lần sửa liên tiếp không ghi đè nhau.
 */

import type { ProjectInvoiceLine } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { rowGone, runEntryAction, type ActionResult } from "./entry-action-result";
import {
  dayFromIso, decOrNull, entryIdSchema, INVOICE_PATCH_KEYS, invoiceLineSchema, isoDay, mergeInvoicePatch, readPatch,
  resolveInvoiceAmounts, VAT_HINT, type InvoiceLineInput, type InvoiceLinePatch,
} from "./entry-schemas";
import { assertActiveSupplier, assertProjectActive, refChanged, revalidateEntryBook } from "./entry-write-guards";
import { assertInvoiceCategories, assertNoLegacyInvoiceTransactions, syncDerivedTransactions } from "./invoice-transaction-sync";
import { itemKeyOf } from "./keys";
import { lockProjectDtHdTt } from "./project-lock";

export interface InvoiceLineRow {
  id: number;
  supplierId: number;
  /** Tên NCC (cả NCC đã ngừng dùng — để dòng cũ vẫn hiện đúng tên). */
  supplierName: string;
  invoiceNo: string;
  invoiceDate: string | null;
  invoiceDateText: string | null;
  itemName: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  amountVnd: number;
  vatPct: number | null;
  vatVnd: number;
  note: string | null;
  /** Đã có alias `hd` cho tên|ĐVT — false hiện "chưa gán". */
  mapped: boolean;
}

export type InvoiceLineResult = ActionResult<{ row: InvoiceLineRow; warning?: string }>;

const LOG_TAG = "du-an.dt-hd-tt.hoa-don";
const WITH_SUPPLIER = { supplier: { select: { name: true } } } as const;

function toRow(l: ProjectInvoiceLine & { supplier: { name: string } }, mapped: boolean): InvoiceLineRow {
  return {
    id: l.id, supplierId: l.supplierId, supplierName: l.supplier.name, invoiceNo: l.invoiceNo, invoiceDate: isoDay(l.invoiceDate), invoiceDateText: l.invoiceDateText,
    itemName: l.itemName, unit: l.unit, qty: decOrNull(l.qty), unitPrice: decOrNull(l.unitPrice), amountVnd: l.amountVnd.toNumber(),
    vatPct: decOrNull(l.vatPct), vatVnd: l.vatVnd.toNumber(), note: l.note, mapped,
  };
}

/** Dòng đang lưu → input đầy đủ, nền để gộp bản sửa một phần. */
function inputOf(l: ProjectInvoiceLine): InvoiceLineInput {
  return {
    projectId: l.projectId, supplierId: l.supplierId, invoiceNo: l.invoiceNo, invoiceDate: isoDay(l.invoiceDate), itemName: l.itemName, unit: l.unit,
    qty: decOrNull(l.qty), unitPrice: decOrNull(l.unitPrice), amountVnd: l.amountVnd.toNumber(), vatPct: decOrNull(l.vatPct),
    vatVnd: l.vatVnd.toNumber(), note: l.note,
  };
}

async function hasAlias(projectId: number, itemKey: string): Promise<boolean> {
  const alias = await prisma.projectItemAlias.findFirst({ where: { projectId, source: "hd", itemKey, deletedAt: null }, select: { id: true } });
  return alias !== null;
}

/** Cột ghi được của một dòng hóa đơn từ dữ liệu đã parse (itemKey + tiền tính phía server). */
function lineData(input: InvoiceLineInput) {
  const data = invoiceLineSchema.parse(input);
  const { amountVnd, vatVnd } = resolveInvoiceAmounts(data);
  return {
    projectId: data.projectId,
    supplierId: data.supplierId,
    fields: {
      invoiceNo: data.invoiceNo, invoiceDate: dayFromIso(data.invoiceDate),
      // Có ngày đọc được thì bỏ chữ ngày gốc của file (chỉ giữ khi ngày còn trống).
      ...(data.invoiceDate ? { invoiceDateText: null } : {}),
      itemName: data.itemName, unit: data.unit, itemKey: itemKeyOf(data.itemName, data.unit), qty: data.qty, unitPrice: data.unitPrice,
      amountVnd, vatPct: data.vatPct, vatVnd, note: data.note,
    },
  };
}

export async function listInvoiceLines(projectId: number): Promise<InvoiceLineRow[]> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const [lines, aliases] = await Promise.all([
    prisma.projectInvoiceLine.findMany({ where: { projectId, deletedAt: null }, include: WITH_SUPPLIER, orderBy: [{ invoiceDate: "asc" }, { id: "asc" }] }),
    prisma.projectItemAlias.findMany({ where: { projectId, source: "hd", deletedAt: null }, select: { itemKey: true } }),
  ]);
  const mapped = new Set(aliases.map((a) => a.itemKey));
  return lines.map((l) => toRow(l, mapped.has(l.itemKey)));
}

/**
 * NCC chọn được ở cột NCC: mọi NCC đang hoạt động của công ty (dữ liệu nền dùng chung, chỉ id + tên),
 * cần quyền đọc công trình. Không tạo NCC ở đây — NCC mới do quản trị tạo.
 */
export async function listSupplierOptions(projectId: number): Promise<{ id: number; name: string }[]> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function createInvoiceLine(input: InvoiceLineInput): Promise<InvoiceLineResult> {
  return runEntryAction(LOG_TAG, async () => {
    const { projectId, supplierId, fields } = lineData(input);
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId } });
    const line = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [projectId]);
      await assertProjectActive(tx, projectId);
      // Mọi kiểm tra trước lần ghi đầu tiên: từ chối không để lại dòng audit "create".
      await assertNoLegacyInvoiceTransactions(tx, projectId);
      await assertInvoiceCategories(tx, projectId);
      await assertActiveSupplier(tx, supplierId);
      const created = await tx.projectInvoiceLine.create({ data: { projectId, supplierId, ...fields }, include: WITH_SUPPLIER });
      await syncDerivedTransactions(tx, projectId, [created.id]);
      return created;
    });
    revalidateEntryBook(projectId, "hoa-don");
    return { row: toRow(line, await hasAlias(projectId, line.itemKey)) };
  });
}

/** Sửa một dòng: `patch` chỉ gồm các ô đổi (gửi đủ mọi cột cũng được — như sửa cả dòng). */
export async function updateInvoiceLine(id: number, projectId: number, patch: InvoiceLinePatch): Promise<InvoiceLineResult> {
  return runEntryAction(LOG_TAG, async () => {
    const lineId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const changes = readPatch(patch, INVOICE_PATCH_KEYS);
    const existing = await prisma.projectInvoiceLine.findUnique({ where: { id: lineId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(rowGone("Dòng hóa đơn"));
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    const { line, vatHint } = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      // Đọc lại dưới khóa rồi gộp: import / hoàn tác / người khác có thể vừa đổi dòng.
      const current = await tx.projectInvoiceLine.findFirst({ where: { id: lineId, projectId: scopeId, deletedAt: null } });
      if (!current) throw new Error(rowGone("Dòng hóa đơn"));
      const merged = mergeInvoicePatch(inputOf(current), changes);
      const { supplierId, fields } = lineData(merged.input);
      if (refChanged(current.supplierId, supplierId)) await assertActiveSupplier(tx, supplierId);
      await assertInvoiceCategories(tx, scopeId);
      const updated = await tx.projectInvoiceLine.update({ where: { id: lineId, projectId: scopeId }, data: { supplierId, ...fields }, include: WITH_SUPPLIER });
      await syncDerivedTransactions(tx, scopeId, [lineId]);
      return { line: updated, vatHint: merged.vatHint };
    });
    revalidateEntryBook(scopeId, "hoa-don");
    return { row: toRow(line, await hasAlias(scopeId, line.itemKey)), ...(vatHint ? { warning: VAT_HINT } : {}) };
  });
}

export async function softDeleteInvoiceLine(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const lineId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const existing = await prisma.projectInvoiceLine.findUnique({ where: { id: lineId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(rowGone("Dòng hóa đơn"));
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectInvoiceLine.findFirst({ where: { id: lineId, projectId: scopeId, deletedAt: null }, select: { id: true } });
      if (!current) throw new Error(rowGone("Dòng hóa đơn"));
      await tx.projectInvoiceLine.update({ where: { id: lineId, projectId: scopeId }, data: { deletedAt: new Date() } });
      await syncDerivedTransactions(tx, scopeId, [lineId]);
    });
    revalidateEntryBook(scopeId, "hoa-don");
    return {};
  });
}
