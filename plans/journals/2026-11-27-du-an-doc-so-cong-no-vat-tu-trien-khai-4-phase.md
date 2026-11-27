---
title: "Du an doc so cong no vat tu: trien khai 4 phase"
date: 2026-11-27
summary: "Cong No NCC and Giao Dich now read the material ledger; tests, dev tie-out 11/11 and review done, UI check and commit pending"
---

# Du an doc so cong no vat tu: trien khai 4 phase

## What happened

Implemented all four phases of `plans/261126-1426-du-an-doc-so-cong-no-vat-tu` on branch `feat/du-an-doc-so-cong-no-vt` (uncommitted). The Dự án tabs Công Nợ NCC and Giao Dịch now read the material debt ledger directly instead of `project_transactions`:
- `lib/du-an/project-ledger/`: raw per-project queries, a pure `buildSupplierBalances` (one row per supplier, all Chủ thể, `sumReportRows` over `queryDetailReport` rows, pending-slip-only suppliers kept), a loader with the Hợp đồng-tab access rule, and a pure `?nguon=` resolver.
- Công Nợ NCC rewritten on top of it; the old `supplier-debt-service.ts` (summed `project_transactions` by party name) is gone.
- Giao Dịch has a source switch; a ledger read error falls back to Sổ dự án with CRUD intact.
- Empty-state notes on Cân Đối VT, Định Mức and the Dashboard; book-note text, two user guides and the changelog corrected.

Verification: tsc, lint, unit 1835, full integration 202 on a throwaway Postgres at 127.0.0.1:5435, `next build`. A new read-only script `scripts/verify-project-ledger-tie-out.ts` on the dev copy (5434) showed 11/11 projects tying out to the cumulative report to the dong; #1 has 490 rows plus 1 opening, #14 has 109, and #4 has 280 project transactions. These match the plan.

## Decision

- Query the report unfiltered and filter suppliers in memory, so the filter list has every supplier of the project and only one report query runs. Totals still cover only the shown suppliers.
- The refresh helper was not added. Every project page renders dynamically, and there is no `staleTimes` or `use cache`. The plan only asked for the helper if stale numbers showed up. This was not checked in a browser.
- An independent review found no blocking issue. Five nits were fixed: a 404 for non-integer ids, the switch count taken from the loaded rows, accurate Dashboard wording, no "Mở sổ NCC" link for soft-deleted suppliers, and the empty table linking to Sổ dự án. `cong-no` was also dropped from the invoice-book revalidation list. A pending-slip read failure is still allowed to fail the tab, like the Hợp đồng tab, so the figures never look complete when they are not.

## Friction

- The privacy hook blocks `.env.test` and the dev env file. Integration ran against a self-started 5435 container with its own generated URL. Each dev read needed a fresh user approval, and the hook only registers an approval after it has blocked a call.
- `lib/env.ts` requires the `BETTER_AUTH_*` variables even for read-only scripts, so they were given throwaway values for that process.
- A heredoc containing Python triple-quoted strings broke the Bash tool. Larger edits went through scratchpad scripts instead.

## Next steps

- The owner should check the UI on dev: #1, #4 and #14 on both tabs; a non-admin without `cong-no-vt`; error isolation; page refresh after each ledger write path.
- Check the default `cong-no-vt` role permissions, and count production projects whose supplier debt lives only in `project_transactions`, before releasing `du-an` and `cong-no-vt` together.
- Commit, PR and deploy are not done yet.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
