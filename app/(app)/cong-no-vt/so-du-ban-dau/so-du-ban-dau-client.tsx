"use client";

// Phase 5 shim: re-export shared OpeningBalanceClient pre-bound for material ledger.
// The server page (so-du-ban-dau/page.tsx) passes onSet/onDelete as server actions.
export { OpeningBalanceClient } from "@/components/ledger/opening-balance-client";
