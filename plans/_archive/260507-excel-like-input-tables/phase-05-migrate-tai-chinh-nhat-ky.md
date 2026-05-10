---
phase: 5
title: "Migrate Tai Chinh Nhat Ky (replace AG Grid)"
status: pending
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 5: Migrate Tai Chinh Nhat Ky

## Overview

Replace AG Grid (`components/tai-chinh/journal-grid-client.tsx`) bằng `<DataGrid>` từ Phase 1. Cleanup AG Grid module registration đã thêm trước đó. Xóa dep AG Grid sẽ làm ở Phase 6.

## Requirements

**Functional:**
- CRUD journal entries (date, entryType, amountVnd, fromAccount, toAccount, description, note, expenseCategory, refModule, refId)
- FK select: expenseCategory
- Existing CrudDialog cho create/update entry — quyết định: giữ dialog hay inline edit?
  - Recommend: **inline edit cho field đơn giản** (date, amount, note), **dialog cho complex create** (entryType + ref linkage)
- Soft delete qua `softDeleteJournalEntry`

**Non-functional:**
- Service `lib/tai-chinh/journal-service.ts` không đổi interface, chỉ thêm `bulkUpsertJournalEntries` cho paste

## Architecture

```
app/(app)/tai-chinh/nhat-ky/page.tsx (không đổi nhiều)
  └─ <JournalGridClient> (re-implement bằng <DataGrid>)
       ├─ <DataGrid<JournalRow>>
       │    ├─ columns: 11 cột
       │    └─ handlers → journal-service actions
       └─ <CrudDialog> (giữ cho create complex)
```

## Related Code Files

**Modify:**
- `components/tai-chinh/journal-grid-client.tsx` — rewrite dùng `<DataGrid>`, bỏ `AgGridReact`, bỏ `ModuleRegistry.registerModules`

**Add to service:**
- `lib/tai-chinh/journal-service.ts` — `bulkUpsertJournalEntries(rows)`

**Keep:**
- `app/(app)/tai-chinh/nhat-ky/page.tsx` — không đổi
- `components/master-data/crud-dialog.tsx` — vẫn dùng cho create complex

**Delete (Phase 6):**
- AG Grid imports và `ModuleRegistry.registerModules` từ file này

## Implementation Steps

1. Đọc lại `components/tai-chinh/journal-grid-client.tsx` đầy đủ
2. Map columns:
   - `date`: kind=date
   - `entryType`: kind=select (enum)
   - `amountVnd`: kind=currency
   - `fromAccount`, `toAccount`: kind=text
   - `description`, `note`: kind=text
   - `expenseCategory.id`: kind=select (FK)
   - `refModule`, `refId`: readonly (system-managed)
3. Replace `<AgGridReact ... />` block bằng `<DataGrid<JournalRow>>`:
   - handlers map sang existing actions
4. Bỏ:
   ```ts
   import { ModuleRegistry, AllCommunityModule, ... } from "ag-grid-community";
   import { AgGridReact } from "ag-grid-react";
   ModuleRegistry.registerModules([AllCommunityModule]);
   ```
5. Thêm `bulkUpsertJournalEntries` vào service
6. Test: edit, add (qua dialog), paste range, delete

## Success Criteria

- [ ] `/tai-chinh/nhat-ky` không còn dùng AG Grid, render `<DataGrid>`
- [ ] CRUD hoạt động đúng như trước
- [ ] Permission admin/kế toán giữ nguyên behavior
- [ ] Bundle giảm sau khi xóa AG Grid (verify ở Phase 6)
- [ ] Không regression ở `/tai-chinh/bao-cao-thanh-khoan` hoặc reports khác phụ thuộc journal

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `entryType` enum complex (chuyển khoản, thu, chi, ...) cần validate from/to account theo type | Validation ở server action giữ nguyên; client UI hint qua tooltip |
| `expenseCategory` chỉ valid với một số entryType | Conditional readonly cho cell theo entryType của row |
| `refModule`/`refId` từ auto-link với module khác | Giữ readonly, không cho edit qua grid |
| Migration window: nếu Phase 5 chưa xong mà Phase 6 cleanup → vỡ | Phase 6 chỉ start sau khi Phase 5 done |

## Dependencies

Blocked by Phase 1. Song song được với Phase 2, 3, 4.
