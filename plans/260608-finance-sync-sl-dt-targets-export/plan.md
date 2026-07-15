# Finance Sync, SL-DT Targets, Export Polish

Date: 2026-06-08
Status: implemented

## Objective

Build a controlled sync path for `Tài chính NQ` payable/receivable data, add SL-DT auto target calculation with admin override, and improve report exports.

## Scope

- Sync `Phải trả` from `Công nợ vật tư` and `Công nợ nhân công`, with exclude by supplier/party.
- Sync `Phải thu` from SL-DT `Chỉ tiêu` revenue target.
- Preserve manual override after every sync.
- Add auto calculation for `Sản lượng chỉ tiêu` and `Doanh thu chỉ tiêu`.
- Improve Excel export formatting first; treat PDF as later print/render polish unless needed.

## Decisions

- Sync is on-demand via admin function button, not background real-time.
- Store source amount and manual override separately. Effective amount is `override ?? source`.
- Doanh thu is the driver for SL-DT target calculation.
- Near-production threshold: `min(100,000,000 VND, 25% of next milestone)`.
- Manual override always wins unless admin explicitly chooses overwrite.

## Phases

1. [Phase 01 - SL-DT Auto Target Calculator](phase-01-sl-dt-auto-target-calculator.md)
2. [Phase 02 - Finance PR Sync Data Model](phase-02-finance-pr-sync-data-model.md)
3. [Phase 03 - Finance PR Sync Buttons and UI](phase-03-finance-pr-sync-buttons-ui.md)
4. [Phase 04 - Export Polish](phase-04-export-polish.md)

## Current Progress

- Phase 01: implemented on 2026-06-08
- Phase 02: implemented on 2026-06-08
- Phase 03: implemented on 2026-06-08
- Phase 04: implemented on 2026-06-08

## Dependencies

- Existing `sl_dt_lots`, `sl_dt_monthly_inputs`, `sl_dt_payment_plans`, `sl_dt_progress_statuses`.
- Existing ledger aggregation services under `lib/ledger`.
- Existing finance manual adjustment screen under `/tai-chinh/phai-thu-tra`.
- Existing xlsx export route under `/api/export/excel`.

## Validation

- Unit tests for pure SL-DT calculator.
- Integration/unit tests for sync idempotency and override preservation.
- Existing `npm run lint`, `npm run build`, `npm run test`.

## Unresolved Questions

- Should PR sync lines group receivable by lot, project, or owner-facing party? Default plan: by lot with project/lot snapshot, aggregate in UI.
- Should stale synced PR lines be hidden automatically or displayed as stale? Default plan: display stale until admin archives.
