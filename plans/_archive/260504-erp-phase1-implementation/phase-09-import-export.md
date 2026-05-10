---
phase: 9
title: "Excel Import (one-shot) + Export (PDF/Excel)"
status: pending
priority: P1
effort: "1w"
dependencies: [8]
---

# Phase 9: Excel Import + Export

## Overview
Hai mục tiêu: (1) one-shot migration toàn bộ data lịch sử từ 6 file Excel SOP vào DB; (2) Export báo cáo ra file Excel (mẫu giống Excel cũ) + PDF.

## Requirements
**Functional - Import:**
- Trang admin `/admin/import` upload file Excel
- Validation per-sheet trước khi commit (dry-run mode)
- Mapping NCC/Item bị ambiguous → UI cho admin pick
- Idempotent: chạy lại không tạo trùng
- Logs chi tiết (rows imported, skipped, errors)

**Functional - Export:**
- Mỗi báo cáo có nút "Xuất Excel" / "Xuất PDF"
- Excel output dùng template giống Excel gốc (giữ tên cột, có header, footer total)
- PDF dùng cho Đối chiếu công nợ + Báo cáo tháng (in ra để ký)

**Non-functional:**
- Import 6 file Excel (~50k row tổng) hoàn thành <5 phút
- Export Excel <3s với 10k row

## Architecture
**Import pipeline:**
```
upload .xlsx → SheetJS parse → per-sheet adapter → Zod validate
            → conflict resolution UI (if needed)
            → DB insert in transaction (per-sheet)
            → audit log + import log
```

**Per-file adapter:**
```ts
// lib/import/adapters/{file-name}-adapter.ts
interface ImportAdapter {
  fileName: string
  parse(buffer: Buffer): ParsedData
  validate(data): ValidationResult
  resolveConflicts(data, mappings): ResolvedData
  apply(data, prisma): Promise<ImportSummary>
}
```

**Adapters cần build (6):**
1. `gach-nam-huong.adapter.ts` → `SupplierDeliveryDaily` (supplierId = lookup "Nam Hương")
2. `quang-minh.adapter.ts` → `SupplierDeliveryDaily` (supplierId = lookup "Quang Minh")
3. `cong-no-vat-tu.adapter.ts` → `LedgerTransaction (material)` + `LedgerOpeningBalance` + Cài Đặt → master data
4. `du-an-xay-dung.adapter.ts` → 9 model dự án; phải tạo 1 `Project` mặc định nếu chưa có
5. `sl-dt.adapter.ts` → `SlDtTarget` + `PaymentSchedule` (parse các sheet "Chỉ tiêu")
6. `tai-chinh-nq.adapter.ts` → `LoanContract` + `LoanPayment` + `JournalEntry` + `ExpenseCategory`

**Export:**
- `lib/export/excel-exporter.ts` (SheetJS write) — generic builder + per-report templates
- `lib/export/pdf-exporter.ts` (Puppeteer render HTML → PDF) — re-use list view HTML với print CSS

## Related Code Files
**Create:**
- `lib/import/import-engine.ts`
- `lib/import/adapters/{6 adapters}.ts`
- `lib/import/conflict-resolver.ts`
- `app/(app)/admin/import/page.tsx`
- `app/(app)/admin/import/[runId]/page.tsx` (logs viewer)
- `lib/export/excel-exporter.ts`
- `lib/export/pdf-exporter.ts`
- `lib/export/templates/{report-name}.ts` (~6 templates)
- `app/api/export/excel/route.ts`
- `app/api/export/pdf/route.ts`
- Components: nút "Xuất Excel"/"Xuất PDF" trong các báo cáo

## Implementation Steps
1. Build `import-engine` skeleton (upload → parse → validate → preview → commit)
2. Build adapter Vật tư NCC (đơn giản nhất) — test end-to-end
3. Build adapter Công nợ Vật tư + Cài Đặt master data
4. Build adapter Dự án (lớn nhất, 9 model)
5. Build adapter SL/DT
6. Build adapter Tài chính NQ
7. UI conflict resolver (table với dropdown mapping)
8. Build excel-exporter generic + 6 templates
9. Build pdf-exporter (Puppeteer trong Docker — cần thêm Chromium)
10. Integrate nút export vào tất cả báo cáo
11. Run full import trên 6 file thật → verify số row + spot-check vài record

## Success Criteria
- [ ] 6 adapter import 100% data Excel mẫu, error log rõ ràng
- [ ] Idempotent: chạy lại không tạo trùng (test bằng chạy 2 lần liên tiếp)
- [ ] Tổng cộng nhập ≥50k row qua import flow
- [ ] Export Excel báo cáo Tổng Hợp Công Nợ → file mở được, format giống Excel gốc
- [ ] Export PDF Đối Chiếu Công Nợ → in ra giấy đẹp, có chỗ ký
- [ ] Performance: import full <5 phút, export <3s với 10k row

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Excel có merged cells, formula → SheetJS parse khó | Pre-process file trong adapter, dùng `data_only: true` để lấy computed values |
| NCC tên viết khác nhau qua các sheet | Conflict resolver UI bắt buộc admin map; lưu mapping vào DB để chạy lại auto |
| Chromium trong Docker nặng (~200MB image) | Multi-stage Dockerfile; OK vì chỉ chạy nội bộ |
| Import lỗi giữa chừng → DB inconsistent | Mỗi sheet chạy trong 1 transaction; log run_id cho rollback thủ công nếu cần |
| User edit Excel sau khi đã import | Phase 1: admin chịu trách nhiệm; cảnh báo "đã import file này tại {date}, vẫn tiếp tục?" |
