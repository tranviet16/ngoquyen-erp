---
title: "Excel-like Input Tables with Glide Data Grid"
description: "Replace HTML/AG-Grid input tables with Glide Data Grid wrapper for Excel-like UX (paste range, fill handle, keyboard nav) without changing server-action + Prisma DB layer"
status: pending
priority: P2
created: 2026-05-07
---

# Excel-like Input Tables with Glide Data Grid

## Overview

Toàn bộ bảng *nhập liệu* migrate sang Glide Data Grid (canvas, MIT) để có UX gần Excel: paste range, fill handle, keyboard nav, virtualized. Bảng *báo cáo rollup* giữ HTML table hiện tại. DB layer (server action + Prisma + soft delete) **không đổi**, chỉ thêm helper `bulkUpsert` cho paste range.

Dựa trên brainstorm: [brainstorm-summary.md](./brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Foundation](./phase-01-foundation.md) | Pending |
| 2 | [Migrate Cong No VT](./phase-02-migrate-cong-no-vt.md) | Pending |
| 3 | [Migrate Cong No NC](./phase-03-migrate-cong-no-nc.md) | Pending |
| 4 | [Migrate SL-DT Inputs](./phase-04-migrate-sl-dt-inputs.md) | Pending |
| 5 | [Migrate Tai Chinh Nhat Ky](./phase-05-migrate-tai-chinh-nhat-ky.md) | Pending |
| 6 | [Polish and Cleanup](./phase-06-polish-and-cleanup.md) | Pending |

## Dependencies

- Phase 1 blocks Phase 2-5 (foundation must exist first)
- Phase 2-5 can run in parallel (different modules, no file overlap)
- Phase 6 blocks on all of 2-5

## Key Decisions

- **Glide Data Grid** (`@glideapps/glide-data-grid`) — canvas, MIT, ~150KB, dynamic import per-page
- **Wrapper `<DataGrid>`** ở `components/data-grid/` dùng chung mọi bảng nhập liệu
- **Server action không đổi**, thêm `bulkUpsert` mới cho paste range
- **Bảng báo cáo rollup giữ nguyên** (sl-dt báo cáo, monthly-report, debt-matrix, cong-no summary)
- **Xóa `ag-grid-react` + `ag-grid-community`** sau khi migrate `nhat-ky`

## Out of Scope

- Bảng báo cáo rollup
- `chi-tieu-client` inline edit (giữ)
- Mobile/tablet UX
- Accessibility / screen reader
