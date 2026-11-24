"use server";

/**
 * Sổ Thực tế nhập của "Đối chiếu DT-HĐ-TT" (thành tiền gồm VAT, gắn đầu mối). Quyền theo công trình:
 * xem `read`, thêm `create`, sửa / xóa `edit`. Dòng mới bắt buộc có đầu mối; đầu mối phải thuộc đúng
 * công trình. Mỗi lần ghi khóa công trình, tính itemKey + thành tiền phía server, xóa mềm.
 *
 * Action ghi TRẢ `ActionResult` (không ném). Sửa nhận bản sửa một phần, gộp vào dòng đọc lại dưới khóa.
 */

import type { ProjectActualReceipt } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { rowGone, runEntryAction, type ActionResult } from "./entry-action-result";
import {
  dayFromIso, decOrNull, entryIdSchema, isoDay, mergeReceiptPatch, readPatch, RECEIPT_PATCH_KEYS, receiptCreateSchema,
  receiptUpdateSchema, resolveAmount, type ReceiptCreateInput, type ReceiptPatch, type ReceiptUpdateInput,
} from "./entry-schemas";
import { assertCounterpartyInProject, assertProjectActive, refChanged, revalidateEntryBook } from "./entry-write-guards";
import { itemKeyOf } from "./keys";
import { lockProjectDtHdTt } from "./project-lock";

export interface ReceiptRow {
  id: number;
  date: string | null;
  dateText: string | null;
  itemName: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  amountVnd: number;
  counterpartyId: number | null;
  counterpartyName: string | null;
  note: string | null;
  /** Đã có alias `tt` cho tên|ĐVT — false hiện "chưa gán". */
  mapped: boolean;
}

export type ReceiptResult = ActionResult<{ row: ReceiptRow }>;

const LOG_TAG = "du-an.dt-hd-tt.thuc-te-nhap";
const WITH_COUNTERPARTY = { counterparty: { select: { name: true } } } as const;

function toRow(r: ProjectActualReceipt & { counterparty: { name: string } | null }, mapped: boolean): ReceiptRow {
  return {
    id: r.id, date: isoDay(r.date), dateText: r.dateText, itemName: r.itemName, unit: r.unit, qty: decOrNull(r.qty),
    unitPrice: decOrNull(r.unitPrice), amountVnd: r.amountVnd.toNumber(), counterpartyId: r.counterpartyId,
    counterpartyName: r.counterparty?.name ?? null, note: r.note, mapped,
  };
}

/** Dòng đang lưu → input đầy đủ, nền để gộp bản sửa một phần. */
function inputOf(r: ProjectActualReceipt): ReceiptUpdateInput {
  return {
    projectId: r.projectId, date: isoDay(r.date), itemName: r.itemName, unit: r.unit, qty: decOrNull(r.qty), unitPrice: decOrNull(r.unitPrice),
    amountVnd: r.amountVnd.toNumber(), counterpartyId: r.counterpartyId, note: r.note,
  };
}

async function hasAlias(projectId: number, itemKey: string): Promise<boolean> {
  const alias = await prisma.projectItemAlias.findFirst({ where: { projectId, source: "tt", itemKey, deletedAt: null }, select: { id: true } });
  return alias !== null;
}

function receiptFields(data: ReturnType<typeof receiptUpdateSchema.parse>) {
  return {
    date: dayFromIso(data.date),
    ...(data.date ? { dateText: null } : {}),
    itemName: data.itemName, unit: data.unit, itemKey: itemKeyOf(data.itemName, data.unit), qty: data.qty, unitPrice: data.unitPrice,
    amountVnd: resolveAmount(data), counterpartyId: data.counterpartyId, note: data.note,
  };
}

export async function listReceipts(projectId: number): Promise<ReceiptRow[]> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const [rows, aliases] = await Promise.all([
    prisma.projectActualReceipt.findMany({ where: { projectId, deletedAt: null }, include: WITH_COUNTERPARTY, orderBy: [{ date: "asc" }, { id: "asc" }] }),
    prisma.projectItemAlias.findMany({ where: { projectId, source: "tt", deletedAt: null }, select: { itemKey: true } }),
  ]);
  const mapped = new Set(aliases.map((a) => a.itemKey));
  return rows.map((r) => toRow(r, mapped.has(r.itemKey)));
}

/** Đầu mối của công trình (chọn ở Thực tế nhập / Chi thực tế). */
export async function listCounterpartyOptions(projectId: number): Promise<{ id: number; name: string }[]> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.projectCounterparty.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ sortGroup: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createReceipt(input: ReceiptCreateInput): Promise<ReceiptResult> {
  return runEntryAction(LOG_TAG, async () => {
    const data = receiptCreateSchema.parse(input);
    const { projectId } = data;
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId } });
    const fields = receiptFields(data);
    const row = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [projectId]);
      await assertProjectActive(tx, projectId);
      await assertCounterpartyInProject(tx, projectId, data.counterpartyId);
      return tx.projectActualReceipt.create({ data: { projectId, ...fields }, include: WITH_COUNTERPARTY });
    });
    revalidateEntryBook(projectId, "thuc-te-nhap");
    return { row: toRow(row, await hasAlias(projectId, row.itemKey)) };
  });
}

/** Sửa một dòng: `patch` chỉ gồm các ô đổi (gửi đủ mọi cột cũng được). */
export async function updateReceipt(id: number, projectId: number, patch: ReceiptPatch): Promise<ReceiptResult> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const changes = readPatch(patch, RECEIPT_PATCH_KEYS);
    const existing = await prisma.projectActualReceipt.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(rowGone("Dòng thực tế nhập"));
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    const row = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectActualReceipt.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null } });
      if (!current) throw new Error(rowGone("Dòng thực tế nhập"));
      const data = receiptUpdateSchema.parse(mergeReceiptPatch(inputOf(current), changes));
      if (current.counterpartyId !== null && data.counterpartyId === null) throw new Error("Không được bỏ trống đầu mối của dòng đã gắn đầu mối");
      if (refChanged(current.counterpartyId, data.counterpartyId)) await assertCounterpartyInProject(tx, scopeId, data.counterpartyId);
      return tx.projectActualReceipt.update({ where: { id: rowId, projectId: scopeId }, data: receiptFields(data), include: WITH_COUNTERPARTY });
    });
    revalidateEntryBook(scopeId, "thuc-te-nhap");
    return { row: toRow(row, await hasAlias(scopeId, row.itemKey)) };
  });
}

export async function softDeleteReceipt(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const existing = await prisma.projectActualReceipt.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(rowGone("Dòng thực tế nhập"));
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectActualReceipt.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null }, select: { id: true } });
      if (!current) throw new Error(rowGone("Dòng thực tế nhập"));
      await tx.projectActualReceipt.update({ where: { id: rowId, projectId: scopeId }, data: { deletedAt: new Date() } });
    });
    revalidateEntryBook(scopeId, "thuc-te-nhap");
    return {};
  });
}
