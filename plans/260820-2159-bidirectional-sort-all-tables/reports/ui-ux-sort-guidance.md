---
title: "UI/UX guidance cho sort ba trạng thái"
status: reviewed
created: 2026-08-20
scope: [html-table, data-table, glide-data-grid, accessibility, mobile]
---

# UI/UX guidance cho sort ba trạng thái

## Kết luận

Giữ nguyên ngôn ngữ hình ảnh hiện tại: Lucide nét mảnh, token `foreground` / `muted-foreground`, header dày đặc và horizontal scroll. Không redesign bảng. Với HTML, dùng một header button chung và đặt `aria-sort` trên `<th>`. Với Glide canvas, dùng indicator icon riêng của Glide nhưng không tuyên bố đạt `aria-sort` vì public API hiện tại không expose thuộc tính này cho accessibility-tree header.

## Contract đề xuất

| State | Icon HTML / Glide | Màu | `aria-sort` HTML | Tooltip / nhãn trạng thái |
|---|---|---|---|---|
| `default` | `ChevronsUpDown` | `text-muted-foreground` | `none` | `Thứ tự mặc định` |
| `asc` | `ChevronUp` | `text-foreground` | `ascending` | `Tăng dần` |
| `desc` | `ChevronDown` | `text-foreground` | `descending` | `Giảm dần` |

- Giữ bộ icon đang dùng tại `components/data-table/sort-header.tsx:3,28-41`; kích thước `size-3`, `shrink-0`, `aria-hidden="true"`. Không dùng màu làm tín hiệu duy nhất.
- Cả ba icon phải chiếm cùng một slot để label không dịch chuyển khi đổi state. Không animate kích thước/vị trí; `transition-colors` hiện tại là đủ.
- `default` mô tả **user state**, không mô tả hướng `ResourceSpec.defaultSort`. Vì vậy vẫn là icon trung tính + `aria-sort="none"` dù thứ tự DB hiệu lực là asc hoặc desc. Đây khớp quyết định đã duyệt trong Phase 2/3.
- Tooltip nên xuất hiện khi hover **và focus**, dùng primitives sẵn có ở `components/ui/tooltip.tsx`. Tooltip hiển thị state hiện tại; `aria-label` của button nên mô tả cả state và hành động kế tiếp:
  - default: `Sắp xếp theo {header}. Thứ tự mặc định. Kích hoạt để sắp xếp tăng dần.`
  - asc: `Sắp xếp theo {header}: tăng dần. Kích hoạt để sắp xếp giảm dần.`
  - desc: `Sắp xếp theo {header}: giảm dần. Kích hoạt để trở về thứ tự mặc định.`

## HTML / DataTable

- Đặt `aria-sort` trên `TableHead`/`<th>`, không đặt trên `<button>`. Button native tự hỗ trợ Enter/Space; không thêm `role="button"` hoặc key handler trùng lặp.
- Sortable `<th>` nên có `scope="col"`. Trong matrix nhiều tầng, parent group dùng `scope="colgroup"`; chỉ leaf metric `<th scope="col">` có button và `aria-sort`.
- Button cần phủ vùng header hữu dụng và giữ alignment: `flex w-full min-h-11 items-center` với `justify-start|center|end` theo alignment cột. Không để `flex` mặc định làm cột numeric/right-aligned bị kéo về trái như nguy cơ tại `sort-header.tsx:68-71`.
- Dùng focus style cùng primitive hiện có: `rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50`. Trạng thái focus phải thấy rõ ở light/dark; không chỉ đổi màu chữ.
- Touch target phải đạt tối thiểu 44px. `TableHead` hiện chỉ `h-10` (`components/ui/table.tsx:68-75`), còn button hiện chỉ cao bằng text, nên cần `min-h-11` hoặc rule coarse-pointer scoped cho sort header. `app/globals.css` hiện chưa có rule `@media (pointer: coarse)` như mobile contract mô tả; không dựa vào hit-area giả định.
- Giữ `overflow-x-auto` của `Table` (`components/ui/table.tsx:7-18`) và áp dụng `min-w-[600px]` ở business table/TableShell theo mobile rule; icon `shrink-0`, label `whitespace-nowrap`, không ép cột rộng hơn ngoài slot icon.
- Sticky header đang được áp dụng ở cả primitive và global CSS (`components/ui/table.tsx:22-28`, `app/globals.css:243-269`); button/icon không được đổi `position`, `z-index` hoặc background của `<th>`.
- Print regression cần được khóa: `app/globals.css:278-288` ẩn toàn bộ `button`, nên sortable header hiện có thể mất cả label khi in. Giải pháp tối thiểu là render thêm label chỉ dành cho print trong cùng `<th>` (`hidden print:inline`) hoặc thu hẹp print selector sau khi audit; không để migration raw table làm tiêu đề PDF biến mất.

## Glide canvas

- Không render React/Lucide trực tiếp vào canvas. Dùng `GridColumn.indicatorIcon` + `DataEditor.headerIcons` với ba SVG nhỏ mô phỏng đúng `ChevronsUpDown`, `ChevronUp`, `ChevronDown`; giữ `title` gốc ổn định thay vì nối ký tự `▲/▼/⇅` như `components/data-grid/data-grid.tsx:60-71`. Indicator slot tránh thay đổi width/alignment của title.
- Click/tap vẫn ở toàn bộ leaf header qua `onHeaderClicked` (`data-grid.tsx:148-155,209-225`). Set `headerHeight={44}` để thay default 36px của Glide và đạt touch target; không tạo icon-only hotspot nhỏ.
- Group header và dynamic column group không có indicator/click handler. Matrix chỉ gắn indicator vào leaf metric columns; row marker/checkbox, action, STT, group header và tổng không có affordance.
- Glide 6.0.4-alpha24 tạo accessibility tree nội bộ với `<th role="columnheader">{c.title}</th>` nhưng không có `aria-sort`, và `GridColumn` public type không có trường ARIA. Do đó:
  1. mức tối thiểu không redesign: thêm vùng `aria-live="polite"` bên ngoài canvas để báo `Đã sắp xếp {header}: ...`, thêm hướng dẫn bàn phím ngắn và test screen reader;
  2. keyboard: phải có đường Enter/Space được kiểm chứng thực tế; `onHeaderClicked` chỉ chứng minh click, không chứng minh keyboard activation. Nếu canvas không expose header activation an toàn, cung cấp DOM sort control tương đương thay vì giả lập key trên cell;
  3. không đánh dấu acceptance “`aria-sort` pass” cho Glide chỉ vì title/icon đổi.

## Grouped / tree / matrix exclusions

- Chỉ leaf data headers có miền thứ tự rõ ràng mới sortable.
- Không gắn button/icon/tooltip/`aria-sort` vào STT, checkbox, action, parent/group header, subtotal, grand total, footer hoặc dynamic column-group label.
- Grouped/tree giữ group order; sort leaf siblings trong từng group. Matrix giữ column axis/`colSpan`; click leaf metric chỉ reorder row dimension.
- Nested tables phải có state, tooltip IDs/live-region message và accessible name theo occurrence; không dùng singleton/global state. Khi cùng label xuất hiện nhiều bảng, thêm ngữ cảnh bảng vào accessible label nhưng giữ visible header ngắn.

## Điểm xung đột cần chốt

Có một xung đột giữa acceptance rộng “mọi header có keyboard + `aria-sort` đúng” và quyết định kiến trúc “Glide giữ canvas renderer”. Với Glide version đang cài, chỉ thay title/icon không thể đặt `aria-sort` lên internal `<th>`. Khuyến nghị chốt contract như sau:

- HTML/DataTable: bắt buộc `aria-sort` chuẩn trên `<th>`.
- Glide: bắt buộc indicator, announcement, keyboard-equivalent và screen-reader test; ghi documented platform limitation cho literal `aria-sort`.
- Nếu literal `aria-sort` trên Glide là bắt buộc, scope phải mở sang DOM companion header/control hoặc patch/upstream Glide — đây là thay đổi lớn hơn “không redesign” và cần user phê duyệt riêng.

Ngoài điểm này, không có xung đột với quyết định đã duyệt về icon trung tính ở default, chu kỳ ba trạng thái, leaf-only group/matrix và giữ renderer hiện tại.

## Checklist nghiệm thu

- HTML: Tab → focus ring; Enter/Space chạy đúng cycle; `aria-sort` và label cập nhật sau mỗi lần.
- Mobile/coarse pointer: target ≥44px, horizontal scroll còn hoạt động, sticky header không che/nhảy.
- Light/dark: neutral và active icon phân biệt được bằng shape + contrast, không chỉ màu.
- Print: mọi sortable header vẫn in label.
- Glide: click/tap toàn header, header 44px, announcement state, keyboard-equivalent; không claim literal `aria-sort` nếu chưa có DOM semantic tương ứng.
- Group/matrix: parent headers, totals, footer và dynamic groups không xuất hiện sort affordance; alignment/`colSpan` bất biến.
