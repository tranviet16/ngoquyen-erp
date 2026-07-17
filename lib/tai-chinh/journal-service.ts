"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { Prisma } from "@prisma/client";
import {
  normalizeJournalText,
  resolveJournalCategoryId,
  suggestJournalLabel,
  type JournalCategoryLike,
} from "@/lib/tai-chinh/journal-auto-label";

export type CostBehavior = "fixed" | "variable" | "transfer";

export interface JournalEntryInput {
  date: string;
  entryType: "thu" | "chi" | "chuyen_khoan";
  costBehavior?: CostBehavior;
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
  costBehavior?: CostBehavior;
  expenseCategoryId?: number;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface JournalAggregate {
  totalAmountVnd: Prisma.Decimal;
  rowCount: number;
  avgAmountVnd: Prisma.Decimal;
}

export async function listJournalEntries(filter: JournalFilter = {}) {
  await requireReleasedModuleRequest("tai-chinh");
  const { dateFrom, dateTo, entryType, costBehavior, expenseCategoryId, q, page = 1, pageSize = 50 } = filter;
  const where: Prisma.JournalEntryWhereInput = {
    deletedAt: null,
    ...(entryType ? { entryType } : {}),
    ...(costBehavior ? { costBehavior } : {}),
    ...(expenseCategoryId ? { expenseCategoryId } : {}),
    ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
    ...(dateFrom || dateTo ? {
      date: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    } : {}),
  };

  const [items, total, agg] = await Promise.all([
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
    prisma.journalEntry.aggregate({
      where,
      _sum: { amountVnd: true },
      _avg: { amountVnd: true },
    }),
  ]);

  const aggregate: JournalAggregate = {
    totalAmountVnd: agg._sum.amountVnd ?? new Prisma.Decimal(0),
    rowCount: total,
    avgAmountVnd: agg._avg.amountVnd ?? new Prisma.Decimal(0),
  };

  return { items, total, page, pageSize, aggregate };
}

export async function createJournalEntry(input: JournalEntryInput) {
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();

  const fromAccountId = input.fromAccountId ?? null;
  const toAccountId = input.toAccountId ?? null;
  const fromAccount = fromAccountId != null
    ? await resolveAccountName(fromAccountId)
    : (input.fromAccount ?? null);
  const toAccount = toAccountId != null
    ? await resolveAccountName(toAccountId)
    : (input.toAccount ?? null);

  const costBehavior: CostBehavior = input.entryType === "chuyen_khoan"
    ? "transfer"
    : (input.costBehavior === "fixed" ? "fixed" : "variable");

  const record = await prisma.journalEntry.create({
    data: {
      date: new Date(input.date),
      entryType: input.entryType,
      costBehavior,
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
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();

  const fromAccountId = input.fromAccountId ?? null;
  const toAccountId = input.toAccountId ?? null;
  const fromAccount = fromAccountId != null
    ? await resolveAccountName(fromAccountId)
    : (input.fromAccount ?? null);
  const toAccount = toAccountId != null
    ? await resolveAccountName(toAccountId)
    : (input.toAccount ?? null);

  const costBehavior: CostBehavior = input.entryType === "chuyen_khoan"
    ? "transfer"
    : (input.costBehavior === "fixed" ? "fixed" : "variable");

  const record = await prisma.journalEntry.update({
    where: { id },
    data: {
      date: new Date(input.date),
      entryType: input.entryType,
      costBehavior,
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
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();
  const current = await prisma.journalEntry.findUnique({
    where: { id },
    select: { refModule: true },
  });
  if (current?.refModule === "state_obligation") {
    throw new Error(
      "Bút toán này tự sinh từ module Nghĩa vụ Nhà nước — hãy xóa tại Sổ theo dõi nghĩa vụ.",
    );
  }
  await prisma.journalEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tai-chinh/nhat-ky");
  revalidatePath("/tai-chinh");
}

export async function softDeleteJournalEntries(ids: number[]) {
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();
  if (!ids.length) return;
  const guarded = await prisma.journalEntry.findFirst({
    where: { id: { in: ids }, refModule: "state_obligation" },
    select: { id: true },
  });
  if (guarded) {
    throw new Error(
      "Có bút toán tự sinh từ module Nghĩa vụ Nhà nước trong vùng chọn — hãy xóa tại Sổ theo dõi nghĩa vụ.",
    );
  }
  const deletedAt = new Date();
  await prisma.$transaction(
    ids.map((id) =>
      prisma.journalEntry.update({ where: { id }, data: { deletedAt } }),
    ),
  );
  revalidatePath("/tai-chinh/nhat-ky");
  revalidatePath("/tai-chinh");
}

export async function patchJournalEntry(id: number, patch: Record<string, unknown>) {
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();
  const current = await prisma.journalEntry.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new Error(`Bút toán #${id} không tồn tại`);
  if (current.refModule === "state_obligation") {
    throw new Error(
      "Bút toán này tự sinh từ module Nghĩa vụ Nhà nước — hãy chỉnh sửa tại Sổ theo dõi nghĩa vụ.",
    );
  }

  const merged: JournalEntryInput = {
    date: (patch.date as string | undefined) ?? current.date.toISOString(),
    entryType: (patch.entryType as JournalEntryInput["entryType"]) ?? (current.entryType as JournalEntryInput["entryType"]),
    costBehavior: "costBehavior" in patch
      ? (patch.costBehavior as CostBehavior)
      : (current.costBehavior as CostBehavior),
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
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();
  const out: unknown[] = [];
  for (const row of rows) {
    const { id, ...rest } = row;
    if (id != null && id > 0) {
      out.push(await patchJournalEntry(id, rest));
    } else {
      const input: JournalEntryInput = {
        date: (rest.date as string | undefined) ?? new Date().toISOString().slice(0, 10),
        entryType: (rest.entryType as JournalEntryInput["entryType"]) ?? "chi",
        costBehavior: (rest.costBehavior as CostBehavior | undefined) ?? "variable",
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

export async function autoLabelJournalEntries(ids: number[]) {
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();

  const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) {
    return { total: 0, updated: 0, skipped: 0, missingCategories: [] as string[], createdCategories: [] as string[] };
  }

  const [entries, categories] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: {
        id: true,
        description: true,
        entryType: true,
        costBehavior: true,
        fromAccountId: true,
        toAccountId: true,
        refModule: true,
      },
    }),
    prisma.expenseCategory.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const missingCategories = new Set<string>();
  const createdCategories = new Set<string>();
  const categoryList: JournalCategoryLike[] = [...categories];
  const updates: Array<ReturnType<typeof prisma.journalEntry.update>> = [];
  let skipped = uniqueIds.length - entries.length;

  async function getOrCreateAutoCategory(categoryName: string | null) {
    if (!categoryName) return null;

    const existingId = resolveJournalCategoryId(categoryName, categoryList);
    if (existingId != null) return existingId;

    const code = buildExpenseCategoryCode(categoryName);
    const created = await prisma.expenseCategory.create({
      data: { code, name: categoryName, level: 0 },
      select: { id: true, name: true },
    });
    categoryList.push(created);
    createdCategories.add(created.name);
    return created.id;
  }

  for (const entry of entries) {
    if (entry.refModule === "state_obligation") {
      skipped += 1;
      continue;
    }

    const suggestion = suggestJournalLabel(entry);
    if (!suggestion) {
      skipped += 1;
      continue;
    }

    let expenseCategoryId: number | null = null;
    try {
      expenseCategoryId = await getOrCreateAutoCategory(suggestion.categoryName);
    } catch {
      if (suggestion.categoryName) missingCategories.add(suggestion.categoryName);
      skipped += 1;
      continue;
    }

    updates.push(prisma.journalEntry.update({
      where: { id: entry.id },
      data: {
        entryType: suggestion.entryType,
        costBehavior: suggestion.costBehavior,
        expenseCategoryId,
      },
    }));
  }

  if (updates.length) await prisma.$transaction(updates);
  revalidatePath("/tai-chinh/nhat-ky");
  revalidatePath("/tai-chinh");

  return {
    total: uniqueIds.length,
    updated: updates.length,
    skipped,
    missingCategories: [...missingCategories],
    createdCategories: [...createdCategories],
  };
}

function buildExpenseCategoryCode(name: string) {
  const base = normalizeJournalText(name)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return (base || "AUTO_CATEGORY").slice(0, 30);
}
