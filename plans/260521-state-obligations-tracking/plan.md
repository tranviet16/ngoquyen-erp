---
title: "Module Nghĩa vụ với Nhà nước (thuế, BHXH)"
status: completed
priority: P2
created: 2026-05-21
completed: 2026-05-21
planDir: plans/260521-state-obligations-tracking
blockedBy: []
blocks: []
---

# Module "Nghĩa vụ với Nhà nước"

Theo dõi nghĩa vụ thuế / bảo hiểm với nhà nước theo mô hình **đầu kỳ → phát sinh tăng/giảm → cuối kỳ**.
Toàn công ty (không entityId/projectId). Số dư đầu/cuối kỳ luôn derived — không lưu, không lệch.

Context: [reports/brainstorm-summary.md](reports/brainstorm-summary.md)

## Kiến trúc chốt

- **2 bảng mới:** `StateObligationType` (danh mục seed sẵn, sửa được) + `StateObligationTxn` (sổ phát sinh).
- **Công thức:** `còn phải nộp = openingBalance + Σ phai_tra(date≤asOf) − Σ da_nop(date≤asOf)` — tái dùng pattern `lib/ledger/balance-service.ts`.
- **Liên kết tiền:** dòng `da_nop` tự sinh 1 `JournalEntry` (`entryType="chi"`, `refModule="state_obligation"`, `refId=txn.id`); sửa/xóa đồng bộ trong transaction. `phai_tra` không sinh bút toán.
- **3 trang UI** dưới `/tai-chinh/nghia-vu-nha-nuoc/`; thêm nav item ở `/tai-chinh/page.tsx`.
- **ACL:** tái dùng module key `"tai-chinh"` (`requireRoleModuleAccess`).

## Phases

| # | Phase | Status | Priority | Mô tả |
|---|-------|--------|----------|-------|
| 1 | [Schema + Migration](phase-01-schema-migration.md) | completed | P1 | 2 model Prisma + migration + `prisma generate` |
| 2 | [Service layer](phase-02-service-layer.md) | completed | P1 | `state-obligation-service.ts` — CRUD + balance + JournalEntry sync |
| 3 | [UI Danh mục](phase-03-ui-danh-muc.md) | completed | P2 | Trang `/danh-muc` — lưới danh mục nghĩa vụ |
| 4 | [UI Sổ theo dõi](phase-04-ui-so-theo-doi.md) | completed | P2 | Trang `/so-theo-doi` — lưới phát sinh, dán hàng loạt |
| 5 | [UI Báo cáo + nav](phase-05-ui-bao-cao.md) | completed | P2 | Trang `/bao-cao` — bảng tổng hợp Tháng/Quý/Năm + nav item |
| 6 | [Seed dữ liệu](phase-06-seed.md) | completed | P3 | Seed 8 nghĩa vụ chuẩn VN |
| 7 | [Tests](phase-07-tests.md) | completed | P2 | Unit test service: balance, kỳ, đồng bộ JournalEntry |

## Dependencies

- Phase 1 → 2 → (3, 4, 5) → 6. Phase 7 sau Phase 2 (test service), bổ sung sau mỗi UI phase.
- Phase 6 (seed) cần Phase 1 (model) — chạy được độc lập với UI.
- Tái dùng có sẵn: DataGrid + ResourceSpec (`components/data-grid/`), `formatVND` (`lib/utils/format`), pattern `components/ledger/monthly-report.tsx`, pattern `lib/tai-chinh/journal-service.ts`.

## Success criteria

- Tạo/sửa danh mục nghĩa vụ; seed 8 mục chuẩn VN OK.
- Nhập phát sinh `phai_tra` & `da_nop`; dán hàng loạt OK.
- Báo cáo Tháng/Quý/Năm: `đầu kỳ + tăng − giảm = cuối kỳ` khớp; gộp tổng theo nhóm đúng.
- Mỗi `da_nop` sinh đúng 1 bút toán chi; sửa/xóa đồng bộ; cashflow không đếm trùng.
- `npx tsc --noEmit` + lint + `vitest` xanh.

## Ngoài phạm vi (YAGNI)

GL đầy đủ + bút toán kép; phân bổ dự án/chủ thể; lịch nhắc hạn nộp; import Excel (hạ tầng `ImportRun` sẵn cho sau).
