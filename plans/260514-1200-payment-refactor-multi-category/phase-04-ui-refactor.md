# Phase 04 — UI refactor

## Context Links
- Round list: `app/(app)/thanh-toan/ke-hoach/round-list-client.tsx`
- Round detail: `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx`
- Round detail page (server): `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx`
- Tong-hop: `app/(app)/thanh-toan/tong-hop/tong-hop-client.tsx`
- Tong-hop page: `app/(app)/thanh-toan/tong-hop/page.tsx`

## Overview
- Priority: P2
- Status: completed
- Effort: 3.5h (actual 3.5h)
- Blocked by: Phase 03

## Description
Refactor UI 3 màn:
1. Round list — create dialog bỏ category; bỏ filter category
2. Round detail — thêm cột Category; auto-fill congNo/luyKe; nút "Cập nhật số dư" (round-level); admin "Override" toggle (item-level)
3. Tong-hop — pivot 8 cột (4 category × 2 scope) per supplier

## Requirements

**Round list (`round-list-client.tsx`)**
- Dialog "Tạo đợt": chỉ input month + note. Bỏ dropdown category.
- Bảng danh sách: bỏ cột Category (giờ nó ở item level, không còn ý nghĩa ở round)
- Bỏ filter `category` ở toolbar
- `CATEGORY_LABEL` giữ lại (export reusable cho detail)

**Round detail (`round-detail-client.tsx`)**
- Bảng items: thêm cột "Loại" (category) ở vị trí đầu (trước Supplier)
- Form add new item:
  - Dropdown Category (BẮT BUỘC) với 4 option vat_tu/nhan_cong/dich_vu/khac
  - Khi supplier+project được chọn đủ → fetch auto-fill qua server action mới (recommend: inline trong upsert action, KHÔNG cần endpoint riêng — user submit form và server tự fill nếu congNo/luyKe blank)
  - Implement chiến lược: form gửi `congNo: null, luyKe: null` khi không override → server auto-fill
  - Display hint "Sẽ auto-fill khi lưu" nếu user không override
  - Optional preview button: "Xem số dư hiện tại" gọi server action read-only (skip cho MVP — KISS)
- Read-only inputs cho congNo/luyKe by default
- Toggle "Override" (chỉ hiển thị nếu actor.role='admin'): khi bật, congNo/luyKe editable; gửi `override: true`
- Header có nút "Cập nhật số dư" (visible chỉ khi `round.status='draft'`):
  - Confirm dialog "Cập nhật lại congNo/luyKe của tất cả items theo ledger hiện tại?"
  - Gọi `refreshAllItemBalancesAction(roundId)`
  - Toast success + `router.refresh()`
- Display `balancesRefreshedAt` (nếu có) bên cạnh mỗi item row hoặc trên header

**Tong-hop (`tong-hop-client.tsx` + `page.tsx`)**
- Page query: `aggregateMonth(month)` trả về rows có `category`
- `PivotRow` shape mới:
  ```
  { supplierId, supplierName,
    cells: Record<`${category}_${scope}_${deNghi|duyet}`, number>,
    totals: { deNghi, duyet } }
  ```
- Header table: row 1 = 4 category groups; row 2 = scope (cty_ql | giao_khoan) × 2 (Đề nghị | Duyệt); cuối thêm Totals.
- Tổng 8 cell số / supplier + 2 cell totals.
- Footer row: grand totals per cell.

## Architecture
- Auto-fill UX strategy: server-side fill khi field=null. KHÔNG cần thêm read endpoint → giảm round-trips & complexity (KISS).
- Override flag: client gửi explicit. Server enforce role.

## Related Code Files
**Modify**
- `app/(app)/thanh-toan/ke-hoach/round-list-client.tsx`
- `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx` (server props — pass actor.role nếu chưa có)
- `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx`
- `app/(app)/thanh-toan/tong-hop/page.tsx`
- `app/(app)/thanh-toan/tong-hop/tong-hop-client.tsx`

**Create**: none

**Delete**: none

## Implementation Steps

### Step 1 — Round list
1. Remove `category` state + dropdown trong dialog
2. Remove `category` cột bảng + filter
3. Update `createRoundAction` invocation — chỉ truyền `{month, note}`

### Step 2 — Round detail props
1. Server `page.tsx`: pass `actorRole` (string|null) xuống client để gate Override
2. Item type thêm `category: string`, `balancesRefreshedAt: Date | null`

### Step 3 — Round detail client
1. Thêm cột "Loại" trong table head + body (dùng `CATEGORY_LABEL`)
2. Form add new item:
   - Add select `category`
   - Add toggle Override (gate by `actorRole==='admin'`)
   - Submit: if !override → gửi `congNo: null, luyKe: null`; else gửi raw + `override: true`
3. Header thêm button "Cập nhật số dư" (hiển thị `round.status==='draft'`)
   - Confirm + call `refreshAllItemBalancesAction`
   - Show timestamp `balancesRefreshedAt` (max của items hoặc per-row)

### Step 4 — Tong-hop
1. Update `AggregateRow` import (đã có `category`)
2. Rewrite `buildPivot` để pivot 4×2×2 = 16 cells (per supplier)
3. Header 2 hàng (category × scope_metric)
4. Footer grand totals
5. Format VND `toLocaleString('vi-VN')`

### Step 5 — Compile + smoke test
1. `pnpm tsc --noEmit` — sạch
2. `pnpm next build` — sạch
3. Manual smoke (dev): tạo round → add 2 items khác category → submit → approve → check tong-hop hiển thị đúng 8 cột

## Todo List
- [ ] Round list create dialog bỏ category
- [ ] Round list bỏ filter + cột category
- [ ] page.tsx pass actorRole xuống client
- [ ] Round detail thêm cột category
- [ ] Round detail form thêm category select
- [ ] Round detail auto-fill flow (null → server fill)
- [ ] Override toggle (admin gated)
- [ ] "Cập nhật số dư" header button
- [ ] Display balancesRefreshedAt
- [ ] Tong-hop buildPivot rewrite
- [ ] Tong-hop header 2 rows + footer totals
- [ ] tsc + build sạch
- [ ] Smoke test happy path

## Success Criteria
- User flow: tạo round → add 2 items (vat_tu cty_ql + nhan_cong giao_khoan) → submit → giám đốc duyệt → tong-hop tháng đó hiển thị 2 cell có số tương ứng
- Non-admin KHÔNG thấy Override toggle
- "Cập nhật số dư" chỉ hiển thị khi draft; sau click, congNo/luyKe khớp với ledger tại thời điểm bấm
- Tong-hop format VND đúng locale; sum hàng = sum cell

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Auto-fill UX confusing khi field hiển thị 0 trước submit | Medium | Low | Hint text + placeholder "Tự tính khi lưu" |
| Tong-hop wide table tràn viewport | Medium | Low | `overflow-x-auto` wrapper + sticky first col |
| Override toggle leak ở client (non-admin thấy) | Low | High | Gate cả ở server prop + client check; server `upsertItem` enforce |
| balancesRefreshedAt null ở items cũ override → hiển thị "—" | Low | Low | Conditional render |

## Security Considerations
- Override toggle hiển thị check `actorRole==='admin'` ở client + server enforce trong `upsertItem`
- `refreshAllItemBalancesAction` enforce creator/admin trong service layer

## Next Steps
- Sau Phase 04 green → `/ck:code-review` toàn bộ Sub-B
- Update `docs/system-architecture.md` (payment module diagram) nếu impact đủ lớn
