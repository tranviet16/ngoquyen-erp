"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

async function getRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export interface JournalEntryInput {
  date: string;
  entryType: "thu" | "chi" | "chuyen_khoan";
  amountVnd: string;
  fromAccount?: string | null;
  toAccount?: string | null;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  expenseCategoryId?: number | null;
  refModule?: string | null;
  refId?: number | null;
  description: string;
  attachmentUrl?: string | null;
  note?: string | null;
}

async function resolveAccountName(id: number | null | undefined): Promise<string | null> {
  if (id == null) return null;
  const acc = await prisma.cashAccount.findUnique({ where: { id }, select: { name: true } });
  return acc?.name ?? null;
}

export interface JournalFilter {
  dateFrom?: string;
  dateTo?: string;
  entryType?: string;
  page?: number;
  pageSize?: number;
}

export async function listJournalEntries(filter: JournalFilter = {}) {
  const { dateFrom, dateTo, entryType, page = 1, pageSize = 50 } = filter;
  const where: Prisma.JournalEntryWhereInput = {
    deletedAt: null,
    ...(entryType ? { entryType } : {}),
    ...(dateFrom || dateTo ? {
      date: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        expenseCategory: { select: { id: true, name: true, code: true } },
        fromAccountRef: { select: { id: true, name: true } },
        toAccountRef: { select: { id: true, name: true } },
      },
    }),
    prisma.journalEntry.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function createJournalEntry(input: JournalEntryInput) {
  const role = await getRole();
  requireRole(role, "ketoan");

  const fromAccountId = input.fromAccountId ?? null;
  const toAccountId = input.toAccountId ?? null;
  const fromAccount = fromAccountId != null
    ? await resolveAccountName(fromAccountId)
    : (input.fromAccount ?? null);
  const toAccount = toAccountId != null
    ? await resolveAccountName(toAccountId)
    : (input.toAccount ?? null);

  const record = await prisma.journalEntry.create({
    data: {
      date: new Date(input.date),
      entryType: input.entryType,
      amountVnd: new Prisma.Decimal(input.amountVnd),
      fromAccount,
      toAccount,
      fromAccountId,
      toAccountId,
      expenseCategoryId: input.expenseCategoryId ?? null,
      refModule: input.refModule ?? null,
      refId: input.refId ?? null,
      description: input.description,
      attachmentUrl: input.attachmentUrl ?? null,
      note: input.note ?? null,
    },
  });

  revalidatePath("/tai-chinh/nhat-ky");
  revalidatePath("/tai-chinh");
  return record;
}

export async function updateJournalEntry(id: number, input: JournalEntryInput) {
  const role = await getRole();
  requireRole(role, "ketoan");

  const fromAccountId = input.fromAccountId ?? null;
  const toAccountId = input.toAccountId ?? null;
  const fromAccount = fromAccountId != null
    ? await resolveAccountName(fromAccountId)
    : (input.fromAccount ?? null);
  const toAccount = toAccountId != null
    ? await resolveAccountName(toAccountId)
    : (input.toAccount ?? null);

  const record = await prisma.journalEntry.update({
    where: { id },
    data: {
      date: new Date(input.date),
      entryType: input.entryType,
      amountVnd: new Prisma.Decimal(input.amountVnd),
      fromAccount,
      toAccount,
      fromAccountId,
      toAccountId,
      expenseCategoryId: input.expenseCategoryId ?? null,
      refModule: input.refModule ?? null,
      refId: input.refId ?? null,
      description: input.description,
      attachmentUrl: input.attachmentUrl ?? null,
      note: input.note ?? null,
    },
  });

  revalidatePath("/tai-chinh/nhat-ky");
  revalidatePath("/tai-chinh");
  return record;
}

export async function softDeleteJournalEntry(id: number) {
  const role = await getRole();
  requireRole(role, "admin");
  await prisma.journalEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tai-chinh/nhat-ky");
  revalidatePath("/tai-chinh");
}

export async function softDeleteJournalEntries(ids: number[]) {
  const role = await getRole();
  requireRole(role, "admin");
  if (!ids.length) return;
  await prisma.journalEntry.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/tai-chinh/nhat-ky");
  revalidatePath("/tai-chinh");
}

export async function patchJournalEntry(id: number, patch: Record<string, unknown>) {
  const role = await getRole();
  requireRole(role, "ketoan");
  const current = await prisma.journalEntry.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new Error(`Bút toán #${id} không tồn tại`);

  const merged: JournalEntryInput = {
    date: (patch.date as string | undefined) ?? current.date.toISOString(),
    entryType: (patch.entryType as JournalEntryInput["entryType"]) ?? (current.entryType as JournalEntryInput["entryType"]),
    amountVnd: "amountVnd" in patch ? String(patch.amountVnd ?? "0") : current.amountVnd.toString(),
    fromAccount: "fromAccount" in patch ? (patch.fromAccount as string | null) : current.fromAccount,
    toAccount: "toAccount" in patch ? (patch.toAccount as string | null) : current.toAccount,
    fromAccountId: "fromAccountId" in patch
      ? (patch.fromAccountId == null || patch.fromAccountId === "" ? null : Number(patch.fromAccountId))
      : current.fromAccountId,
    toAccountId: "toAccountId" in patch
      ? (patch.toAccountId == null || patch.toAccountId === "" ? null : Number(patch.toAccountId))
      : current.toAccountId,
    expenseCategoryId: "expenseCategoryId" in patch
      ? (patch.expenseCategoryId == null || patch.expenseCategoryId === "" ? null : Number(patch.expenseCategoryId))
      : current.expenseCategoryId,
    refModule: current.refModule,
    refId: current.refId,
    description: "description" in patch ? String(patch.description ?? "") : current.description,
    attachmentUrl: current.attachmentUrl,
    note: "note" in patch ? (patch.note as string | null) : current.note,
  };
  return updateJournalEntry(id, merged);
}

export async function bulkUpsertJournalEntries(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  const role = await getRole();
  requireRole(role, "ketoan");
  const out: unknown[] = [];
  for (const row of rows) {
    const { id, ...rest } = row;
    if (id != null && id > 0) {
      out.push(await patchJournalEntry(id, rest));
    } else {
      const input: JournalEntryInput = {
        date: (rest.date as string | undefined) ?? new Date().toISOString().slice(0, 10),
        entryType: (rest.entryType as JournalEntryInput["entryType"]) ?? "chi",
        amountVnd: String(rest.amountVnd ?? "0"),
        fromAccount: (rest.fromAccount as string | null) ?? null,
        toAccount: (rest.toAccount as string | null) ?? null,
        fromAccountId: rest.fromAccountId == null || rest.fromAccountId === ""
          ? null : Number(rest.fromAccountId),
        toAccountId: rest.toAccountId == null || rest.toAccountId === ""
          ? null : Number(rest.toAccountId),
        expenseCategoryId: rest.expenseCategoryId == null || rest.expenseCategoryId === ""
          ? null : Number(rest.expenseCategoryId),
        description: String(rest.description ?? ""),
        note: (rest.note as string | null) ?? null,
      };
      out.push(await createJournalEntry(input));
    }
  }
  return out;
}
