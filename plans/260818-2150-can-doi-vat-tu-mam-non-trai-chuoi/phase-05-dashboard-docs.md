# Phase 5 — Dashboard ΣHd + docs / convention

## Context links

- Dashboard service: `lib/du-an/dashboard-service.ts` (currently sums `amountTt` only, `dashboard-service.ts:32-37`).
- Dashboard client: wherever `getProjectDashboard` is consumed (grep during Todo).
- Changelog: `docs/project-changelog.md`.
- Codebase summary: `docs/codebase-summary.md`.
- Convention target: new short doc `docs/du-an/can-doi-vat-tu-convention.md` (or append to an existing du-an doc if one exists).

## Overview

- Date: 2026-08-18
- Description: Extend `getProjectDashboard` to also sum `amountHd`; render both totals in the dashboard UI, clearly labelled. Write user-facing convention notes and update changelog.
- Priority: P2
- Implementation status: done (2026-08-18)
- Review status: pending

## Key Insights

- After Phase 3 import, `amountTt = 0` for every imported transaction. Existing dashboard `transactionTotal` (which sums only `amountTt`) will show ≈0 for the newly imported project — misleading. Must add `amountHdTotal` so users see invoice-collected amounts immediately.
- Do NOT silently switch dashboard to prefer `amountHd`; show both. Labels: "Thực tế (đã nhập)" for TT, "Hóa đơn đã lấy" for HD.
- Convention doc must state clearly (Vietnamese, user-facing):
  1. `amountTt=0` after import means "actual not yet entered", not "actually zero".
  2. When actuals become known, edit the same transaction row (do NOT create a parallel row and do NOT copy HĐ→TT).
  3. Re-import runbook: rollback previous ImportRun first (`/admin/import` → rollback), THEN re-import. Never re-import without rollback.
  4. `Còn phải lấy HĐ` is derived (Dự toán − HĐ đã lấy). Per-row manual override is available in the Cân đối tab for corrections the sheet used to carry.
  5. `ProjectTransaction` = truth for project cost. `vat-tu-ncc` ledger = truth for supplier debt. These are never summed across.
  6. Cross-phase invoice moves (e.g. "lấy hđơn từ gđ1 sang") will appear as mismatches in the tab and should be noted in the transaction `note`.

## Requirements

- `getProjectDashboard` returns both `transactionTotalTt` and `transactionTotalHd` (rename existing `transactionTotal` to `transactionTotalTt` for clarity; update every consumer).
- Dashboard client shows both metrics side by side with labels above.
- Convention doc created and linked from `docs/codebase-summary.md` (if that file already indexes du-an docs).
- `docs/project-changelog.md` entry added under today's date describing the import + tab addition.

## Architecture

- Additive change to dashboard service. One extra `prisma.projectTransaction.aggregate` call (or extend the existing one with a second `_sum` field — Prisma allows multiple `_sum` fields in one aggregate).
- Convention doc is markdown, no code coupling.

## Related code files

- Modify: `lib/du-an/dashboard-service.ts` (add `_sum: { amountTt: true, amountHd: true }`).
- Modify: dashboard client(s) consuming `transactionTotal` (grep for callers).
- Create: `docs/du-an/can-doi-vat-tu-convention.md` (or append to existing du-an doc).
- Modify: `docs/project-changelog.md` — add entry.
- Modify (maybe): `docs/codebase-summary.md` — link the new doc.

## Implementation Steps

1. `grep -rn "transactionTotal" app lib components` → enumerate all callers.
2. Change `getProjectDashboard` aggregate to `_sum: { amountTt: true, amountHd: true }`; return `transactionTotalTt` and `transactionTotalHd`.
3. Update every enumerated caller (rename + add HD line in UI).
4. Write convention doc (Vietnamese, ~1 page, the 6 points above).
5. Add changelog entry: date, one-line description, link to plan folder.
6. Typecheck + build.

## Todo list

- [ ] Grep every `transactionTotal` reference.
- [ ] Update dashboard service.
- [ ] Update every caller (list explicitly first).
- [ ] Write convention doc.
- [ ] Changelog entry.
- [ ] Typecheck.

## Success Criteria

- Dashboard for "Mầm Non Trại Chuối GĐ1" shows Hóa đơn đã lấy ≈ 4.3B and Thực tế (đã nhập) = 0 immediately after import — no zero-looking "spent" number.
- Convention doc committed and linked.
- Changelog updated.
- `pnpm typecheck` + `pnpm build` green.

## Risk Assessment

- **Silent breakage of dashboard consumers (Med × Med):** renaming `transactionTotal` to `transactionTotalTt` breaks any caller not updated. Mitigation: grep before rename; typecheck catches remaining.
- **Users misread ΣHd as "spent" (Low × Med):** labels + convention doc must be explicit.
- **Convention doc ignored (Med × Med):** doc alone won't prevent double-imports. Mitigation: `/admin/import` UI should prompt for rollback if a prior ImportRun for the same adapter+project exists — recommended as follow-up, not required here.

## Security Considerations

- No new endpoints. Dashboard already guarded by `requireReleasedModuleRequest("du-an")`.
- Convention doc contains no secrets.

## Next steps

None planned. Follow-ups (not in scope):

- `/admin/import` prompt for prior-run rollback.
- Slip → Tt sync (moving actuals from delivery slips into transactions automatically).
- GĐ2 import (should work with zero code changes if the export format is identical — validates the reusable-adapter decision).
