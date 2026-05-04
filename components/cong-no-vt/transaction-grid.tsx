"use client";

// Re-export shared ledger grid, pre-bound for material ledger (Phase 5 compatibility shim).
// Phase 5 pages import TransactionRow + LookupOption from here — they remain available.

export type { TransactionRow, LookupOption } from "@/components/ledger/transaction-grid";
export { TransactionGrid } from "@/components/ledger/transaction-grid";
