# Final test report — sort hai chiều toàn bộ bảng

Ngày chạy: 2026-08-20. Phạm vi: unit test, TypeScript, ESLint, production build, whitespace check và kiểm kê renderer bảng. Không chạy load/performance test.

## Kết quả quality gate — rerun cuối

Kết quả dưới đây **thay thế lần chạy trước** sau khi các review fix đã được áp dụng.

| Gate | Kết quả | Bằng chứng |
|---|---|---|
| `pnpm test` | PASS | 81 files, 783 tests passed |
| `pnpm exec tsc --noEmit` | PASS | exit 0 |
| `pnpm lint` | PASS | exit 0, không còn error/warning |
| `pnpm build` | PASS | Next.js production build, TypeScript và 37 static pages hoàn tất |
| `git diff --check` | PASS | exit 0; chỉ có cảnh báo LF/CRLF, không có whitespace error |

Hai lỗi lint `react-hooks/immutability` được phát hiện ở lần chạy trước đã được sửa và xác nhận không tái hiện.

Sau re-review, hai header server cục bộ được bổ sung `aria-label` mô tả trạng thái hiện tại và hành động kế tiếp. `pnpm exec tsc --noEmit`, ESLint trên hai route và `git diff --check` tiếp tục PASS.

Không có integration/E2E spec chuyên biệt cho sorting trong repository. Các suite cần PostgreSQL/Playwright đó không được ghi nhận là đã chạy; phạm vi đóng feature dựa trên manifest exhaustive, unit/interaction tests, typecheck, lint và production build nêu trên.

## Kiểm kê bảng tái lập được

Lệnh dùng:

```powershell
rg -n -F '<DataTable' app components -g '*.tsx'
rg -n -F '<DataGrid' app components -g '*.tsx'
rg -n '<table(?:\s|>)' app components -g '*.tsx'
```

| Family | Kết quả |
|---|---:|
| `DataTable` | 8 render / 8 files |
| `DataGrid` | 27 textual matches / 25 files; 25 JSX renders + 2 generic type references |
| Raw `<table>` | 45 occurrences / 38 files |
| Raw business tables | 44 / 37 files sau khi loại primitive `components/ui/table.tsx:13` |

## Audit coverage raw tables

Audit theo từng block `<table>…</table>` và kiểm tra wrapper/state tương ứng cho thấy **không có raw business table có header dữ liệu bị thiếu chiến lược sort**.

Các trường hợp không chứa trực tiếp một trong ba tên header chuẩn trong block đã được mở wrapper để xác minh:

- `app/(app)/van-hanh/phieu-phoi-hop/thong-ke-sla/page.tsx:189,211`: dùng local `SortHead`, có `aria-sort`, URL state và `stableSemanticSort` độc lập cho hai bảng.
- `components/sl-dt/sortable-doanh-thu-report-table.tsx:59`: wrapper header gọi `SortableTableHead`; leaf rows được sort trong group.
- `components/sl-dt/sortable-san-luong-report-table.tsx:55`: wrapper header gọi `SortableTableHead`; leaf rows được sort trong group.
- `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx:743`: widget “Top 10 cần đi lấy hóa đơn”, không có `<thead>`/data header và thứ tự ranking là nội dung của widget; không phải sortable table occurrence. Hai bảng nghiệp vụ còn lại trong file dùng `SortableTableHead`.
- `components/ui/table.tsx:13`: primitive renderer, không phải bảng nghiệp vụ.

Các occurrence còn lại dùng trực tiếp `SortableTableHead`, `ServerSortableTableHead` hoặc `SortHeader`; các bảng Glide/DataTable đi qua renderer riêng đã kiểm kê ở trên.

## Kết luận

Coverage triển khai đạt yêu cầu kiểm kê; unit test, TypeScript, ESLint, production build và diff check đều pass. Không còn blocker trong bộ quality gate được yêu cầu.
