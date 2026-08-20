---
title: "Sort ba trạng thái cho tất cả bảng"
description: "Chuẩn hóa default→asc→desc→default theo giá trị hiển thị cho DataTable, DataGrid và bảng HTML mà không phá phân trang, group hay subtotal."
status: completed
priority: P1
effort: 76h
branch: main
tags: [frontend, tables, sorting, accessibility, tdd]
blockedBy: []
blocks: []
created: 2026-08-20
source: skill
---

# Sort ba trạng thái cho tất cả bảng

## Overview

Áp dụng sort một cột theo chu kỳ `mặc định → tăng → giảm → mặc định` cho toàn bộ bảng nghiệp vụ. Dùng shared state/semantics nhưng giữ adapter riêng cho server pagination, client full-list, grouped/tree và matrix. Sort theo giá trị ngữ nghĩa đang hiển thị; không sort riêng page hiện tại.

Thiết kế đã duyệt: [brainstorm-summary.md](./reports/brainstorm-summary.md). Kiểm kê live là gate Phase 1, không dùng số liệu cũ làm danh sách triển khai bất biến.

## Phases

| Phase | Name | Effort | Depends | Status |
|---|---|---:|---|---|
| 1 | [Coverage manifest blocker](./phase-01-coverage-manifest-blocker.md) | 6h | — | Complete |
| 2 | [Shared contract + characterization TDD](./phase-02-shared-contract-v-characterization-tdd.md) | 8h | 1 | Complete |
| 3 | [DataTable server + legacy](./phase-03-datatable-server-v-legacy.md) | 10h | 2 | Complete |
| 4 | [DataGrid](./phase-04-datagrid.md) | 12h | 2 | Complete |
| 5 | [Raw flat tables](./phase-05-raw-flat-tables.md) | 10h | 2, 3 | Complete |
| 6 | [Grouped + tree tables](./phase-06-grouped-v-tree-tables.md) | 12h | 2, 5 | Complete |
| 7 | [Matrix + nested tables](./phase-07-matrix-v-nested-tables.md) | 10h | 2, 4, 6 | Complete |
| 8 | [Coverage audit, a11y + docs](./phase-08-final-coverage-a11y-v-docs.md) | 8h | 3–7 | Complete |

## Dependencies

- Context only: completed plans `260520-excel-feel-tables` and `260520-full-column-sort-filter`.
- No cross-plan blocker detected. Preserve unrelated dirty worktree changes.
- Phase 1 and Phase 2 are blocker gates; no family migration starts before both pass.

## Acceptance Criteria

- 100% table occurrences classified and verified; exclusions limited to non-data headers/cells.
- Every sortable data column follows the approved three-state cycle and display semantics.
- Server-paginated tables sort the complete result set with stable tie-breaker and page reset.
- Group/subtotal/footer/matrix structure remains invariant.
- Direct tests plus `pnpm test`, `pnpm test:integration`, selected `pnpm test:e2e`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` pass with required test services documented.
- No load, stress, benchmark, schema migration, or universal table rewrite unless Phase 1 produces a separately approved blocker decision.

## Handoff

Triển khai hoàn tất ngày 2026-08-20. Xem [final-test-report.md](./reports/final-test-report.md) và [code-review.md](./reports/code-review.md). Không có migration hoặc thay đổi schema.
