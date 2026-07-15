# Phase 02 - Finance PR Sync Data Model

## Overview

Priority: high
Status: implemented

Add durable synced payable/receivable lines with manual override support.

## Requirements

- Preserve source amount separately from admin override.
- Idempotent sync by source module, source key, and period.
- Exclude supplier/party by module.
- Track stale lines instead of hard deleting.

## Proposed Tables

- `finance_pr_lines`
- `finance_sync_exclusions`
- `finance_sync_batches`

## Related Code Files

- `prisma/schema.prisma`
- new migration under `prisma/migrations/`
- `lib/tai-chinh/pr-sync-service.ts`
- tests under `lib/tai-chinh/__tests__/`

## Success Criteria

- Sync line upsert preserves manual override.
- Exclusion prevents new synced lines for matching party.
- Existing manual `payable_receivable_adjustments` remains supported during transition.

## Implementation Notes

- Added Prisma models and migration for sync batches, sync lines, and sync exclusions.
- Added `lib/tai-chinh/pr-sync-service.ts` for idempotent payable/receivable sync.
- Existing `getConsolidatedPR` now reads synced snapshots plus manual adjustments.
