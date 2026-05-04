---
phase: 3
title: "Module: Quản lý Dự án Xây dựng"
status: pending
priority: P1
effort: "3w"
dependencies: [2]
---

# Phase 3: Module Quản lý Dự án Xây dựng

## Overview
Module lớn nhất với 9 sub-feature mapping từ 12 sheet Excel: tiến độ, nghiệm thu, dự toán + dự toán điều chỉnh (CO), định mức, giao dịch, phát sinh, hợp đồng, dòng tiền 3 bên (CĐT-Cty-Đội), dashboard.

## Requirements
**Functional:**
- Mỗi dự án có 9 tab tương ứng 9 sub-feature
- Sub-feature dùng grid Excel-like (AG Grid) cho data entry
- Tự động tính: % hoàn thành tiến độ, biến động dự toán vs CO, % đã dùng định mức + cờ cảnh báo theo ngưỡng vàng/đỏ
- Dashboard dự án: tóm tắt tiến độ, dự toán vs thực tế, công nợ, dòng tiền 3 bên

**Non-functional:**
- AG Grid virtual scroll cho >1000 row
- Tính toán phái sinh nên làm view DB (Postgres) thay vì code TS

## Architecture
**Schema:**
```prisma
model ProjectSchedule {            // Tiến Độ
  id           Int @id @default(autoincrement())
  projectId    Int
  categoryId   Int                 // → ProjectCategory
  taskName     String
  planStart    DateTime
  planEnd      DateTime
  actualStart  DateTime?
  actualEnd    DateTime?
  pctComplete  Decimal @default(0) @db.Decimal(5,4)
  status       String              // "pending|in_progress|done|delayed"
  note         String?
  // generated columns: planDuration, actualDuration, lateDays
}

model ProjectAcceptance {          // Nghiệm Thu
  id, projectId, categoryId, checkItem, planEnd, actualEnd,
  inspector, result, defectCount, fixRequest, acceptedAt,
  amountCdtVnd Decimal @db.Decimal(18,2),  // SL NT CĐT
  amountInternalVnd Decimal @db.Decimal(18,2),  // SL NT nội bộ
  acceptanceBatch String           // "Đợt 1"
  note String?
}

model ProjectEstimate {            // Dự Toán gốc
  id, projectId, categoryId, itemCode, itemName, unit,
  qty Decimal @db.Decimal(18,4),
  unitPrice Decimal @db.Decimal(18,2),
  totalVnd Decimal @db.Decimal(18,2),  // generated: qty * unitPrice
  note String?
}

model ProjectChangeOrder {         // Phát Sinh / CO
  id, projectId, date, coCode, description, reason,
  categoryId, itemCode,            // null nếu PS mới hoàn toàn
  costImpactVnd Decimal,
  scheduleImpactDays Int,
  approvedBy String,
  status String,                   // "pending|approved|rejected"
  newItemName String?, newUnit String?, newQty Decimal?, newUnitPrice Decimal?,
  note String?
}

model ProjectNorm {                // Theo Dõi Định Mức (computed view)
  // Materialized view: estimate + actual transactions → KL còn lại, % đã dùng, biến động, cờ
}

model ProjectTransaction {         // Giao Dịch dự án
  id, projectId, date, transactionType, // "lay_hang|nhan_cong|may_moc"
  categoryId, itemCode, itemName, partyName,
  qty Decimal, unit String,
  unitPriceHd Decimal, unitPriceTt Decimal,
  amountHd Decimal, amountTt Decimal,
  invoiceNo String?, status String, note String?
}

model ProjectContract {            // Hợp Đồng + Giấy Phép
  id, projectId, docName, docType,    // "contract|license"
  partyName, valueVnd Decimal?,
  signedDate DateTime?, expiryDate DateTime?,
  status String, storage String, note String?
}

model Project3WayCashflow {         // Dòng Tiền 3 Bên
  id, projectId, date,
  flowDirection String,            // "cdt_to_cty|cty_to_doi|doi_to_cty|cty_to_cdt|..."
  category String,                 // "tam_ung|nop_lai|thanh_toan|..."
  payerName String, payeeName String,
  amountVnd Decimal, batch String, refDoc String?, note String?
}

model ProjectSettings {            // Cài Đặt per-project
  projectId Int @id, vatPct Decimal, normYellowThreshold Decimal,
  normRedThreshold Decimal, contractWarningDays Int,
  managementFeePct Decimal,        // % Phí QL giao khoán
  teamSharePct Decimal             // % đội nhận
}
```

**UI structure:**
```
/du-an
├── page.tsx                       ← list dự án
└── [id]/
    ├── page.tsx                   ← dashboard
    ├── tien-do/page.tsx
    ├── nghiem-thu/page.tsx
    ├── du-toan/page.tsx
    ├── du-toan-dieu-chinh/page.tsx  ← view: estimate + CO
    ├── dinh-muc/page.tsx          ← view: norm
    ├── giao-dich/page.tsx
    ├── phat-sinh/page.tsx         ← CRUD ProjectChangeOrder
    ├── hop-dong/page.tsx
    ├── dong-tien-3-ben/page.tsx
    └── cai-dat/page.tsx
```

**Materialized views** (refresh on transaction commit hoặc nightly):
- `vw_project_norm`: tính KL thực tế từ ProjectTransaction GROUP BY itemCode → so với ProjectEstimate → biến động + cờ
- `vw_project_estimate_adjusted`: ProjectEstimate LEFT JOIN ProjectChangeOrder

## Related Code Files
**Create:**
- `prisma/schema.prisma` (mở rộng)
- `prisma/migrations/...` (migrations + raw SQL cho views)
- `lib/du-an/*-service.ts` (9 service files, mỗi cái <200 dòng)
- `lib/du-an/norm-calculator.ts` (logic cờ vàng/đỏ)
- `app/(app)/du-an/page.tsx`
- `app/(app)/du-an/[id]/layout.tsx` (tab nav)
- `app/(app)/du-an/[id]/{page,tien-do,nghiem-thu,du-toan,du-toan-dieu-chinh,dinh-muc,giao-dich,phat-sinh,hop-dong,dong-tien-3-ben,cai-dat}/page.tsx`
- `components/du-an/*-grid.tsx` (AG Grid wrappers per sub-feature)
- `components/ag-grid-base.tsx` (shared AG Grid setup, Vietnamese locale, currency formatter)

## Implementation Steps
1. Schema migration cho 9 model + 2 view (raw SQL)
2. AG Grid base component: license-free Community, server-side row model, Vietnamese number formatter
3. Build từ đơn giản → phức tạp:
   - Tiến Độ → Hợp Đồng → Cài Đặt (ít logic)
   - Nghiệm Thu → Dự Toán → Giao Dịch (CRUD đơn thuần)
   - Phát Sinh (CO) → Dự Toán Điều Chỉnh (view)
   - Định Mức (view + cờ logic)
   - Dòng Tiền 3 Bên (chiều giao dịch + tổng hợp 3 bên)
   - Dashboard (aggregate query)
4. Trigger refresh materialized view sau mỗi mutation Transaction/CO/Estimate
5. Per-page test: insert ≥10 row qua grid, edit, delete, verify formula
6. So sánh số liệu Định Mức + Dòng Tiền 3 Bên với Excel mẫu

## Success Criteria
- [ ] 9 tab dự án CRUD đầy đủ qua AG Grid
- [ ] % hoàn thành, biến động dự toán, cờ cảnh báo định mức tính đúng so với Excel mẫu
- [ ] Dashboard load <2s với 1 dự án có 5000 transaction
- [ ] Cảnh báo hợp đồng <90 ngày hiển thị
- [ ] Tổng hợp 3 bên (CĐT/Cty/Đội) khớp 100% với Excel "Dòng Tiền 3 Bên"

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Materialized view refresh chậm với data lớn | Phase 1 chấp nhận; Phase 2 chuyển sang incremental update qua trigger |
| AG Grid Community thiếu feature (vd master-detail) | Dùng row expansion thủ công; nếu cần thật → cân nhắc Enterprise (paid) |
| Logic CO phức tạp (PS mới vs điều chỉnh hiện có) | Tách rõ 2 case bằng `categoryId IS NULL`; viết test riêng |
| Vietnamese number format gây nhầm (1.000 vs 1,000) | Setup global locale `vi-VN`, lock decimal separator |
