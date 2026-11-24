"use server";

/**
 * Sổ Chi thực tế của "Đối chiếu DT-HĐ-TT" (sổ chi của đội: chuyển khoản + tiền mặt, mục I–IV, đầu
 * mối và / hoặc NCC pháp nhân). Quyền theo công trình: xem `read`, thêm `create`, sửa / xóa `edit`.
 * Đầu mối phải thuộc đúng công trình, NCC phải còn hoạt động. Không ghi vào sổ cái công ty.
 *
 * Action ghi TRẢ `ActionResult` (không ném). Sửa nhận bản sửa một phần, gộp vào dòng đọc lại dưới khóa.
 */

import type { ProjectCashPayment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { rowGone, runEntryAction, type ActionResult } from "./entry-action-result";
import {
  dayFromIso, entryIdSchema, isoDay, mergePaymentPatch, PAYMENT_PATCH_KEYS, paymentSchema, readPatch,
  type PaymentInput, type PaymentPatch,
} from "./entry-schemas";
import { assertActiveSupplier, assertCounterpartyInProject, assertProjectActive, refChanged, revalidateEntryBook } from "./entry-write-guards";
import { lockProjectDtHdTt } from "./project-lock";

export interface PaymentRow {
  id: number;
  date: string | null;
  dateText: string | null;
  content: string;
  bankVnd: number;
  cashVnd: number;
  section: string;
  counterpartyId: number | null;
  counterpartyName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  note: string | null;
}

export type PaymentResult = ActionResult<{ row: PaymentRow }>;

const LOG_TAG = "du-an.dt-hd-tt.chi-thuc-te";
const WITH_NAMES = { counterparty: { select: { name: true } }, supplier: { select: { name: true } } } as const;
type PaymentRecord = ProjectCashPayment & { counterparty: { name: string } | null; supplier: { name: string } | null };

function toRow(p: PaymentRecord): PaymentRow {
  return {
    id: p.id, date: isoDay(p.date), dateText: p.dateText, content: p.content, bankVnd: p.bankVnd.toNumber(), cashVnd: p.cashVnd.toNumber(),
    section: p.section, counterpartyId: p.counterpartyId, counterpartyName: p.counterparty?.name ?? null,
    supplierId: p.supplierId, supplierName: p.supplier?.name ?? null, note: p.note,
  };
}

/** Dòng đang lưu → input đầy đủ, nền để gộp bản sửa một phần (mục ngoài I–IV của file cũ phải chọn lại). */
function inputOf(p: ProjectCashPayment): PaymentInput {
  return {
    projectId: p.projectId, date: isoDay(p.date), content: p.content, bankVnd: p.bankVnd.toNumber(), cashVnd: p.cashVnd.toNumber(),
    section: p.section as PaymentInput["section"], counterpartyId: p.counterpartyId, supplierId: p.supplierId, note: p.note,
  };
}

function paymentFields(data: ReturnType<typeof paymentSchema.parse>) {
  return {
    date: dayFromIso(data.date),
    ...(data.date ? { dateText: null } : {}),
    content: data.content, bankVnd: data.bankVnd, cashVnd: data.cashVnd, section: data.section,
    counterpartyId: data.counterpartyId, supplierId: data.supplierId, note: data.note,
  };
}

export async function listPayments(projectId: number): Promise<PaymentRow[]> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const rows = await prisma.projectCashPayment.findMany({ where: { projectId, deletedAt: null }, include: WITH_NAMES, orderBy: [{ date: "asc" }, { id: "asc" }] });
  return rows.map(toRow);
}

export async function createPayment(input: PaymentInput): Promise<PaymentResult> {
  return runEntryAction(LOG_TAG, async () => {
    const data = paymentSchema.parse(input);
    const { projectId } = data;
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId } });
    const row = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [projectId]);
      await assertProjectActive(tx, projectId);
      await assertCounterpartyInProject(tx, projectId, data.counterpartyId);
      await assertActiveSupplier(tx, data.supplierId);
      return tx.projectCashPayment.create({ data: { projectId, ...paymentFields(data) }, include: WITH_NAMES });
    });
    revalidateEntryBook(projectId, "chi-thuc-te");
    return { row: toRow(row) };
  });
}

/** Sửa một khoản chi: `patch` chỉ gồm các ô đổi (gửi đủ mọi cột cũng được). */
export async function updatePayment(id: number, projectId: number, patch: PaymentPatch): Promise<PaymentResult> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const changes = readPatch(patch, PAYMENT_PATCH_KEYS);
    const existing = await prisma.projectCashPayment.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(rowGone("Khoản chi"));
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    const row = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectCashPayment.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null } });
      if (!current) throw new Error(rowGone("Khoản chi"));
      const data = paymentSchema.parse(mergePaymentPatch(inputOf(current), changes));
      if (refChanged(current.counterpartyId, data.counterpartyId)) await assertCounterpartyInProject(tx, scopeId, data.counterpartyId);
      if (refChanged(current.supplierId, data.supplierId)) await assertActiveSupplier(tx, data.supplierId);
      return tx.projectCashPayment.update({ where: { id: rowId, projectId: scopeId }, data: paymentFields(data), include: WITH_NAMES });
    });
    revalidateEntryBook(scopeId, "chi-thuc-te");
    return { row: toRow(row) };
  });
}

export async function softDeletePayment(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const existing = await prisma.projectCashPayment.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(rowGone("Khoản chi"));
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectCashPayment.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null }, select: { id: true } });
      if (!current) throw new Error(rowGone("Khoản chi"));
      await tx.projectCashPayment.update({ where: { id: rowId, projectId: scopeId }, data: { deletedAt: new Date() } });
    });
    revalidateEntryBook(scopeId, "chi-thuc-te");
    return {};
  });
}
