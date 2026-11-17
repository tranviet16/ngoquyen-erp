"use server";

/**
 * Đầu mối của "Đối chiếu DT-HĐ-TT" (dòng Phần II DT-TT: tên, loại, thứ tự, nguồn thực tế, số chốt
 * tay, mục chi) và NCC pháp nhân gộp vào đầu mối (dòng HĐ-TT với các ô nhập tay H, S, X, Z). Quyền
 * theo công trình: xem `read`, thêm `create`, sửa / xóa `edit`; H / S / X / Z chỉ sửa được (cần
 * `edit`), không nhập lúc thêm. Mỗi NCC chỉ một dòng / công trình (partial unique). Mỗi lần ghi khóa
 * công trình; id đầu mối / NCC được tra lại. Action ghi trả `ActionResult`.
 */

import type { ProjectCounterparty, ProjectCounterpartySupplier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { rowGone, runEntryAction, type ActionResult } from "./entry-action-result";
import { decOrNull, entryIdSchema, type PAYMENT_SECTIONS } from "./entry-schemas";
import {
  assertActiveSupplier, assertCounterpartyInProject, assertProjectActive, refChanged, revalidateMappingChange, withUniqueMessage,
} from "./entry-write-guards";
import { lockProjectDtHdTt } from "./project-lock";
import {
  assertPatchKeys, counterpartyCreateSchema, counterpartyFieldsSchema, counterpartySupplierCreateSchema, counterpartySupplierFieldsSchema, mergePatch,
  type CounterpartyCreateInput, type CounterpartyFields, type CounterpartyPatch, type CounterpartySupplierCreateInput,
  type CounterpartySupplierFields, type CounterpartySupplierPatch,
} from "./register-schemas";
import type { ActualBasis, CounterpartyKind } from "./report-inputs";

export interface CounterpartyRow {
  id: number;
  name: string;
  kind: CounterpartyKind;
  sortGroup: string | null;
  sortOrder: number;
  actualBasis: ActualBasis;
  actualManualVnd: number | null;
  paymentSection: (typeof PAYMENT_SECTIONS)[number] | null;
  note: string | null;
}

export interface CounterpartySupplierRow {
  id: number;
  counterpartyId: number | null;
  supplierId: number;
  /** Tên NCC (cả NCC đã ngừng dùng). */
  supplierName: string;
  splitActualVnd: number | null;
  paidOverrideVnd: number | null;
  recoveredVnd: number | null;
  todoNote: string | null;
  note: string | null;
}

const LOG_TAG = "du-an.dt-hd-tt.counterparty";
const COUNTERPARTY_GONE = rowGone("Đầu mối");
const LINK_GONE = rowGone("Dòng NCC");
const duplicateName = (name: string) => `Đầu mối "${name}" đã có trong công trình`;
const DUPLICATE_SUPPLIER = "NCC này đã có dòng trong công trình — mỗi NCC chỉ thuộc một đầu mối";
const WITH_SUPPLIER = { supplier: { select: { name: true } } } as const;

function toRow(c: ProjectCounterparty): CounterpartyRow {
  return {
    id: c.id, name: c.name, kind: c.kind as CounterpartyKind, sortGroup: c.sortGroup, sortOrder: c.sortOrder,
    actualBasis: c.actualBasis as ActualBasis, actualManualVnd: decOrNull(c.actualManualVnd),
    paymentSection: c.paymentSection as CounterpartyRow["paymentSection"], note: c.note,
  };
}

function toLinkRow(l: ProjectCounterpartySupplier & { supplier: { name: string } }): CounterpartySupplierRow {
  return {
    id: l.id, counterpartyId: l.counterpartyId, supplierId: l.supplierId, supplierName: l.supplier.name,
    splitActualVnd: decOrNull(l.splitActualVnd), paidOverrideVnd: decOrNull(l.paidOverrideVnd), recoveredVnd: decOrNull(l.recoveredVnd),
    todoNote: l.todoNote, note: l.note,
  };
}

async function assertNameFree(tx: Pick<typeof prisma, "projectCounterparty">, projectId: number, name: string, exceptId: number | null): Promise<void> {
  const dup = await tx.projectCounterparty.findFirst({
    where: { projectId, name, deletedAt: null, ...(exceptId === null ? {} : { id: { not: exceptId } }) },
    select: { id: true },
  });
  if (dup) throw new Error(duplicateName(name));
}

export async function listCounterparties(projectId: number): Promise<{ counterparties: CounterpartyRow[]; links: CounterpartySupplierRow[] }> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const live = { projectId, deletedAt: null };
  const [counterparties, links] = await Promise.all([
    prisma.projectCounterparty.findMany({ where: live, orderBy: [{ sortGroup: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.projectCounterpartySupplier.findMany({ where: live, include: WITH_SUPPLIER, orderBy: { id: "asc" } }),
  ]);
  return { counterparties: counterparties.map(toRow), links: links.map(toLinkRow) };
}

export async function createCounterparty(input: CounterpartyCreateInput): Promise<ActionResult<{ row: CounterpartyRow }>> {
  return runEntryAction(LOG_TAG, async () => {
    const { projectId, ...fields } = counterpartyCreateSchema.parse(input);
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId } });
    const row = await withUniqueMessage(
      () =>
        prisma.$transaction(async (tx) => {
          await lockProjectDtHdTt(tx, [projectId]);
          await assertProjectActive(tx, projectId);
          await assertNameFree(tx, projectId, fields.name, null);
          return tx.projectCounterparty.create({ data: { projectId, ...fields } });
        }),
      duplicateName(fields.name),
    );
    revalidateMappingChange(projectId);
    return { row: toRow(row) };
  });
}

/** Sửa đầu mối (gồm nguồn thực tế, số chốt tay): chỉ các trường trong bản vá, trộn dưới khóa. */
export async function updateCounterparty(id: number, projectId: number, patch: CounterpartyPatch): Promise<ActionResult<{ row: CounterpartyRow }>> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    assertPatchKeys(patch, Object.keys(counterpartyFieldsSchema.shape));
    const existing = await prisma.projectCounterparty.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(COUNTERPARTY_GONE);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    let name = "";
    const row = await withUniqueMessage(
      () =>
        prisma.$transaction(async (tx) => {
          await lockProjectDtHdTt(tx, [scopeId]);
          const current = await tx.projectCounterparty.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null } });
          if (!current) throw new Error(COUNTERPARTY_GONE);
          const stored: CounterpartyFields = {
            name: current.name, kind: current.kind as CounterpartyKind, sortGroup: current.sortGroup, sortOrder: current.sortOrder,
            actualBasis: current.actualBasis as ActualBasis, actualManualVnd: decOrNull(current.actualManualVnd),
            paymentSection: current.paymentSection as CounterpartyRow["paymentSection"], note: current.note,
          };
          const fields = counterpartyFieldsSchema.parse(mergePatch(stored, patch));
          name = fields.name;
          if (fields.name !== current.name) await assertNameFree(tx, scopeId, fields.name, rowId);
          return tx.projectCounterparty.update({ where: { id: rowId, projectId: scopeId }, data: fields });
        }),
      () => duplicateName(name),
    );
    revalidateMappingChange(scopeId);
    return { row: toRow(row) };
  });
}

/** Xóa mềm; từ chối khi đầu mối còn được dùng (thực tế nhập, chi, mã nhóm, NCC). */
export async function softDeleteCounterparty(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const existing = await prisma.projectCounterparty.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(COUNTERPARTY_GONE);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectCounterparty.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null }, select: { name: true } });
      if (!current) throw new Error(COUNTERPARTY_GONE);
      const used = { projectId: scopeId, counterpartyId: rowId, deletedAt: null };
      const [receipts, payments, groups, links] = await Promise.all([
        tx.projectActualReceipt.count({ where: used }),
        tx.projectCashPayment.count({ where: used }),
        tx.projectGroupCode.count({ where: used }),
        tx.projectCounterpartySupplier.count({ where: used }),
      ]);
      const uses = [[receipts, "dòng thực tế nhập"], [payments, "khoản chi"], [groups, "mã nhóm"], [links, "NCC"]] as const;
      const inUse = uses.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
      if (inUse.length > 0) throw new Error(`Đầu mối "${current.name}" đang được dùng (${inUse.join(", ")}) — gỡ trước khi xóa`);
      await tx.projectCounterparty.update({ where: { id: rowId, projectId: scopeId }, data: { deletedAt: new Date() } });
    });
    revalidateMappingChange(scopeId);
    return {};
  });
}

/** Thêm NCC vào đầu mối (hoặc NCC không thuộc đầu mối nào): mỗi NCC một dòng / công trình. */
export async function createCounterpartySupplier(input: CounterpartySupplierCreateInput): Promise<ActionResult<{ row: CounterpartySupplierRow }>> {
  return runEntryAction(LOG_TAG, async () => {
    const data = counterpartySupplierCreateSchema.parse(input);
    const { projectId } = data;
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId } });
    const row = await withUniqueMessage(
      () =>
        prisma.$transaction(async (tx) => {
          await lockProjectDtHdTt(tx, [projectId]);
          await assertProjectActive(tx, projectId);
          await assertCounterpartyInProject(tx, projectId, data.counterpartyId);
          await assertActiveSupplier(tx, data.supplierId);
          const dup = await tx.projectCounterpartySupplier.findFirst({
            where: { projectId, supplierId: data.supplierId, deletedAt: null },
            select: { supplier: { select: { name: true } }, counterparty: { select: { name: true } } },
          });
          if (dup) {
            const owner = dup.counterparty ? `đầu mối "${dup.counterparty.name}"` : "dòng không thuộc đầu mối nào";
            throw new Error(`NCC "${dup.supplier.name}" đã thuộc ${owner} — mỗi NCC chỉ một dòng trong công trình`);
          }
          return tx.projectCounterpartySupplier.create({
            data: { projectId, counterpartyId: data.counterpartyId, supplierId: data.supplierId, note: data.note },
            include: WITH_SUPPLIER,
          });
        }),
      DUPLICATE_SUPPLIER,
    );
    revalidateMappingChange(projectId);
    return { row: toLinkRow(row) };
  });
}

/** Sửa dòng NCC: đầu mối và các ô nhập tay H / S / X / Z (cần `edit`); bản vá trộn dưới khóa. */
export async function updateCounterpartySupplier(id: number, projectId: number, patch: CounterpartySupplierPatch): Promise<ActionResult<{ row: CounterpartySupplierRow }>> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    assertPatchKeys(patch, Object.keys(counterpartySupplierFieldsSchema.shape));
    const existing = await prisma.projectCounterpartySupplier.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(LINK_GONE);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    const row = await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectCounterpartySupplier.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null } });
      if (!current) throw new Error(LINK_GONE);
      const stored: CounterpartySupplierFields = {
        counterpartyId: current.counterpartyId, splitActualVnd: decOrNull(current.splitActualVnd), paidOverrideVnd: decOrNull(current.paidOverrideVnd),
        recoveredVnd: decOrNull(current.recoveredVnd), todoNote: current.todoNote, note: current.note,
      };
      const fields = counterpartySupplierFieldsSchema.parse(mergePatch(stored, patch));
      if (refChanged(current.counterpartyId, fields.counterpartyId)) await assertCounterpartyInProject(tx, scopeId, fields.counterpartyId);
      return tx.projectCounterpartySupplier.update({ where: { id: rowId, projectId: scopeId }, data: fields, include: WITH_SUPPLIER });
    });
    revalidateMappingChange(scopeId);
    return { row: toLinkRow(row) };
  });
}

export async function softDeleteCounterpartySupplier(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const existing = await prisma.projectCounterpartySupplier.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(LINK_GONE);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectCounterpartySupplier.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null }, select: { id: true } });
      if (!current) throw new Error(LINK_GONE);
      await tx.projectCounterpartySupplier.update({ where: { id: rowId, projectId: scopeId }, data: { deletedAt: new Date() } });
    });
    revalidateMappingChange(scopeId);
    return {};
  });
}
