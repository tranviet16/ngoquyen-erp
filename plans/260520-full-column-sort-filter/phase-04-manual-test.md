---
phase: 4
title: Manual test
status: completed
priority: P2
effort: 2h
dependencies:
  - 2
  - 3
---

# Phase 4: Manual test

## Overview

Manual smoke 11 pages (7 master-data + 2 ledger * 2 sub-pages). Verify sort indicator hiện trên mọi data column, filter widget per kind hoạt động, FK sort/filter dropdown OK. Edge cases về URL round-trip, options cap, dropdown overflow.

## Requirements

- Functional: mỗi page test ≥3 scenarios (sort, filter, FK).
- Non-functional: chạy local prod build (`npm run build && npx next start -p 3001`) để tránh dev overlay nhiễu.

## Pages to test (11)

| # | URL | Type | FK columns |
|---|---|---|---|
| 1 | /master-data/entities | master | - |
| 2 | /master-data/suppliers | master | - |
| 3 | /master-data/contractors | master | - |
| 4 | /master-data/items | master | - |
| 5 | /master-data/projects | master | ownerInvestor |
| 6 | /master-data/du-an | master | ownerInvestor |
| 7 | /tai-chinh/vay | master | lender |
| 8 | /cong-no-vat-tu/so-du-ban-dau | ledger | entity, party, project |
| 9 | /cong-no-vat-tu/nhap-lieu | ledger | entity, party, project, item |
| 10 | /cong-no-nha-cung-cap/so-du-ban-dau | ledger | entity, party, project |
| 11 | /cong-no-nha-cung-cap/nhap-lieu | ledger | entity, party, project, item |

## Implementation Steps

1. Build prod: `npm run build && npx next start -p 3001` (detached PowerShell).
2. Per page, ghi nhận PASS/FAIL:
   - **Sort all columns**: click mỗi sort header → asc → desc → none. Indicator hiển thị đúng.
   - **Filter per kind**: text contains, number range, date range, select equals, FK dropdown.
   - **FK sort theo tên join**: ví dụ Project page, sort `ownerInvestor` → projects xếp theo tên entity alphabetical.
   - **URL round-trip** (master-data): `?sort=entity.name:desc` → reload → giữ sort, indicator hiển thị.
   - **Filter dropdown options ≤200**: nếu entity DB có 250 → dropdown chỉ hiện 200 đầu (verify console log nếu có).
   - **Search box + filter combine**: search "ABC" + filter status=active → AND, đúng row count.
   - **Inline edit không vỡ**: dblclick cell trong view đã sort/filter → save → row update + view giữ vị trí.
   - **Ledger add/delete row**: add row → insert vào full set, view auto-update; delete row trong view filtered → vẫn xóa đúng row.
3. Ghi report ngắn: `plans/260520-full-column-sort-filter/reports/manual-test.md`.

## Success Criteria

- [ ] 11/11 pages PASS sort + filter cơ bản.
- [ ] 4 FK columns (ownerInvestor x2, lender, ledger FK x ≥3) sort theo join.
- [ ] URL `?sort=entity.name:desc` round-trip trên ≥3 master-data pages có FK.
- [ ] 0 regression: edit/paste/add/delete vẫn OK trên ledger.
- [ ] Manual test report committed.

## Risk Assessment

- **Local-only test**: không chạy E2E automation — risk miss edge case. Mitigate: checklist cứng + screenshot khi gặp lỗi.
- **Browser cache**: clear hoặc dùng incognito để verify SSR sort indicator.
- **Filter dropdown UX với >200 options**: nếu user query >200, future TODO. Document.
