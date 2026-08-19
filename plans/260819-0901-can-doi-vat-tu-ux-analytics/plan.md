---
title: "Cân đối vật tư — UX 3 chế độ + thống kê thông minh"
description: "Rebuild màn Cân đối vật tư thành 1 screen 3-mode (Lấy HĐ / TT vs DT / TT vs HĐ) với category-collapsed groups, StatCards, worklist top-10 và export xlsx."
status: completed
priority: P2
effort: 18h
branch: main
tags: [du-an, ui, analytics]
created: 2026-08-19
---

## Nguồn thiết kế

`plans/reports/brainstorm-260819-can-doi-vat-tu-ux-analytics.md` — đã APPROVED (4 quyết định).
Kế thừa commit 63b0a39 (screen v0 phẳng).

## Kết quả (2026-08-19)

Cả 5 phase hoàn thành cùng ngày; gates xanh (tsc, eslint, vitest 732/732, next build).
Code review: DONE_WITH_CONCERNS 7/10 — đã vá cả 5 finding trước khi commit:
(1) bucket tôn trọng ghi đè khi HĐ=0 (+3 test); (2) race sessionStorage restore/persist
(restoredRef gate); (3) xóa ô SL HĐ trên grid giờ về mặc định = SL ("qtyHd" in patch);
(4) export bỏ Σ thực tế khỏi cột Giá bq TT (chuyển thành text ở cột Tên);
(5) export phân biệt 0% thật với % bị suppress (pv vs n).
Chấp nhận (rủi ro thấp, ghi nhận): setTimeout 50ms cho worklist jump.
Khác plan: helpers/types tách sang `lib/du-an/can-doi-metrics.ts` vì module "use server"
chỉ được export async function; unit test đặt tại `__tests__/can-doi-metrics.test.ts`.
Walkthrough dữ liệu: backfill 117/117; mô phỏng nhập TT 1 dòng → per-stream aggregates
đúng (qty_tt chỉ đếm dòng có amountTt) rồi hoàn trả; adjusted = gốc (chưa có CO).

## Phases

| # | Tên | Effort | Blockers | Owner files |
|---|-----|--------|----------|-------------|
| 01 | Schema `qtyHd` + wiring form/adapter/service | 4h | — | `prisma/schema.prisma`, `prisma/migrations/2026*_add_transaction_qty_hd/`, `lib/du-an/schemas.ts`, `lib/du-an/transaction-service.ts`, `app/(app)/du-an/[id]/giao-dich/giao-dich-client.tsx`, `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts`, `lib/import/adapters/__tests__/bang-can-doi-vat-tu.test.ts` |
| 02 | Service metrics per-stream + suppression | 5h | 01 | `lib/du-an/can-doi-service.ts`, `lib/du-an/__tests__/can-doi-service.test.ts` (new) |
| 03 | UI v1 — mode switcher + groups + StatCards + worklist | 5h | 02 | `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx`, `app/(app)/du-an/[id]/can-doi-vat-tu/page.tsx` |
| 04 | Export xlsx | 2h | 02, 03 | `app/api/du-an/[id]/can-doi/export/route.ts` (new), client download button |
| 05 | Docs + full verify | 2h | 01–04 | `docs/du-an/can-doi-vat-tu-convention.md`, `docs/project-changelog.md` |

## Acceptance criteria

- Load `/du-an/4/can-doi-vat-tu` hiển thị ≤ 20 dòng khi tất cả nhóm collapsed (6 nhóm × header + StatCards + worklist card).
- 3 tabs "Lấy hóa đơn" / "Thi công vs DT" / "TT vs HĐ" đều mount, mode 1 đầy đủ cột, modes 2–3 hiển thị empty-state panel khi coverage TT = 0.
- Worklist "Top 10 còn phải lấy HĐ" click → scroll + expand nhóm chứa dòng đó.
- Bucket badge cho từng dòng (chưa lấy / thiếu / đủ / vượt / ngoài DT) đúng theo ε = max(1.000đ, 0,5% dự toán dòng).
- Tổng ở StatCards, group header, grand total, và export xlsx **bằng nhau tuyệt đối** (single source: server).
- Nhập "SL HĐ" ≠ SL trên form giao dịch → mode-3 hiện chênh SL, mode-1 % HĐ SL đọc từ qtyHd.
- Import lại `SOP/Bang cân đối vật tư.xlsx` → `qtyHd = qty` cho mọi dòng invoice; 16 test adapter cũ vẫn pass + test mới cho qtyHd.
- `pnpm exec tsc --noEmit`, `pnpm exec eslint .`, `pnpm exec vitest run`, `pnpm build` pass.

## Cross-phase invariants

- **Server tính tất cả** metric, %, bucket, suppression, weighted price. Client chỉ format/render.
- **`vw_project_norm` không sửa** (consumer khác — `dashboard-service`, `dinh-muc`). Service mới bypass view cho aggregate qty/amount, chỉ dùng view (hoặc plain join) làm neo estimate.
- **ε bucket single-source**: hằng số trong `can-doi-service.ts`, export và UI đều đọc lại subtotal do service trả về (không tự tính lại).
- **`qtyHd` additive**: `null` ⇒ đọc như `qty`; contract của `transactionSchema` không phá vỡ (field optional; default = qty ở tầng service khi cần).
- **Denominator**: `vw_project_estimate_adjusted.adjusted_total_vnd` (fallback tự động = `totalVnd` khi không có CO — join query giữ nguyên hành vi hôm nay cho MNTC-GD1).
- **Guard**: mọi route/server action giữ `requireReleasedModuleRequest("du-an", …, scope: project)`.
- **Không dùng plan ID / phase number trong code comment / migration name / commit message.**
- **Conventional commits, không nhắc AI**. Đề xuất: `feat(du-an): tách qtyHd cho invoice`, `feat(du-an): mode switcher cân đối vật tư`, `feat(du-an): export xlsx cân đối`, `docs(du-an): quy ước 3-mode + qtyHd`.

## Rollback (từng phase)

- 01: revert migration file + rollback trên DB dev (`prisma migrate resolve --rolled-back`); form/adapter/service revert commit.
- 02: revert service commit → UI mode-1 dùng shape cũ (temporarily); nhưng UI v3 phụ thuộc, nên phase 02+03 cùng revert.
- 03: revert UI commit → giữ table cũ (không mất data).
- 04: revert route + button.
- 05: docs revert.

## Unresolved questions

- Icon library cho segmented switcher & bucket badge: dùng `lucide-react` (đã có trong repo) — xác nhận trong phase 03.
- URL param cho tab hiện tại (`?mode=hoa-don|thi-cong|tt-hd`) — quyết trong phase 03; v1 mặc định lưu vào `sessionStorage` là đủ.
- Kịch bản test CO cho denominator (giả lập 1 CO approved trên MNTC-GD1) — phase 05 nếu còn thời gian, hoặc note lại cho tương lai.
