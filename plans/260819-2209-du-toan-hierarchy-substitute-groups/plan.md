---
title: "Phân cấp hạng mục + nhóm vật liệu thay thế"
description: "Nhóm dự toán/phát sinh/DT điều chỉnh theo HM-section, mở rộng dòng dự toán xem giao dịch, gán ngoài-DT, và nhóm vật tư thay thế cho định mức."
status: completed
priority: P2
effort: 25h
branch: main
tags: [du-an, ui, dinh-muc]
created: 2026-08-19
---

## Kết quả (2026-08-19)

Cả 6 phase hoàn thành; gates xanh (tsc, eslint, vitest 761/761, build). Review 7/10
DONE_WITH_CONCERNS — 2 major đã vá trước commit: (1) colSpan lệch cột subtotal DT Điều
Chỉnh; (2) memberCache không invalidate sau "Gán vào DT" (thêm onReassigned → clear).
Minor đã vá: đơn giá cho phép = 0 khi sửa nhanh. Deferred (ghi nhận): TOCTOU race gộp
nhóm (chấp nhận last-write-wins), prefilter nhóm theo hạng mục ở dialog, a11y aria-label.
Walkthrough dev: nhóm thử 2 dòng cát → rollup qty-basis + cờ đúng → đã dọn.

## Nguồn thiết kế

`plans/reports/brainstorm-260819-du-toan-hierarchy-substitute-groups.md` (4 quyết định đã chốt, không tranh luận lại).

## Phases

| # | Tên | Effort | Depends |
|---|-----|-------:|---------|
| 01 | B2 đối chiếu tên trong can-doi (mở rộng dòng, badge "tên khác DT", gán ngoài-DT) | 6h | — |
| 02 | Helper `category-tree` + du-toan-dieu-chinh grouped table (read-only, proof of pattern) | 3h | 01 (extract `normVtName`) |
| 03 | Rebuild tab Dự Toán thành lưới nhóm HM/section (giữ CrudDialog + ô sửa nhanh) | 4h | 02 |
| 04 | Phát sinh: cây tổng theo hạng mục trên đầu grid | 2h | 02 |
| 05 | v2 — `ProjectMaterialGroup` + 1 migration + UI gộp + lớp gộp trong dinh-muc & can-doi | 8h | 02 |
| 06 | Docs (quy ước nhóm thay thế, runbook gán ngoài-DT) + changelog + gates | 2h | 05 |

## Acceptance criteria (dev walkthrough MNTC-GD1, id=4)

1. Tab Dự Toán mở lên hiện HM1/HM2/HM3 → dưới mỗi HM là section VL/NC/Máy/CPC, subtotal cộng đúng tổng cha; % thị phần từng HM và toàn công trình khớp nhau.
2. DT Điều Chỉnh: cùng cấu trúc HM→section→dòng, cột (gốc / CO / điều chỉnh) khớp `vw_project_estimate_adjusted`.
3. Phát Sinh: cây tổng theo hạng mục ở trên grid; CO có `categoryId=null` gộp vào bucket "Chưa gán hạng mục".
4. Cân Đối, chế độ HĐ: bấm chevron dòng dự toán → hiện các giao dịch thuộc dòng (ngày, tên thương mại, HĐ, SL, ĐVT, tiền HĐ/TT); nếu tên giao dịch khác tên DT (kiểm tra token qua `normVtName`) hiện chip "tên khác DT".
5. Dòng "Ngoài DT" có nút "Gán vào dự toán…" → picker tìm kiếm; chọn xong: toàn bộ cụm cùng `(categoryId, itemCode)` chuyển sang mã của dòng đích, mỗi txn thêm note `"gán từ <old code>"`, revalidate; %HĐ dòng đích tăng tương ứng.
6. Sau v2: chọn nhiều dòng estimate → "Nhóm vật tư thay thế" → nhập tên + note; định mức tab dinh-muc hiện dòng nhóm (cờ nhóm chính) + dòng thành viên (cờ mờ); nếu `normVtName(unit)` các thành viên khác nhau, tuyến số/lượng bị suppress và chỉ hiện tiền.

## Cross-phase invariants

- `vw_project_norm` và `vw_project_estimate_adjusted` KHÔNG sửa. Mọi rollup nhóm là hậu xử lý TS.
- Pure helpers (`category-tree`, `material-group-rollup`, token-check) nằm ngoài file `"use server"` (giống `can-doi-metrics.ts`).
- Suppression contract: khi `normVtName(unit)` không thống nhất giữa các thành viên (nhóm) hoặc giữa txn↔estimate (unitMismatch), số/lượng và giá bq → `null`, chỉ hiển thị tiền. KHÔNG quy đổi đơn vị.
- Cờ định mức thành viên → làm mờ (opacity + text-muted-foreground), cờ nhóm là số duy nhất tính toán/cảnh báo.
- KHÔNG audit subsystem. Trace reassignment/nhóm-đổi = append `note`.
- Nhãn Vietnamese; giữ nguyên public API các service (chỉ additive: cột SQL mới, tham số optional, hàm mới).
- Không thêm dependency mới. Không sờ vào Item catalog.
- Commits: conventional, không tham chiếu AI.

## Ownership per phase (không phase nào edit cùng file)

- 01: `lib/du-an/can-doi-service.ts` (SQL mở rộng), `lib/du-an/can-doi-metrics.ts` (token check), `lib/du-an/txn-cluster-service.ts` (mới), `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx`, `lib/text/norm-vt-name.ts` (mới — extract), `lib/import/adapters/du-toan-tong-hop-vt.adapter.ts` (re-export shim).
- 02: `lib/du-an/category-tree.ts` (mới) + test; `app/(app)/du-an/[id]/du-toan-dieu-chinh/du-toan-dieu-chinh-client.tsx`.
- 03: `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx` (rebuild). CRUD service không đổi.
- 04: `app/(app)/du-an/[id]/phat-sinh/phat-sinh-client.tsx`; `lib/du-an/change-order-service.ts` (thêm getter aggregate optional).
- 05: `prisma/schema.prisma`, migration mới, `lib/du-an/material-group-service.ts` (mới), `lib/du-an/material-group-rollup.ts` (pure), `lib/du-an/norm-service.ts` (post-process add), `lib/du-an/can-doi-service.ts` (rollup mode tt-dt), `app/(app)/du-an/[id]/dinh-muc/dinh-muc-client.tsx`, `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx` (mode tt-dt group header).
- 06: `docs/system-architecture.md` (nếu section can-doi/dinh-muc), `docs/project-changelog.md`, `docs/code-standards.md` khi cần.

Phase 01 và 05 cùng sửa `lib/du-an/can-doi-service.ts` & `can-doi-vat-tu-client.tsx` — **05 chạy sau 01** (không song song). Phase 03 & 05 cùng chạm `du-toan-client.tsx`? Không — 05 chỉ đụng `dinh-muc-client` và `can-doi-vat-tu-client`.

## Test matrix

- Unit (pure helpers): `category-tree.test.ts` (HM1-VL, HM12-NC, HM01 degrade); `material-group-rollup.test.ts` (unit thống nhất/khác nhau → suppression); token-check trong `can-doi-metrics.test.ts`.
- Service (Prisma real DB): `txn-cluster-service.test.ts` (guard, batch update, note append).
- E2E manual walkthrough acceptance 1–6.

## Rollback

- Phase 01–04: no schema; revert commit đủ.
- Phase 05: migration drop `ProjectMaterialGroup` + cột `materialGroupId` (SetNull). Trước migrate: `pg_dump` `project_estimates`.

## Unresolved questions (cần user quyết trước Phase 05)

1. UI gộp đặt ở đâu: tab **dinh-muc** (đúng ngữ cảnh xem cờ) hay **can-doi** (đúng ngữ cảnh xem giá)? → Đề xuất: **dinh-muc**, vì nhóm sinh ra để tránh cờ đỏ giả; can-doi mode `tt-dt` chỉ đọc kết quả gộp.
2. Với dòng "Ngoài DT" có `itemCode` rỗng (nếu tồn tại) — cụm gán theo `(categoryId, itemCode)` sẽ vơ hết? Cần confirm data quality trước; nếu có, fallback = gán từng txn (v3).
3. Sau khi gộp, nếu member bị xóa (`softDelete`), có auto-remove khỏi nhóm hay giữ group chỉ hiện member còn sống? → Đề xuất: filter `deletedAt IS NULL` ở rollup.
