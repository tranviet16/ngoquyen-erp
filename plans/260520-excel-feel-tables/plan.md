---
title: Excel-feel cho tất cả bảng
description: ''
status: completed
priority: P2
created: 2026-05-20T00:00:00.000Z
---

# Excel-feel cho tất cả bảng

## Overview

Nâng cấp 2 hệ thống bảng (DataTable cho master-data server-paginated, DataGrid cho ledger Excel-like) với sort/filter mọi cột và inline-edit. Approach Hybrid Evolution — không thay thư viện, mở rộng cả hai song song qua infrastructure chung `lib/table/query-params.ts`.

Context: [reports/brainstorm-summary.md](./reports/brainstorm-summary.md).

**Key decisions:**
- Master-data: sort/filter URL-driven, server-side, pagination respects.
- Ledger: sort/filter in-memory (rows đã load).
- Inline-edit opt-in cho field safe (text/bool/number/enum); FK/date/audit dùng form.
- Persisted view URL-only (không DB preset). Bulk edit OUT scope.
- Filter Decimal/date là range (≥/≤). Default sort per-page metadata.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Query-params helper](./phase-01-query-params-helper.md) | Completed |
| 2 | [DataTable v2 (sort/filter/inline)](./phase-02-datatable-v2-sort-filter-inline.md) | Completed |
| 3 | [Wire master-data pages](./phase-03-wire-master-data-pages.md) | Completed |
| 4 | [Patch actions per resource](./phase-04-patch-actions-per-resource.md) | Completed |
| 5 | [DataGrid sort/filter](./phase-05-datagrid-sort-filter.md) | Completed |

## Dependencies

<!-- Cross-plan dependencies -->
