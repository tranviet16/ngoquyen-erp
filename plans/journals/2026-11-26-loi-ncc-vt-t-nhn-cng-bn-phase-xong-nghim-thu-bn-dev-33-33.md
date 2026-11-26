---
title: "Loại NCC vật tư / nhân công: bốn phase xong, nghiệm thu bản dev 33/33"
date: 2026-11-26
summary: "Supplier kind shipped on a branch; cascade needed opening balances, review closed an approved-round dead end, .env.test points at production"
---

# Loại NCC vật tư / nhân công: bốn phase xong, nghiệm thu bản dev 33/33

## What happened

Implemented all four phases of `plans/261126-0736-loai-ncc-vat-tu-nhan-cong` on branch `feat/loai-ncc-vat-tu-nhan-cong` (uncommitted).

- Suppliers got `kind` (`vat_tu` | `nhan_cong`, default `vat_tu`, CHECK constraint), editable by admins in the form and the inline grid. Migration `20261126090000_supplier_kind` only adds the column.
- The four material-debt reports and three Excel exports take `loai`. `queryDetailReport` gained `partyIds`, where an empty array means "no party". `getMaterialDebtMatrix` and the window report guard the old "empty array = everything" trap.
- Payment lines of category `nhan_cong` now use the material ledger: auto-fill (previously read the labour ledger with a supplier id), required project, posting on round close. Supplier suggestions are filtered by kind.

Surprises:
- On the dev copy, NCC #67 and #68 have only opening balances and no transactions. The cascade-suppliers route listed suppliers from transactions only, so the two labour suppliers in question could never be suggested. The route now unions `ledger_opening_balances`.
- `.env.test` points `DATABASE_URL` at port 5433, which is the production Postgres on VIETPC since the cutover. Integration tests ran against a throwaway container on 5435 with `DATABASE_URL` passed in the environment instead.
- The independent review found that a round could reach `approved` with an earlier-approved `nhan_cong` line that has no project. Such a round can then never be closed or edited. It also found that switching an edited line's category kept a supplier of the wrong kind.
- The first dev acceptance run reported 2 mismatches on the Excel tổng hợp file. The cause was JS float summation order: the difference was 2e-7 to 1e-6 đ, not a real gap.

## Decision

- Both moves to `approved` (auto-approve after a line decision, bulk approve) now check every line that will post to the material ledger. A missing project keeps the round in `submitted`, where the line can still be rejected.
- The edit row clears the supplier when the category changes supplier kind, unless the admin bypass is on.
- The acceptance Excel comparison uses a < 0.01 đ tolerance and prints the size of the difference.
- The `vat-tu-ncc-pilot` integration expectation changed from 2 to 3 posted payments, following the user's validated decision that labour lines post on close.

## Verification

- tsc is clean.
- ESLint is clean outside `.claude/**`. Plain `npm run lint` scans leftover worktrees under `.claude/worktrees`.
- Unit: 1814 passed. Integration: 194 passed.
- Dev acceptance: 33/33. The "Tất cả" totals are unchanged and vat_tu + nhan_cong = all on 4 sources and 3 Excel files. Signed-period hashes #696–#699 are unchanged, no new ledger rows were written, and there are 3 audit rows. Auto-fill equals the opening balance, and close posts exactly one `thanh_toan`, idempotently.
- The dev DB was restored to the post-migration backup afterwards.

## Next steps

- UI click-through on the dev copy needs an admin to sign in.
- Before deploying to production, run read-only counts of `nhan_cong` lines without a project in open rounds, and ask whether labour payments were entered by hand in the material ledger, since they could now be deducted twice.
- Decide whether to fix `.env.test`.
- Commit and open a PR when authorized.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
