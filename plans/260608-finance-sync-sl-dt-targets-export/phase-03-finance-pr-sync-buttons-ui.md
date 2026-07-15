# Phase 03 - Finance PR Sync Buttons and UI

## Overview

Priority: high
Status: implemented

Expose admin function buttons in `/tai-chinh/phai-thu-tra`.

## Requirements

- Buttons:
  - `Đồng bộ phải trả`
  - `Đồng bộ phải thu từ SL-DT`
  - `Quản lý loại trừ`
- Allow exclude by NCC/chủ thể before sync.
- Show source/effective/override/stale state.
- Manual override remains editable after sync.

## Related Code Files

- `app/(app)/tai-chinh/phai-thu-tra/page.tsx`
- `components/tai-chinh/pr-client.tsx`
- new server actions under `app/(app)/tai-chinh/phai-thu-tra/actions.ts`
- `lib/tai-chinh/pr-sync-service.ts`

## Success Criteria

- Admin can sync both payable and receivable.
- Admin can override a synced amount and next sync keeps override.
- Excluded party does not appear in new sync output.

## Implementation Notes

- Added server actions under `/tai-chinh/phai-thu-tra/actions.ts`.
- Updated the page to pass period-aware rows to `PrClient`.
- Updated UI with period controls, payable/receivable sync buttons, source/effective/override columns, and per-row exclusion.

## Fix Note - 2026-06-10 Latest Source Period

- Payable sync now resolves the latest data period per ledger source instead of trusting the UI period.
- Receivable sync now resolves the latest SL-DT month with positive `dtKeHoachKy`.
- Stale synced rows are excluded from consolidated totals, so old snapshots do not double count after a newer sync.
- Added undo buttons for the latest payable and receivable sync batches.
