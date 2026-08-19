# Phase 04 — Export xlsx

## Context links

- Design §Interaction v1 (xuất .xlsx): `plans/reports/brainstorm-260819-can-doi-vat-tu-ux-analytics.md`.
- Pattern SheetJS aoa: `app/api/thanh-toan/tong-hop/export/route.ts` (admin-only — KHÔNG dùng guard đó).
- Guard đúng: `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } })`.
- Service consumer: `lib/du-an/can-doi-service.ts::listCanDoiVatTu`.

## Overview

Tạo route `GET /api/du-an/[id]/can-doi/export` trả về file .xlsx 1 sheet — layout category-grouped hàng dọc, các nhóm cột 3 mode xếp cạnh nhau (tất cả cột hiện trên UI). Reuse `listCanDoiVatTu` để chắc chắn tổng = on-screen totals. Guard bằng scope-project ACL. Client thêm nút download.

## Key insights

- Không đưa mode switcher vào file Excel — người dùng cần đủ context. Layout: cột base + 3 nhóm cột (Mode 1 / Mode 2 / Mode 3) side-by-side.
- Reuse cùng service ⇒ single source of truth cho ε, bucket, adjusted total.
- SheetJS `aoa_to_sheet` đủ dùng — không cần feature merge phức tạp trừ tiêu đề & header group.
- Nếu total.amountTt = 0 thì cột mode 2/3 vẫn xuất nhưng empty (đúng ý người dùng — 1 file phản ánh trạng thái).

## Requirements

- Route file: `app/api/du-an/[id]/can-doi/export/route.ts`. Handler `GET(req, { params })`.
- Validate `projectId` int; guard scope-project.
- Fetch `data = await listCanDoiVatTu(projectId)`.
- Build aoa:
  - Row 0: tiêu đề "CÂN ĐỐI VẬT TƯ — [Tên dự án]" (fetch project.name riêng, cache trong query).
  - Row 1: blank.
  - Row 2 (header row 1 — merge group): base cols, "Lấy hóa đơn", "Thi công vs DT", "TT vs HĐ".
  - Row 3 (header row 2): sub-column labels từng nhóm.
  - Rows body: mỗi category có 1 group header row (bold, bg tô), rows con, subtotal row.
  - Cuối: TỔNG CỘNG row.
- Number format `"#,##0"` cho tiền, `"#,##0.00"` cho SL, `"0.0%"` cho % (chỉ áp cell number).
- Column widths hợp lý (mã 12, tên 32, ĐVT 8, số 14).
- Content-Disposition attachment; filename `can-doi-vat-tu-{projectCode}-{yyyymmdd}.xlsx`.
- Client (`can-doi-vat-tu-client.tsx`): nút "Xuất Excel" là `<a href={url} download>` — không cần state.

## Architecture

```
Client button ─GET─▶ route.ts
                       ├── guard (project scope)
                       ├── listCanDoiVatTu(projectId)  ← same service as page
                       ├── fetch project.name/code
                       ├── buildAoa(data, project)
                       └── XLSX.write → NextResponse (buffer)
```

## Related code files

- Create: `app/api/du-an/[id]/can-doi/export/route.ts`.
- Modify (đã trong phase 03): button link `/api/du-an/{id}/can-doi/export`.

## Implementation steps

1. Route skeleton (copy shape từ `thanh-toan/tong-hop/export/route.ts`) — thay guard: dùng `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } })` (import từ `@/lib/acl/released-module-request`). KHÔNG check role admin.
2. Fetch project: `await prisma.project.findUnique({ where: { id: projectId }, select: { code: true, name: true } })` — 404 nếu null.
3. Call `listCanDoiVatTu(projectId)` (service tự guard lần nữa — trùng nhưng cheap).
4. Helper `buildAoa(data, project)` return `(string|number|null)[][]`, `merges: XLSX.Range[]`, `numberCells: {r,c,fmt}[]`.
5. Column plan (đưa hằng số ở top file):
   - Base 4: `[Mã, Tên vật tư, ĐVT, Bucket]`.
   - Mode HD: `[DT SL, Dự toán (adj), HĐ SL, Hóa đơn, %HĐ, Còn phải lấy]`.
   - Mode TT-DT: `[TT SL, %SL, Giá DT, Giá bq TT, Chênh giá đ, Chênh giá %, Tác động giá]`.
   - Mode TT-HD: `[Chênh SL, Giá bq HĐ, Chênh giá, Chênh tiền TT−HĐ]` (tt-hd một số cột đã có ở mode 2 — không lặp).
6. Header row 1 merges các group tag; row 2 render sub-labels.
7. Body: từng group → 1 row header (colspan merge base+3 groups), rows con (dùng values từ service; null → ""), subtotal (bold).
8. Grand total row cuối (bold, top border via cell style — chỉ format cơ bản, skip nếu tốn thời gian).
9. Apply number formats via loop `ws[addr].z = fmt` (theo `numberCells`).
10. `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })` → NextResponse.
11. Manual test: click nút trên UI → file tải, mở Excel → check total = StatCard.

## Todo list

- [ ] route.ts skeleton + guard
- [ ] fetch project + service
- [ ] buildAoa + column plan constants
- [ ] merges cho header groups
- [ ] number formats
- [ ] filename với projectCode + date
- [ ] client button (nếu chưa gắn ở phase 03)
- [ ] smoke test download + verify tổng
- [ ] tsc + eslint sạch

## Success criteria

- Download hoạt động, Excel mở không lỗi.
- Tổng dòng "TỔNG CỘNG" trong file = StatCard "Đã lấy HĐ" / "Dự toán (adj)" — verify by hand cho MNTC-GD1.
- User không phải admin nhưng có `du-an` read scope project → tải được.
- User không có access → 403.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Total lệch on-screen do render số client dùng `Math.round` | Med | Med | Server luôn round trước khi trả về data OR tôn trọng số nguyên VND — spec: `Math.round` ở cả 2 nơi. |
| Guard sai (admin-only kế thừa từ pattern cũ) | Med | High | Đọc lại đoạn guard `thanh-toan/tong-hop` — cẩn thận **không copy** phần admin check. |
| Header merge sai col span khi chỉnh column list | Low | Med | Tính COL_START/COL_END từ hằng số length; comment rõ. |
| Query chậm nếu N cats × M rows lớn (chưa vấn đề với 370 rows) | Low | Low | Cache-free; OK for v1. |

## Security considerations

- Route trả file binary; guard bắt buộc TRƯỚC bất kỳ query nào.
- Không leak project name/code cho user không quyền (404 vs 403: dùng ACL guard throw 401/403 trước findUnique).
- Không log body (không cần), không cache Cloudflare (thêm `Cache-Control: private, no-store`).

## Next steps

Phase 05 verify + docs.
