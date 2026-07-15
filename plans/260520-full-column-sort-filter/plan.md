---
title: Sort/filter mọi cột mọi bảng
description: >-
  Refactor sang single source of truth + default-on convention. Mở rộng coverage
  sort/filter cho mọi data column (15 sort + 10 filter + 4 FK sort theo tên
  join).
status: completed
priority: P1
created: 2026-05-20T00:00:00.000Z
---

# Sort/filter mọi cột mọi bảng

## Overview

Builds on plan `260520-excel-feel-tables` (committed `ec809ae`). Audit cho thấy 15 cột chưa sortable, 10 cột chưa filterable, 4 FK chưa sort theo tên join. Nguyên nhân: ColumnDef + ResourceSpec là 2 nơi phải đồng bộ → nhiều cột "quên enable".

Giải pháp: refactor sang single source of truth — auto-derive ResourceSpec từ ColumnDef. Convention: column có `kind` → mặc định sortable+filterable. Extend ColumnDef với `fk: { relation, sortField, options }`. Extend buildPrismaArgs cho nested orderBy `{entity:{name:"asc"}}` từ URL `?sort=entity.name:asc`.

Brainstorm: `reports/brainstorm-summary.md`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Types + derive helper](./phase-01-types-derive-helper.md) | Completed |
| 2 | [Migrate master-data specs](./phase-02-migrate-master-data-specs.md) | Completed |
| 3 | [Migrate ledger grids](./phase-03-migrate-ledger-grids.md) | Completed |
| 4 | [Manual test](./phase-04-manual-test.md) | Completed |
| 5 | [Cleanup](./phase-05-cleanup.md) | Completed |

## Dependencies

- Depends on: `260520-excel-feel-tables` (completed) — DataTable/DataGrid infrastructure đã có.
- Out of scope: thêm cột mới (createdAt, contractValue), bulk edit, persisted view DB, server-side ledger filter.
