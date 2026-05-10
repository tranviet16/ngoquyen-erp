---
phase: 6
title: "Module: Công nợ Nhân công (reuse LedgerService)"
status: completed
implemented: "2026-05-04"
priority: P1
effort: "0.5w"
dependencies: [5]
---

# Phase 6: Module Công nợ Nhân công

## Overview
Clone Module Công nợ Vật tư, đối tượng = Contractor (đội thi công) thay vì Supplier. Tận dụng `LedgerService` đã build ở Phase 5 với `ledgerType='labor'`.

## Requirements
**Functional:** Giống hệt Phase 5, chỉ khác:
- `partyId` trỏ tới `Contractor` thay vì `Supplier`
- Master data dropdown lấy từ `contractors`
- Item type filter mặc định `labor` + `machine` (loại trừ material)
- Tên hiển thị: "Đội thi công" / "Nhà thầu phụ" thay vì "Nhà cung cấp"

**Non-functional:** Re-use 100% `LedgerService` engine. Chỉ tạo wrapper và UI mới.

## Architecture
**Schema:** Không thêm bảng mới (dùng `LedgerTransaction` + `LedgerOpeningBalance` của Phase 5 với `ledgerType='labor'`). Có thể cần thêm 1 polymorphic helper view:
```sql
CREATE VIEW vw_ledger_party AS
  SELECT lt.*, s.name AS party_name FROM ledger_transactions lt
  JOIN suppliers s ON lt.party_id = s.id WHERE ledger_type = 'material'
  UNION ALL
  SELECT lt.*, c.name AS party_name FROM ledger_transactions lt
  JOIN contractors c ON lt.party_id = c.id WHERE ledger_type = 'labor';
```

**Service:**
```ts
// lib/cong-no-nc/labor-ledger-service.ts
export const laborLedger = new LedgerService('labor');
```

**UI:** Mirror Phase 5 structure tại `/cong-no-nc/...`. Dùng lại 90% component qua props (`ledgerType`, party label, party fetcher).

## Related Code Files
**Create:**
- `lib/cong-no-nc/labor-ledger-service.ts`
- `app/(app)/cong-no-nc/{page,nhap-lieu,so-du-ban-dau,bao-cao-thang,chi-tiet}/page.tsx`

**Modify (refactor for reuse):**
- `components/cong-no-vt/transaction-grid.tsx` → rename `components/ledger/transaction-grid.tsx`, accept `ledgerType` + `partyOptionsLoader` props
- `components/cong-no-vt/debt-matrix.tsx` → `components/ledger/debt-matrix.tsx`
- `components/cong-no-vt/monthly-report.tsx` → `components/ledger/monthly-report.tsx`
- Update Phase 5 pages import paths

## Implementation Steps
1. Refactor 3 component từ `cong-no-vt/` sang `ledger/` với props ledgerType + partyLabel + partyLoader
2. Update Phase 5 imports + smoke test Phase 5 still works
3. Tạo `labor-ledger-service.ts` wrapper
4. Tạo 5 page `/cong-no-nc/*` dùng shared component
5. Tạo view `vw_ledger_party`
6. Test với data mẫu: tạo 10 giao dịch nhân công, verify summary + matrix

## Success Criteria
- [ ] Module Công nợ Vật tư vẫn chạy đúng sau refactor
- [ ] Module Công nợ Nhân công CRUD đầy đủ
- [ ] Cùng 1 codebase grid render được cả 2 ledger type
- [ ] Báo cáo tháng + matrix khớp expected output

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Refactor làm vỡ Phase 5 | Smoke test full Phase 5 ngay sau refactor; revert nếu lỗi |
| Polymorphic FK (party_id pointing to 2 tables) | Phase 1: không enforce DB FK, validate ở app layer; Phase 2 mới chuẩn hóa |
