---
title: "Báo cáo tháng Công nợ — pivot theo SOP Excel"
status: pending
priority: P1
created: 2026-05-07
scope: project
blockedBy: []
blocks: []
---

# Báo cáo tháng Công nợ — pivot theo SOP Excel

## Problem

Báo cáo tháng tại `cong-no-vt/bao-cao-thang` và `cong-no-nc/bao-cao-thang` lệch SOP Excel:
- **Sai trục**: pivot tháng×năm thay vì NCC/Đội × 1 tháng đã chọn
- **Cuối Kỳ sai math**: `lay_hang − thanh_toan + dieu_chinh` (chỉ ra biến động trong kỳ, không cộng đầu kỳ)
- **Thiếu cột Đầu Kỳ**: query trả 0, không carry-forward
- **Thừa cột Điều chỉnh**: SOP gộp dieu_chinh vào lay_hang/thanh_toan theo dấu

## Goal

Refactor toàn bộ Báo cáo tháng (page + service + query + UI + Excel export) khớp 100% SOP `Quản Lý Công Nợ Vật Tư.xlsx` sheet `Báo Cáo Tháng`.

## Decisions (chốt từ brainstorm)

1. **Phương án A**: pivot supplier/đội × 1 tháng (full refactor)
2. Auto-select chủ thể đầu tiên có giao dịch khi `entityId` không có trong query string
3. Bỏ hẳn cột "Điều chỉnh" khỏi UI và Excel export — gộp dấu dương → lay_hang, |âm| → thanh_toan
4. **Replace fully** (không giữ dual-type): xoá `MonthlyReportRow` cũ, thay bằng `MonthlyByPartyRow`
5. Excel export cũng refactor theo SOP (1 sheet 1 tháng, cột STT/NCC/8 cột số/dòng tổng)

## Phases

| Phase | Title | Priority | Effort | Status |
|-------|-------|----------|--------|--------|
| 1 | Backend: types + queryMonthlyByParty | P1 | 2h | pending |
| 2 | Service layer: getXxxMonthlyReport(year, month, entityId) | P1 | 1h | pending |
| 3 | Page wiring: month picker + auto-select entity | P1 | 1.5h | pending |
| 4 | UI refactor: MonthlyReport component (10 cột + dòng tổng) | P1 | 2h | pending |
| 5 | Excel export refactor + smoke verify with real data | P2 | 1.5h | pending |

## Research

- [researcher-01-dieu-chinh-signs.md](./research/researcher-01-dieu-chinh-signs.md) — sign convention confirmed (raw)
- [researcher-02-monthly-report-consumers.md](./research/researcher-02-monthly-report-consumers.md) — full consumer map

## Risks

1. **Quy ước dấu `dieu_chinh` data thực** có thể không tuân thủ — Phase 5 phải `psql` verify trước khi ship
2. **Excel export `buildCongNoMonthlyExcel` gọi `queryMonthlyReport` trực tiếp** (bypass service) — phase 5 phải sync
3. **Breaking change `getXxxMonthlyReport` signature** — đảm bảo cả 2 page (vt + nc) update cùng commit

## Success Criteria

- [ ] Mở `/cong-no-vt/bao-cao-thang` thấy bảng pivot NCC × 1 tháng, 10 cột khớp SOP
- [ ] Mở `/cong-no-nc/bao-cao-thang` tương tự với Đội thi công
- [ ] Cuối Kỳ = Đầu Kỳ + PS Phải Trả − PS Đã Trả (verified bằng 1 case có opening balance + dieu_chinh)
- [ ] Auto-select chủ thể đầu tiên khi không có entityId trong URL
- [ ] Excel export ra file 1 sheet, layout khớp SOP
- [ ] `npx tsc --noEmit` clean
- [ ] Không còn reference đến `MonthlyReportRow` (xóa hết)
