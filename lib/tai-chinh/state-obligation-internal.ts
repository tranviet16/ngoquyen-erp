/**
 * Internal helpers for the State Obligations module — NOT a server-action file.
 * Source of truth = StateObligationTxn; JournalEntry rows for `da_nop` are derived.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export type ObligationKind = "phai_tra" | "da_nop";
export type ObligationCategory = "thue" | "bao_hiem" | "khac";

/** Interactive-transaction client type (matches the audit-extended prisma client). */
export type ObligationTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Normalized txn shape used by the sync helpers. */
export interface ObligationTxnFields {
  typeId: number;
  date: Date;
  kind: ObligationKind;
  amount: Prisma.Decimal;
  cashAccountId: number | null;
  refNo: string | null;
  description: string | null;
  note: string | null;
}

export async function getRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

const OBLIGATION_PATHS = [
  "/tai-chinh/nghia-vu-nha-nuoc/danh-muc",
  "/tai-chinh/nghia-vu-nha-nuoc/so-theo-doi",
  "/tai-chinh/nghia-vu-nha-nuoc/bao-cao",
  "/tai-chinh",
];

export function revalidateObligation(): void {
  for (const p of OBLIGATION_PATHS) revalidatePath(p);
}

// ─── JournalEntry sync ────────────────────────────────────────────────────────

async function accountName(tx: ObligationTx, id: number | null): Promise<string | null> {
  if (id == null) return null;
  const a = await tx.cashAccount.findUnique({ where: { id }, select: { name: true } });
  return a?.name ?? null;
}

/** Build "chi" JournalEntry payload for a `da_nop` txn. refId set by caller. */
function jeData(f: ObligationTxnFields, typeName: string, accName: string | null) {
  return {
    date: f.date,
    entryType: "chi",
    costBehavior: "variable",
    amountVnd: f.amount,
    fromAccountId: f.cashAccountId,
    fromAccount: accName,
    refModule: "state_obligation",
    description: `Nộp ${typeName}${f.refNo ? ` — ${f.refNo}` : ""}`,
    note: f.note,
  };
}

/** StateObligationTxn data payload (without journalEntryId). */
function txnData(f: ObligationTxnFields) {
  return {
    typeId: f.typeId,
    date: f.date,
    kind: f.kind,
    amount: f.amount,
    cashAccountId: f.kind === "da_nop" ? f.cashAccountId : null,
    refNo: f.refNo,
    description: f.description,
    note: f.note,
  };
}

/** Create a txn; for `da_nop` also create + link a "chi" JournalEntry. Runs inside `tx`. */
export async function createTxnWithSync(
  tx: ObligationTx,
  f: ObligationTxnFields,
  typeName: string,
) {
  if (f.kind !== "da_nop") {
    return tx.stateObligationTxn.create({ data: txnData(f) });
  }
  const je = await tx.journalEntry.create({
    data: jeData(f, typeName, await accountName(tx, f.cashAccountId)),
  });
  const txn = await tx.stateObligationTxn.create({
    data: { ...txnData(f), journalEntryId: je.id },
  });
  await tx.journalEntry.update({ where: { id: je.id }, data: { refId: txn.id } });
  return txn;
}

/** Update a txn and sync its linked JournalEntry as `kind` changes. Runs inside `tx`. */
export async function updateTxnWithSync(
  tx: ObligationTx,
  id: number,
  currentJournalEntryId: number | null,
  f: ObligationTxnFields,
  typeName: string,
) {
  if (f.kind === "da_nop") {
    const data = jeData(f, typeName, await accountName(tx, f.cashAccountId));
    if (currentJournalEntryId != null) {
      await tx.journalEntry.update({ where: { id: currentJournalEntryId }, data: { ...data, refId: id } });
      return tx.stateObligationTxn.update({ where: { id }, data: txnData(f) });
    }
    const je = await tx.journalEntry.create({ data: { ...data, refId: id } });
    return tx.stateObligationTxn.update({
      where: { id },
      data: { ...txnData(f), journalEntryId: je.id },
    });
  }
  // new kind = phai_tra → drop any linked JournalEntry.
  // Clear refId too: the txn lives on, so a stale refId would leave two JEs
  // (this soft-deleted one + a future one) both claiming the same txn.
  if (currentJournalEntryId != null) {
    await tx.journalEntry.update({
      where: { id: currentJournalEntryId },
      data: { deletedAt: new Date(), refId: null },
    });
  }
  return tx.stateObligationTxn.update({
    where: { id },
    data: { ...txnData(f), journalEntryId: null },
  });
}

/** Soft-delete a txn and its linked JournalEntry. Runs inside `tx`. */
export async function deleteTxnWithSync(
  tx: ObligationTx,
  id: number,
  journalEntryId: number | null,
): Promise<void> {
  const now = new Date();
  if (journalEntryId != null) {
    await tx.journalEntry.update({
      where: { id: journalEntryId },
      data: { deletedAt: now, refId: null },
    });
  }
  await tx.stateObligationTxn.update({ where: { id }, data: { deletedAt: now } });
}
