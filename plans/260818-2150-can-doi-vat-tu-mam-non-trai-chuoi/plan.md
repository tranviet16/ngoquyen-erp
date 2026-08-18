---
title: "Cân đối vật tư — import + 3-way comparison (Mầm Non Trại Chuối GĐ1)"
description: "Import bảng cân đối vật tư into du-an estimates/transactions and add invoice-vs-estimate-vs-actual tracking tab"
status: completed
priority: P2
effort: 16h
branch: main
tags: [du-an, import, vat-tu]
created: 2026-08-18
---

## Status: completed (2026-08-18)

Design approved 2026-08-18 (see `plans/reports/brainstorm-260818-can-doi-vat-tu-mam-non-trai-chuoi.md`).
All 5 phases implemented 2026-08-18; gates green (tsc, eslint, vitest 718/718, next build).
Code review: DONE_WITH_CONCERNS 7/10 — both actionable findings fixed and gates re-run green:
(1) `setInvoiceOverride` now authenticates before the ownership lookup (closes the estimateId↔projectId enumeration oracle);
(2) `OverrideCell` has a commit guard against the Enter→blur double-submit, with reset on reopen/error.
Deferred (documented, accepted): adapter is single-project (`MNTC-GD1` hardcoded) — GĐ2/other công trình needs a small mapping change; client override input strips both `.` and `,` (whole-VND entry only).

Implementation notes vs plan:
- CSV has **3** HM blocks (Cấp thoát nước was the 3rd), all parsed; subtotal gate green on all.
- Sheet HM1-NC reports invoice subtotal (416,607,407) with no detail rows → adapter emits one flagged "Nhân công (tổng hợp)" aggregate transaction.
- Adapter as-of-date option dropped (import engine has no options channel); date = import date, per-row date edits via existing admin patch. Documented in convention doc.
- Import executed on dev DB: ImportRun #2, project `MNTC-GD1` (id 4), 460 rows, totals verified by SQL.

## Phases

| # | Phase | Est. | Status |
|---|---|---|---|
| 1 | [Schema + enum groundwork](phase-01-schema-enum.md) | 2h | ✅ done |
| 2 | [Import adapter `bang-can-doi-vat-tu`](phase-02-adapter.md) | 6h | ✅ done (16 tests on real CSV) |
| 3 | [Execute import (dry-run → real)](phase-03-execute-import.md) | 1h | ✅ done (dev DB, run #2) |
| 4 | [Tab `/du-an/[id]/can-doi-vat-tu`](phase-04-can-doi-tab.md) | 5h | ✅ done |
| 5 | [Dashboard ΣHd + docs/convention](phase-05-dashboard-docs.md) | 2h | ✅ done |

## Acceptance criteria

- HM1 subtotals reconcile: dự toán 7,511,996,392 / hóa đơn 4,303,557,521 within ±0.5%; HM2 subtotals within ±0.5%.
- Project "Mầm Non Trại Chuối GĐ1" exists with `ProjectCategory` per HM×section (HM1-VL, HM1-NC, HM1-MAY, HM1-CPC, HM2-VL, …).
- `ProjectTransaction.amountTt = 0` on every imported invoice row; `amountHd` = sheet TT; `invoiceNo` = sheet Số HĐ verbatim.
- Tab `/du-an/[id]/can-doi-vat-tu` shows 3 columns Dự toán / HĐ đã lấy / Thực tế + Chênh + Còn-phải-lấy-HĐ (derived, override-editable per row); invoice-only rows (no estimate) render inline; category subtotals per HM×section.
- Dashboard shows ΣamountHd beside ΣamountTt (not silently mixed).
- Adapter passes unit test on real CSV; project-changelog entry added.
- Rollback: `rollbackImportRun(runId)` removes all rows tagged by the run.

## Cross-phase invariants

- One row = one event; `amountTt=0` on import; users edit same row when actuals known (no parallel row, no HĐ→TT copy).
- Sheet's `Còn phải nhập` column is NOT imported — always derived.
- `ProjectTransaction` remains the truth for project cost; `vat-tu-ncc` ledger remains the truth for supplier debt; never sum across.
- Adapter accepts an as-of-date option; default = import date. Each imported row's `note` starts with "Nhập từ bảng cân đối vật tư".

## Unresolved questions

None. All 4 design decisions locked in brainstorm (chi_phi_chung enum, Còn-phải-lấy-HĐ derived+override, import date default+overridable, full reusable adapter scope). Override column placement decided in Phase 1 (see phase-01).
