---
phase: 1
title: "Coverage manifest blocker"
status: completed
priority: P1
effort: 6h
dependencies: []
---

# Phase 1: Coverage manifest blocker

## Context Links

- [Parent plan](./plan.md)
- [Brainstorm](./reports/brainstorm-summary.md)
- [Inventory seed](./research/table-inventory.md)
- [Kongming audit](./research/kongming-design-audit.md)

## Overview

Ngày: 2026-08-20. Trạng thái: pending. Tạo manifest thực thi theo từng table occurrence và truy vết nguồn dữ liệu trước khi sửa behavior. Đây là blocker bắt buộc.

## Key Insights

- Seed inventory ghi nhận 8 DataTable, 25 DataGrid render và 44 raw HTML tables, nhưng count phải chạy lại trên live tree.
- Một file có thể chứa nhiều bảng với strategy khác nhau.
- Không có pagination prop trong DataGrid không chứng minh loader trả toàn bộ dataset.
- Các mục `NV` trong inventory không được suy đoán.

## Requirements

- Mỗi occurrence: route, component, family, loader/service, full-list hay paginated, default-order owner, columns, display accessor, grouping, exclusions, test owner.
- Server table: xác minh query parser, allowlist, `orderBy`, `skip/take`, `count`, relation/schema thật và tie-breaker.
- Client table: xác minh rows có phải toàn bộ set và thứ tự nguồn bất biến.
- Không thay đổi behavior trong phase này.

## Architecture

Manifest là contract coverage của toàn plan. Mỗi dòng nhận một strategy: `server`, `client-flat`, `datagrid`, `grouped-tree`, `matrix`, hoặc `non-data-exclusion`. `unknown` làm phase fail.

## Related Code Files

- Create: `plans/260820-2159-bidirectional-sort-all-tables/reports/table-coverage-manifest.md`
- Inspect: `app/**/*.tsx`, `components/**/*.tsx`, page loaders và service tương ứng
- Inspect: `components/data-table/**`, `components/data-grid/**`, `lib/table/**`
- Modify/Delete: none in source

## Implementation Steps

1. Re-run `rg` counts cho `<DataTable`, `<DataGrid`, `<table` và primitive `<Table>` callers.
2. Tách từng occurrence, kể cả ba bảng trong `can-doi-vat-tu-client.tsx` và các file admin/kiểm-tra-khớp có nhiều bảng.
3. Trace 7 enhanced DataTable pages, legacy project categories, `ExpenseFilterClient`, coordination-form list và mọi mục `NV`.
4. Đối chiếu `prisma/schema.prisma` trước mọi relation/FK sort claim.
5. Ghi default row-ID order fixture và display-value source cho từng bảng.
6. Gán phase triển khai và test đại diện cho từng occurrence.

## Todo List

- [x] Counts live được ghi bằng lệnh tái lập được
- [x] 100% occurrence có strategy
- [x] 100% paginated source có loader/query path
- [x] 100% computed/select/FK column có display sort source hoặc blocker
- [x] Không còn `NV`/`unknown`

## Success Criteria

- [x] Manifest reconcile với live grep, không double-count generic type/dynamic import
- [ ] Mọi server sort claim có schema/query evidence
- [ ] Mọi exclusion nêu rõ vì sao không phải data column
- [ ] Phase 2–8 có danh sách occurrence cụ thể từ manifest

## Risk Assessment

Rủi ro bỏ sót table qua wrapper hoặc nested render. Giảm thiểu bằng grep nhiều pattern và đối chiếu route tree. Không biến signed snapshot/chứng từ thành sortable nếu thứ tự là một phần nội dung pháp lý; ghi decision gate thay vì tự sửa.

## Security Considerations

Chỉ đọc code; không query production DB, không log dữ liệu người dùng. Server loader trace phải giữ nguyên ACL và tenant/resource scope hiện hữu.

## Next Steps

Chỉ mở Phase 2 khi manifest không còn unknown và reviewer spot-check tối thiểu 15 dòng.
