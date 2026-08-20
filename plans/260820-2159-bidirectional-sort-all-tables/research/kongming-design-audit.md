# Red-team thiết kế: sort chu kỳ trên tất cả bảng

## Kết luận

Khả thi, nhưng không thể triển khai đúng bằng một `useSort()` áp lên mọi mảng. “Mặc định” có
ba nghĩa khác nhau: DataTable dùng `defaultSort` ở server, DataGrid giữ thứ tự `rows` đầu vào,
còn grouped/matrix giữ cấu trúc nghiệp vụ. Kiến trúc KISS là dùng chung state machine và UI
semantics, nhưng mỗi họ bảng có adapter sort riêng. Không được sort riêng page hiện tại.

Chu kỳ chuẩn: `default -> asc -> desc -> default`; click cột khác luôn vào `asc`. Chỉ một cột
active. `default` phải phục hồi đúng thứ tự nguồn, không đồng nghĩa “không có ORDER BY”.

“Theo giá trị hiển thị” nên được hiểu là theo giá trị ngữ nghĩa mà người dùng đọc: số theo số,
ngày theo thời điểm, select theo label; không sort chuỗi đã format (`1.000` trước `900`).

## Spot-check factual claims (20)

1. DataTable đã cycle `asc -> desc -> null` tại `components/data-table/sort-header.tsx:18-25`.
2. DataGrid cũng cycle `null -> asc -> desc -> null` tại `components/data-grid/use-grid-view.ts:25-33`.
3. DataTable clear sort ghi `sort: undefined` và reset page 1 tại
   `components/data-table/use-table-state.ts:36-39`.
4. `undefined` không bỏ sort server: `buildOrderBy` fallback `spec.defaultSort` tại
   `lib/table/query-params.ts:221-227`.
5. `buildOrderBy` hiện chỉ trả một order entry tại `lib/table/query-params.ts:241`; pagination
   chưa có tie-breaker chung.
6. Query string cố ý bỏ default sort tại `lib/table/query-params.ts:250-267`; URL rỗng là state
   default hợp lệ.
7. `deriveResourceSpec` coi cột có `kind` là sortable mặc định tại
   `lib/table/derive-spec.ts:4,109-116`.
8. UI DataTable lại chỉ render sort khi `col.sortable` truthy tại
   `components/data-table/table-shell.tsx:105`; convention default-on đang lệch giữa spec/UI.
9. DataGrid type vẫn là opt-in `sortable?: boolean` tại `components/data-grid/types.ts:34` và
   click header chặn cột không opt-in tại `components/data-grid/data-grid.tsx:148-153`.
10. DataGrid select đã resolve option label để sort tại
    `components/data-grid/apply-filter-sort.ts:37-48`.
11. DataGrid so số/numeric string trước, rồi `localeCompare(..., "vi")` cho text tại
    `components/data-grid/apply-filter-sort.ts:111-132`.
12. Comment “null sort last” không đúng khi desc: comparator trả null-last rồi nhân factor `-1`
    tại `components/data-grid/apply-filter-sort.ts:112-118,141-151`, làm null lên đầu.
13. Test cycle copy lại hàm private thay vì import implementation tại
    `lib/table/__tests__/sort-cycle.test.ts:17-25`; có nguy cơ test xanh khi UI lệch.
14. Inventory bằng `rg`: 8 `<DataTable>`, 25 `<DataGrid>`, 45 `<table>` occurrences.
15. 7/8 file DataTable truyền `resourceSpec`; project category detail là legacy full-list.
16. Chỉ 2/25 file dùng DataGrid có khai báo `sortable: true`: hai ledger-grid hiện tại.
17. Raw table phiếu phối hợp có pagination (`pageSize`, `totalPages`) tại
    `app/(app)/van-hanh/phieu-phoi-hop/list-client.tsx:40,72,186-202`; service dùng
    `skip/take` tại `lib/coordination-form/coordination-form-service.ts:99-101`.
18. Dự toán là tree thật: dựng `tree`, render `HmBlock`/`SectionBlock`, subtotal và `tfoot` tại
    `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx:174,347-372,415-493`.
19. Debt matrix có header 3 tầng, entity động, group `colSpan`, body và footer tổng tại
    `components/ledger/debt-matrix.tsx:77-178`; không phải flat column list.
20. Plan cũ từng giả định sai Prisma relations; report thực thi xác nhận ledger chỉ có bare IDs
    tại `plans/260520-full-column-sort-filter/reports/phase-03-report.md:19-31`.

## Phân loại và semantics đề xuất

| Họ bảng | Default | Asc/desc | Adapter đúng |
|---|---|---|---|
| Flat server/paginated | `spec.defaultSort` + tie-breaker | Toàn bộ result set | Query/DB |
| Flat client | thứ tự props ban đầu | toàn bộ mảng | local accessor |
| DataGrid | thứ tự `rows` đầu vào | `getCellSortValue` | `useGridView` |
| Grouped/tree | thứ tự group + leaf ban đầu | sort leaf trong từng group | group-aware |
| Matrix | thứ tự row hiện tại | sort row theo leaf metric | matrix row accessor |
| Action/STT/subtotal/group header | không áp dụng | không clickable | explicit opt-out |

Can-doi-vat-tu chứa cả nested detail table, worklist và grouped main table
(`can-doi-vat-tu-client.tsx:187-200,641-643,727-774`), nên phải ghi nhận từng table occurrence,
không phân loại theo file.

## Thiết kế KISS

- Một pure helper chung nhận `default|asc|desc` và trả state kế tiếp; test import helper thật.
- Một header-button chung cho HTML/DataTable với icon, keyboard, `aria-sort`; Glide chỉ dùng
  cùng state machine vì header là canvas.
- Mỗi cột có display sort accessor/strategy rõ ràng. Client: accessor trả semantic display value.
  Server: whitelist một DB/relation/expression đã xác minh; không suy ra relation từ tên field.
- DataTable truyền effective state cho header: URL không có sort vẫn hiển thị default column.
- Server order cần secondary stable key (thường `id`) để không trôi dòng giữa pages.
- Default của client phải derive lại từ immutable source order; không snapshot mảng đã sort/mutate.
- Grouped sort chỉ reorder leaf rows bên trong group; group/subtotal/footer giữ vị trí.
- Matrix: chỉ leaf metric headers sortable; click metric sort rows, không reorder entity columns.

## Phasing và gates

### Phase 0 — Coverage manifest (blocker)

- Liệt kê đủ 8 DataTable, 25 DataGrid, 45 raw occurrences; mỗi occurrence ghi họ bảng,
  full-data/paginated, default order owner, leaf columns, display accessor, exclusions.
- Gate: không còn “unknown”; kiểm lại count bằng `rg`; schema/query shape xác minh từng server sort.

### Phase 1 — Contract + characterization tests (blocker)

- Chốt state machine, null placement, text collation, semantic display sorting, stable tie-breaker.
- Viết characterization trước migration cho DataTable default fallback, DataGrid input order,
  grouped invariants và matrix row order.
- Gate: test gọi implementation thật; default round-trip chính xác ở cả server/client.

### Phase 2 — DataTable flat server + legacy flat client

- Sửa lệch default-on UI/spec; map displayed select/status; thêm stable DB order; migrate legacy
  category list bằng local adapter, không nhét local sort vào generic server shell.
- Gate: sort toàn dataset qua nhiều page, URL reload, page reset, default indicator đúng.

### Phase 3 — DataGrid

- Audit từng grid trước khi bật; xác nhận rows là full set; thêm accessor cho display values;
  bảo toàn edit/paste/selection theo row id.
- Gate: 25/25 occurrences có quyết định explicit; default phục hồi input order; null tests pass.

### Phase 4 — Raw flat tables

- Paginated raw đi server adapter; full-list raw dùng local adapter/header-button.
- Gate: không có current-page-only sort; action/STT/footer không có affordance sort.

### Phase 5 — Grouped/tree tables

- Port theo group-aware adapter; leaf sort trong từng group, không phá collapse/subtotal.
- Gate: group count/tổng/collapse không đổi qua đủ ba trạng thái.

### Phase 6 — Matrix + nested tables

- Metric leaf accessor cho matrix; audit riêng từng nested table trong can-doi-vat-tu.
- Gate: dynamic headers vẫn thẳng hàng; footer tổng không reorder; default phục hồi byte-for-byte
  chuỗi row IDs ban đầu.

### Phase 7 — Fresh coverage audit

- Re-run inventory, spot-check mọi occurrence, keyboard/a11y, unit + integration + UI smoke.
- Gate: manifest 100% có PASS hoặc documented non-sortable leaf; không dùng “file migrated” thay
  cho “table occurrence verified”.

## Rủi ro/giả định phải bác bỏ

- “Tất cả bảng” không có nghĩa mọi `<th>`: group header, action, STT, subtotal không có order domain.
- “Giá trị hiển thị” không thể luôn suy ra từ `row[col]`; render callback có thể dùng label map,
  relation/options hoặc computed value.
- Không thể client-sort page hiện tại rồi gọi là sort toàn bảng.
- Không thể mặc định bật mọi DataGrid: một số thứ tự là workflow/schedule/business order.
- Không được tái dùng FK nested-order infrastructure nếu schema/query không có relation thật.
- Một universal comparator không giải quyết DB collation, enum label order hoặc computed server field.

## Quyết định còn thiếu

1. Null luôn cuối ở cả asc/desc, hay theo DB mặc định? Khuyến nghị: luôn cuối.
2. Grouped tables sort leaf trong từng group (khuyến nghị) hay phá group để sort toàn cục?
3. Matrix click leaf metric chỉ sort rows (khuyến nghị), hay còn cho reorder entity groups?
4. Với label chỉ tồn tại trong code và server pagination, chấp nhận thêm DB sort mapping/query riêng,
   hay đánh dấu cột chưa sortable cho tới khi có mapping đúng?

