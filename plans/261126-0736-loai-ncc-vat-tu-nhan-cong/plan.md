---
title: "Loại NCC (vật tư / nhân công)"
description: "Thêm trường Loại cho NCC, lọc báo cáo công nợ vật tư theo loại và cho đề nghị thanh toán nhân công dùng đúng sổ, không dời dòng sổ nào."
status: in-progress
priority: P2
effort: 3d
branch: main
tags: [feature, database, frontend, backend]
blockedBy: []
blocks: []
created: 2026-11-26
---

# Loại NCC (vật tư / nhân công)

## Overview

Thêm trường Loại cho NCC, lọc báo cáo công nợ vật tư theo loại và cho đề nghị thanh toán nhân công dùng đúng sổ, không dời dòng sổ nào. Quyết định và bằng chứng: [brainstorm](../reports/brainstorm-261126-1433-loai-ncc-vat-tu-nhan-cong.md). Repo công khai: chỉ ghi `NCC #id`, không ghi tên hay số tiền.

## Hợp đồng

- **Kết quả:** admin đặt hoặc đổi Loại NCC (vật tư / nhân công); báo cáo công nợ vật tư lọc được theo loại; đề nghị thanh toán dòng nhân công gợi ý NCC loại nhân công và tự điền công nợ từ đúng sổ.
- **Ràng buộc:** không dời dòng sổ, không chạm kỳ đối chiếu đã ký; migration chỉ thêm cột có mặc định; backup trước mọi thay đổi CSDL; chỉ admin đổi loại; production (`ngoquyen-bansao-pg`, 5433) không chạm trong plan này.
- **Không làm:** gộp NCC trùng; chuyển NCC thành tổ đội; sửa module Công nợ nhân công; lịch sử tên pháp nhân; mở quyền cho vai trò khác admin; triển khai production.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Loại NCC trong CSDL và danh mục](./phase-01-loai-ncc-trong-danh-muc.md) | Pending |
| 2 | [Lọc theo loại ở báo cáo công nợ vật tư](./phase-02-loc-theo-loai-bao-cao-cong-no.md) | Pending |
| 3 | [Thanh toán dòng nhân công](./phase-03-thanh-toan-nhan-cong.md) | Pending |
| 4 | [Nghiệm thu trên bản dev và tài liệu](./phase-04-nghiem-thu-tren-ban-dev.md) | Pending |

Phase 2 và 3 cùng phụ thuộc phase 1 và không sửa chung file; phase 4 chạy sau cùng.

Bốn phase vì có ba bề mặt tách biệt (danh mục, báo cáo, thanh toán) cộng một bước nghiệm thu trên dữ liệu thật của bản dev.

## Success Criteria

- [ ] Trên `ngoquyen-dev-pg`, đổi NCC #67, #68, #69 sang nhân công: tổng công nợ "Tất cả" không đổi, tổng "Vật tư" + "Nhân công" bằng tổng "Tất cả", kỳ đối chiếu #696–#699 giữ nguyên `signedSnapshotJson`.
- [ ] Đổi ngược về vật tư: mọi màn hình như trước.
- [ ] Bộ lọc loại không có NCC nào trả về rỗng, không trả về toàn bộ.
- [ ] Tự điền công nợ dòng thanh toán nhân công không còn đọc sổ `labor` bằng id NCC (có test).
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:integration` xanh.

## Dependencies

- Không phụ thuộc plan khác. Phải theo `.gitattributes` (migration SQL giữ LF).

## Validation Log

### Session 1 — 26/11/2026

1. Đóng đợt thanh toán, dòng nhân công ghi trừ công nợ vào sổ vật tư? → **Có** (phải chọn công trình, chịu khóa kỳ). Áp vào phase 3, 4.
2. Gợi ý NCC trong đề nghị thanh toán lọc theo loại? → **Lọc cả hai chiều**, "bỏ qua lọc" vẫn chọn mọi NCC. Áp vào phase 3, 4.
3. Tách tổng trên báo cáo? → **Chỉ bộ lọc Loại**, mặc định "Tất cả", không thêm tổng phụ. Áp vào phase 2.

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier)
- **Claims checked:** 42 (38 đường dẫn file, 4 giao diện đổi)
- **Verified:** 42 | **Failed:** 0 | **Unverified:** 0
- Đã sửa trong lúc kiểm: client thanh toán có 16 chỗ so `"vat_tu"` ở hai component (ban đầu ghi 4); thêm `review-db-facts.ts:88` vào phase 3.
- `DetailReportFilters.partyIds`: 7 nơi gọi `queryDetailReport`, đều tương thích (trường tùy chọn).

### Whole-Plan Sweep
- Các delta (đóng đợt ghi sổ, lọc hai chiều, chỉ bộ lọc) đã đồng bộ ở phase 2, 3, 4; không còn chỗ ghi "chờ xác nhận".
