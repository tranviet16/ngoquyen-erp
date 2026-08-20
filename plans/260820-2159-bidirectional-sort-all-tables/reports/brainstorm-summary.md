---
title: "Brainstorm: sort ba trạng thái trên tất cả bảng"
status: approved
created: 2026-08-20
---

# Brainstorm: sort trên tất cả bảng

## Tóm tắt

Chuẩn hóa sort một cột theo chu kỳ `mặc định → tăng → giảm → mặc định` trên toàn bộ bảng nghiệp vụ. Sort theo giá trị ngữ nghĩa đang hiển thị: text tiếng Việt, số theo numeric, ngày theo thời điểm, select/status theo label. Giữ renderer hiện có; dùng lõi state/semantics chung và adapter riêng cho server, client, grouped/tree và matrix.

## Quyết định đã duyệt

- Phạm vi: tất cả `DataTable`, `DataGrid` và bảng HTML nghiệp vụ.
- Một cột active; click cột khác bắt đầu `asc`.
- Trạng thái mặc định phục hồi đúng thứ tự nguồn/nghiệp vụ, không đồng nghĩa bỏ `ORDER BY`.
- Null/rỗng luôn cuối ở cả asc và desc.
- Grouped/tree: giữ thứ tự group, chỉ sort leaf trong từng group.
- Subtotal/tổng/footer giữ nguyên vị trí.
- Matrix: chỉ leaf metric header sortable; click sort rows, không reorder dynamic column groups.
- Không sort STT, checkbox, action, group header và phần tử không có miền thứ tự dữ liệu.
- Server pagination phải sort toàn result set và có tie-breaker ổn định.
- Select/status/FK/computed server-side chỉ bật khi có mapping/query sort theo display thật; không fallback raw ID/code.

## Bằng chứng codebase

- Next.js `16.2.10`, React `19.2.4`, TypeScript, Prisma/PostgreSQL, Glide Data Grid.
- 8 `DataTable`: 7 enhanced server/URL, 1 legacy full-list.
- 25 instance `DataGrid` nghiệp vụ.
- 44 bảng HTML nghiệp vụ trong 37 file.
- `DataTable` và `DataGrid` đã có cycle ba trạng thái nhưng duplicate logic.
- DataTable có lệch contract: `deriveResourceSpec` default-on theo `kind`, UI chỉ hiện sort khi `col.sortable` truthy.
- DataTable clear sort fallback về `defaultSort`; hiện indicator không phản ánh effective default.
- DataGrid null-last hiện bị đảo thành null-first ở desc do nhân direction factor sau comparator.
- Plan cũ từng giả định Prisma relation không tồn tại; mọi server sort key phải kiểm chứng schema/query live.

## Phương án đã đánh giá

### A. Vá từng bảng

Nhanh cục bộ, nhưng duplicate state/comparator/a11y, khó kiểm soát current-page-only sort. Không chọn.

### B. Chuyển mọi bảng về một renderer

Nhất quán lý thuyết, nhưng phá editable grid, tree, subtotal, sticky header, matrix. Quá phạm vi. Không chọn.

### C. Shared sort core + family adapters — chọn

- Pure state machine + semantic comparator/accessor contract.
- Header button dùng chung cho HTML/DataTable; Glide dùng state machine chung vì canvas header.
- DataTable: URL/server adapter.
- DataGrid/full-list: immutable client adapter.
- Grouped/tree: leaf-within-group adapter.
- Matrix: row-by-leaf-metric adapter.

## Yêu cầu triển khai

1. Coverage manifest theo từng table occurrence, không chỉ từng file.
2. Characterization tests là blocker trước migration.
3. Mọi server-paginated table phải trace loader/query/count transaction.
4. Default state phải round-trip đúng URL/source order.
5. Không sort formatted string cho number/date/currency.
6. Edit/delete/paste/selection giữ row identity sau sort.
7. Header có keyboard support, icon và `aria-sort` đúng.

## Rủi ro và giảm thiểu

- Display label khác raw DB: resource-specific mapping/query; parameterized SQL nếu Prisma không biểu diễn được.
- Client rows có thể bị server-limit: manifest phải xác minh trước khi chọn local sort.
- Computed column không có server expression: bổ sung query đúng hoặc giữ non-sortable và ghi blocker; không sort page slice.
- Group/matrix dễ phá cấu trúc: invariant tests cho group count, subtotal, collapse, dynamic headers.
- Phạm vi lớn: triển khai theo family với gate độc lập và fresh audit cuối.

## Tiêu chí thành công

- 100% table occurrences có phân loại, strategy và kết quả PASS hoặc documented non-data exclusion.
- Mọi data column trong scope chạy đúng ba trạng thái theo display semantics.
- Không có current-page-only sort trên bảng phân trang.
- Default phục hồi đúng row order; server pagination ổn định với giá trị trùng.
- Unit, integration, Playwright smoke, typecheck, lint và production build xanh.

## Nguồn

- [Kiểm kê bảng](../research/table-inventory.md)
- [Kongming red-team](../research/kongming-design-audit.md)
- [Plan sort/filter cũ](../../260520-full-column-sort-filter/plan.md)
- [Journal schema reality check](../../../docs/journals/260520-full-column-sort-filter.md)

## Câu hỏi chưa giải quyết

- Không còn quyết định nghiệp vụ mở. Các loader/service đánh dấu `NV` phải được xác minh ở Phase 0 trước khi sửa.
