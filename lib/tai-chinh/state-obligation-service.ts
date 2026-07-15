"use server";

/**
 * Server actions for the State Obligations module.
 * List functions skip auth (the /tai-chinh layout already guards the module).
 * Mutations enforce `requireRoleModuleAccess(role, "tai-chinh", ...)`.
 * Txn writes delegate JournalEntry sync to `state-obligation-internal.ts`.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import {
  getRole,
  revalidateObligation,
  createTxnWithSync,
  updateTxnWithSync,
  deleteTxnWithSync,
  type ObligationKind,
  type ObligationCategory,
  type ObligationTxnFields,
  type ObligationTx,
} from "./state-obligation-internal";

// ─── Coercion helpers ─────────────────────────────────────────────────────────

const has = (row: Record<string, unknown>, k: string) => k in row;

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function dec(v: unknown): Prisma.Decimal {
  if (v == null || v === "") return new Prisma.Decimal(0);
  try {
    return new Prisma.Decimal(String(v).replace(/[,\s]/g, ""));
  } catch {
    return new Prisma.Decimal(0);
  }
}

function optId(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function normCategory(v: unknown): ObligationCategory {
  const s = String(v ?? "");
  return s === "thue" || s === "bao_hiem" ? s : "khac";
}

// ─── StateObligationType CRUD ─────────────────────────────────────────────────

export async function listObligationTypes() {
  return prisma.stateObligationType.findMany({
    where: { deletedAt: null },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

type TypeRow = Prisma.StateObligationTypeGetPayload<object>;

function typeData(row: Record<string, unknown>, current: TypeRow | null) {
  return {
    name: has(row, "name") ? String(row.name ?? "") : (current?.name ?? ""),
    code: has(row, "code") ? str(row.code) : (current?.code ?? null),
    category: has(row, "category") ? normCategory(row.category) : (current?.category ?? "khac"),
    openingBalance: has(row, "openingBalance")
      ? dec(row.openingBalance)
      : (current?.openingBalance ?? new Prisma.Decimal(0)),
    openingDate: has(row, "openingDate")
      ? new Date(String(row.openingDate))
      : (current?.openingDate ?? new Date()),
    sortOrder: has(row, "sortOrder") ? num(row.sortOrder) : (current?.sortOrder ?? 0),
  };
}

/** Upsert types inside ONE transaction — a failing row rolls the whole batch back. */
export async function bulkUpsertObligationTypes(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  const role = await getRole();
  await requireRoleModuleAccess(role, "tai-chinh", "edit");
  if (!rows.length) return [];
  const out = await prisma.$transaction(async (tx) => {
    const results: TypeRow[] = [];
    for (const row of rows) {
      const { id, ...rest } = row;
      if (id != null && id > 0) {
        const current = await tx.stateObligationType.findUnique({ where: { id } });
        if (!current || current.deletedAt) throw new Error(`Danh mục #${id} không tồn tại`);
        results.push(await tx.stateObligationType.update({ where: { id }, data: typeData(rest, current) }));
      } else {
        results.push(await tx.stateObligationType.create({ data: typeData(rest, null) }));
      }
    }
    return results;
  });
  revalidateObligation();
  return out;
}

export async function softDeleteObligationTypes(ids: number[]) {
  const role = await getRole();
  await requireRoleModuleAccess(role, "tai-chinh", "admin");
  if (!ids.length) return;
  // Deleting a type would silently drop its txns from the report (which joins
  // on a non-deleted type), so refuse while live txns still reference it.
  const inUse = await prisma.stateObligationTxn.findFirst({
    where: { typeId: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  if (inUse) {
    throw new Error(
      "Không thể xóa danh mục đang có phát sinh — hãy xóa các dòng nghĩa vụ liên quan trước.",
    );
  }
  const deletedAt = new Date();
  await prisma.$transaction(
    ids.map((id) => prisma.stateObligationType.update({ where: { id }, data: { deletedAt } })),
  );
  revalidateObligation();
}

// ─── StateObligationTxn CRUD ──────────────────────────────────────────────────

export async function listObligationTxns() {
  return prisma.stateObligationTxn.findMany({
    where: { deletedAt: null },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: {
      type: { select: { id: true, name: true } },
      cashAccount: { select: { id: true, name: true } },
    },
  });
}

type TxnRow = Prisma.StateObligationTxnGetPayload<object>;

function txnFields(row: Record<string, unknown>, current: TxnRow | null): ObligationTxnFields {
  const kindRaw = has(row, "kind") ? String(row.kind) : (current?.kind ?? "phai_tra");
  const kind: ObligationKind = kindRaw === "da_nop" ? "da_nop" : "phai_tra";
  return {
    typeId: has(row, "typeId") ? num(row.typeId) : (current?.typeId ?? 0),
    date: has(row, "date") ? new Date(String(row.date)) : (current?.date ?? new Date()),
    kind,
    amount: has(row, "amount") ? dec(row.amount) : (current?.amount ?? new Prisma.Decimal(0)),
    cashAccountId: has(row, "cashAccountId")
      ? optId(row.cashAccountId)
      : (current?.cashAccountId ?? null),
    refNo: has(row, "refNo") ? str(row.refNo) : (current?.refNo ?? null),
    description: has(row, "description") ? str(row.description) : (current?.description ?? null),
    note: has(row, "note") ? str(row.note) : (current?.note ?? null),
  };
}

async function typeNameOf(tx: ObligationTx, typeId: number): Promise<string> {
  const t = await tx.stateObligationType.findUnique({
    where: { id: typeId },
    select: { name: true },
  });
  return t?.name ?? "";
}

/** Upsert txns inside ONE transaction — a failing row rolls the whole batch back. */
export async function bulkUpsertObligationTxns(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  const role = await getRole();
  await requireRoleModuleAccess(role, "tai-chinh", "edit");
  if (!rows.length) return [];
  const out = await prisma.$transaction(async (tx) => {
    const results: TxnRow[] = [];
    for (const row of rows) {
      const { id, ...rest } = row;
      if (id != null && id > 0) {
        const current = await tx.stateObligationTxn.findUnique({ where: { id } });
        if (!current || current.deletedAt) throw new Error(`Dòng nghĩa vụ #${id} không tồn tại`);
        const f = txnFields(rest, current);
        results.push(
          await updateTxnWithSync(tx, id, current.journalEntryId, f, await typeNameOf(tx, f.typeId)),
        );
      } else {
        const f = txnFields(rest, null);
        results.push(await createTxnWithSync(tx, f, await typeNameOf(tx, f.typeId)));
      }
    }
    return results;
  });
  revalidateObligation();
  return out;
}

export async function softDeleteObligationTxns(ids: number[]) {
  const role = await getRole();
  await requireRoleModuleAccess(role, "tai-chinh", "edit");
  if (!ids.length) return;
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      const txn = await tx.stateObligationTxn.findUnique({
        where: { id },
        select: { journalEntryId: true },
      });
      if (!txn) continue;
      await deleteTxnWithSync(tx, id, txn.journalEntryId);
    }
  });
  revalidateObligation();
}
