---
phase: 2
title: "Service layer"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
completed: 2026-05-21
---

# Phase 2: Service layer

## Overview
`state-obligation-service.ts` — server actions CRUD cho danh mục + sổ phát sinh, hàm tính số dư theo kỳ, đồng bộ `JournalEntry` cho dòng `da_nop`.

## Requirements
- Functional: CRUD `StateObligationType` + `StateObligationTxn`; tính `còn phải nộp`/đầu kỳ/cuối kỳ; tạo `da_nop` → sinh bút toán chi; sửa/xóa `da_nop` → đồng bộ bút toán.
- Non-functional: server action (`"use server"`), `requireRoleModuleAccess(role, "tai-chinh", "edit"|"admin")`, mọi thao tác đồng bộ JournalEntry bọc trong `prisma.$transaction`, `revalidatePath`.

## Architecture

Đặt trong **1 file** `lib/tai-chinh/state-obligation-service.ts` (giữ <200 dòng — nếu vượt, tách `state-obligation-balance.ts` cho phần tính kỳ). Theo pattern `lib/tai-chinh/journal-service.ts`: `getRole()` helper, input interface, `revalidatePath`.

### Công thức số dư (pattern `balance-service.ts`)
```
còn phải nộp tại asOf = openingBalance + Σ phai_tra(date≤asOf) − Σ da_nop(date≤asOf)
Đầu kỳ N  = còn phải nộp ngay trước ngày bắt đầu kỳ N
Cuối kỳ N = Đầu kỳ N + Σ phai_tra(trong kỳ N) − Σ da_nop(trong kỳ N)
```
1 `$queryRaw` gộp tất cả nghĩa vụ: `SUM(amount) FILTER (WHERE kind='phai_tra' AND date BETWEEN...)`. `deletedAt IS NULL`.

### Đồng bộ JournalEntry (rủi ro chính)
- **Nguồn sự thật = `StateObligationTxn`.** `JournalEntry` là phái sinh.
- Tạo `da_nop` (trong `$transaction`):
  1. `prisma.journalEntry.create` — `date=txn.date`, `entryType="chi"`, `costBehavior="variable"`, `amountVnd=amount`, `fromAccountId=cashAccountId`, `fromAccount=` tên account (resolve), `refModule="state_obligation"`, `refId=` (set sau khi có txn.id), `description="Nộp <tên nghĩa vụ>"`.
  2. `prisma.stateObligationTxn.create` với `journalEntryId`.
  3. Cập nhật `journalEntry.refId = txn.id`.
- Sửa `da_nop`: cập nhật cả txn + bút toán liên kết (`amountVnd`, `date`, `fromAccountId`) trong `$transaction`. Nếu `kind` đổi `da_nop→phai_tra`: soft-delete bút toán, gỡ `journalEntryId`.
- Xóa `da_nop`: soft-delete txn **và** bút toán liên kết trong `$transaction`.
- `phai_tra`: không đụng `JournalEntry`.

## Related Code Files
- Create: `lib/tai-chinh/state-obligation-service.ts`
- Create (nếu tách): `lib/tai-chinh/state-obligation-balance.ts`
- Read for context: `lib/tai-chinh/journal-service.ts`, `lib/ledger/balance-service.ts`, `lib/tai-chinh/cash-account-service.ts`, `lib/serialize.ts`

## Implementation Steps
1. Định nghĩa types: `ObligationTypeInput`, `ObligationTxnInput`, `PeriodKind = "month"|"quarter"|"year"`, `ObligationPeriodRow`.
2. CRUD `StateObligationType`: `listObligationTypes`, `createObligationType`, `updateObligationType`, `deleteObligationType` (soft-delete).
3. CRUD `StateObligationTxn`: `listObligationTxns(filter)`, `createObligationTxn`, `updateObligationTxn`, `deleteObligationTxn` — `createObligationTxn`/`update`/`delete` chứa logic đồng bộ JournalEntry trong `$transaction`.
4. `bulkCreateObligationTxns(rows[])` cho dán hàng loạt — mỗi dòng đi qua cùng logic đồng bộ.
5. `getObligationReport({ periodKind, year })` → mảng `{ typeId, name, category, code, opening, increase, decrease, closing }` cho từng kỳ; 1 `$queryRaw`.
6. `serializeDecimals` trước khi trả về client component.
7. `npx tsc --noEmit` → exit 0.

## Success Criteria
- [x] CRUD danh mục + sổ phát sinh hoạt động.
- [x] `da_nop` sinh đúng 1 `JournalEntry` chi; sửa amount/date đồng bộ; xóa soft-delete cả 2.
- [x] `getObligationReport` trả `opening + increase − decrease = closing` cho mọi kỳ.
- [x] Mọi thao tác JournalEntry nằm trong `$transaction`.

## Risk Assessment
- **Đồng bộ JournalEntry ↔ Txn** — phần dễ sai nhất. Mitigation: 1 đường code chung cho create/bulk; `$transaction` bắt buộc; test kỹ ở Phase 7.
- **Đếm trùng dòng tiền**: quy ước — nộp thuế chỉ ghi ở module này, KHÔNG ghi lại ở Nhật ký thủ công. Ghi rõ trong UI Phase 4.
- Đổi `kind` khi sửa: xử lý cả 2 chiều `phai_tra↔da_nop` (sinh mới / soft-delete bút toán).
