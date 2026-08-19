# Phase 03 — UI v1: mode switcher + collapsible groups + StatCards + worklist

## Context links

- Design §Information architecture + §Interaction v1: `plans/reports/brainstorm-260819-can-doi-vat-tu-ux-analytics.md`.
- Client hôm nay: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx` (232 dòng, table phẳng).
- Page: `app/(app)/du-an/[id]/can-doi-vat-tu/page.tsx` (RSC — không đổi trừ khi cần).
- StatCard pattern tham khảo: `app/(app)/du-an/[id]/page.tsx` (dashboard).
- Format helper: `lib/format.ts` (`vndFormatter`).

## Overview

Rebuild client thành single-screen 3-mode UI. Bố cục dọc: (1) StatCards row (4 card), (2) Worklist card (top-10 còn phải lấy HĐ), (3) Filter bar (search + bucket chips + expand/collapse all + export button), (4) Segmented mode switcher, (5) Table với category groups collapsible mặc định. Không dùng chart lib / grid lib — plain HTML + Tailwind + CSS bar.

## Key insights

- 3 mode chỉ đổi **cột** — rows/grouping/StatCards không đổi. State `mode: 'hd' | 'tt-dt' | 'tt-hd'`, mảng cột dựng theo mode.
- Collapsed default: 6 category headers hiển thị subtotal + progress bar. Expand click header → hiện rows con.
- Worklist click → set expand cho category chứa dòng đó + `scrollIntoView({ block: 'center' })` vào `id={row.id}`.
- Empty state modes 2–3: kiểm `data.total.amountTt === 0` → panel hướng dẫn "Chưa có số thực tế, nhập cột TT ở tab Giao Dịch". Vẫn render header/rows nhưng cột chênh = "—".
- Diacritic-insensitive search: dùng `str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()`.
- Persistence: `sessionStorage` cho `mode` + `expandedGroups` (KISS — không dùng URL search param v1).

## Requirements

- StatCards (4 cột trên `sm:` grid, `grid-cols-1 md:grid-cols-4 gap-3`):
  1. "Tổng dự toán (điều chỉnh)" = `total.estimateAdjustedTotalVnd` + phụ đề "(gốc: X đ)".
  2. "Đã lấy HĐ" = `total.amountHd`, phụ: `%` + CSS bar clamp 0-100 (amber >100).
  3. "Còn phải lấy HĐ" = `Σ max(row.remainingInvoiceVnd, 0)` (override-aware, đã tính server).
  4. "Thực tế đã nhập" = `total.amountTt`, phụ: `x/N dòng có TT ≠ 0`.
- Worklist card: title "Top 10 cần đi lấy hóa đơn", table 3 cột (Mã, Tên vật tư, Còn phải lấy), click row → onSelect(row.id).
- Segmented switcher: `role="tablist"` với 3 tab. Design đơn giản dùng `<button>` styling; giữ ARIA `aria-pressed`.
- Filter bar: input search (debounce 200ms), 5 chip bucket (chưa lấy / thiếu / đủ / vượt / ngoài DT) + chip "✎ có ghi đè", nút "Mở tất cả" / "Đóng tất cả", nút "Xuất Excel" (link `/api/du-an/{id}/can-doi/export`).
- Table cột theo mode:
  - Base (luôn có): Mã · Tên vật tư · ĐVT · Badge bucket.
  - Mode `hd`: DT SL · Dự toán (adj) · HĐ SL · Hóa đơn · %HĐ · Còn phải lấy (OverrideCell) · Bar.
  - Mode `tt-dt`: DT SL · TT SL · %SL · Giá DT · Giá bq TT · Chênh giá (đ / %) · Tác động giá.
  - Mode `tt-hd`: TT SL · HĐ SL · Chênh SL · Giá bq HĐ · Giá bq TT · Chênh giá · Chênh tiền TT−HĐ.
- Row `null` metric render "—". Bucket badge dùng bảng màu tailwind (chưa lấy = zinc, thiếu = amber, đủ = emerald, vượt = red, ngoài DT = sky).
- Sticky header + sticky "TỔNG CỘNG" footer.
- Search + bucket filter chỉ ẩn rows con, không ẩn category header (giữ context). Nếu tất cả rows của category bị lọc hết → ẩn category.

## Architecture

```
CanDoiVatTuClient (single file, ~500 LoC)
├── <StatCardsRow total={data.total} rowCount={...} />
├── <WorklistCard items={data.worklist} onJump={handleJump} />
├── <FilterBar mode search buckets onExport />
├── <ModeSwitcher mode onChange />
└── <CanDoiTable mode groups filtered expanded onToggleGroup />
      └── <GroupHeader> + rows[] + <SubtotalRow>
        └── <BucketBadge> <ProgressBar> <OverrideCell> (reuse)
```

Không tách component ra file riêng (KISS: 1 file, 5 helper component nội tại).

## Related code files

- Modify: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx` (rewrite).
- Optional: `app/(app)/du-an/[id]/can-doi-vat-tu/page.tsx` — pass `worklist` (đã có sẵn trong data), không đổi signature.

## Implementation steps

1. Import shape mới từ `can-doi-service`. Tạo type `Mode = 'hd'|'tt-dt'|'tt-hd'`.
2. State: `mode`, `expanded: Set<number>` (categoryId), `search`, `bucketFilter: Set<Bucket>`, `overrideOnlyFilter`. Sync sessionStorage khi mount + trên change.
3. `useMemo` computeFilteredGroups (search + bucket) từ props (không mutate).
4. `handleJump(rowId)`: expand group chứa row (parse `e-{estimateId}` → tìm categoryId), scrollIntoView.
5. Component `<StatCardsRow>`: 4 card, dùng `Card`/`div` với border rounded p-3, VND format qua `vndFormatter`.
6. `<WorklistCard>`: nếu empty → "Không còn HĐ cần lấy 🎉"; else bảng 10 dòng, click gọi onJump.
7. `<ModeSwitcher>`: 3 button với `data-active`, style active bằng `bg-primary text-primary-foreground`.
8. `<CanDoiTable>`: render dựa `mode` — 3 map cột (arrays of `{ header, render(row) }`). Reuse `OverrideCell` hiện có (không đổi).
9. Empty-state cho mode `tt-dt` / `tt-hd` khi `total.amountTt === 0`: banner amber trên table + cột chênh vẫn render "—".
10. Sticky: `<thead className="sticky top-0 bg-background z-10">`, subtotal grand `<tfoot className="sticky bottom-0">`.
11. Diacritic-insensitive `matchSearch(row, q)`: normalize NFD + strip combining marks.
12. Progress bar reusable: `<div className="h-1.5 rounded bg-muted"><div style={{width: min(100, pct*100) + '%'}} className={pct>1 ? 'bg-amber-500' : 'bg-emerald-500'} /></div>`.
13. Xuất Excel button: `<Link href={\`/api/du-an/\${projectId}/can-doi/export\`}>` (route ra ở phase 04, để `download` attr — vẫn render dù chưa có route → 404 tạm ok trong phase 03; phase 04 hoàn thiện trước khi merge).
14. Manual smoke test: `pnpm dev` → `/du-an/4/can-doi-vat-tu` — 3 tab click, expand/collapse, search "cát", filter "thiếu".

## Todo list

- [ ] Skeleton file với types & Mode switch
- [ ] StatCardsRow
- [ ] WorklistCard + jump handler
- [ ] FilterBar (search + chips + expand-all + export btn)
- [ ] ModeSwitcher
- [ ] CanDoiTable + 3 column maps
- [ ] BucketBadge + ProgressBar mini components
- [ ] OverrideCell tái sử dụng
- [ ] Empty-state banner modes 2–3
- [ ] sessionStorage persistence
- [ ] Sticky header + footer
- [ ] Smoke test dev
- [ ] tsc + eslint sạch

## Success criteria

- Load screen collapsed → thấy 4 StatCards + Worklist + 6 group headers (≈ 20 dòng DOM khả kiến).
- 3 tab đổi mượt, không reload; sessionStorage giữ mode qua refresh.
- Click 1 item trong worklist → group expand, row highlight (bg-yellow-100 1s là nice-to-have, không bắt buộc).
- Search "xi măng" hiện đúng rows; filter "thiếu" ẩn 'đủ'/'vượt'; xóa filter → khôi phục.
- OverrideCell vẫn edit được (canEdit=true).
- Không có warning "key prop missing" trong console.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sticky footer chồng thanh cuộn ngang | Med | Low | dùng `sticky bottom-0` trong container `overflow-x-auto` — test kỹ, fallback: bỏ sticky footer, chỉ sticky header. |
| SessionStorage SSR mismatch | Med | Low | Wrap state init trong `useEffect` để không đọc trong render đầu. |
| Worklist scrollIntoView không expand kịp (state async) | Med | Low | Set expanded → `queueMicrotask(() => document.getElementById(rowId)?.scrollIntoView(...))`. |
| Bar clamp overflow vượt >200% xấu | Low | Low | Clamp visual 100%; nhưng label vẫn hiển thị số thực (kèm ⚠). |
| Rerender loop khi filter set là ref mới | Med | Low | Dùng useMemo với dependencies scalar (search string, [...bucketFilter].join). |

## Security considerations

- Client không gọi API mới ngoài `setInvoiceOverride` (đã có ACL). Export route mới sẽ tự guard ở phase 04.
- Diacritic-insensitive search chạy client-side trên data đã filtered by server ACL — không rò rỉ.

## Next steps

Phase 04 (export) thêm route đằng sau nút "Xuất Excel". Verify totals khớp on-screen.
