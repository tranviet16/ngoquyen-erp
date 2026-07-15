---
phase: 1
title: "Service layer — matrix get/save"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Service layer

## Overview

Thêm `lib/tai-chinh/state-obligation-matrix.ts` — `getObligationMatrix(period)` trả về 1 dòng/nghĩa vụ với `phai_tra`/`da_nop` đã gộp + flag multi-row; `saveObligationMatrix(period, rows)` upsert canonical txn theo `(typeId × period × kind)`. Tái dùng `bulkUpsertObligationTxns` + `state-obligation-report.ts`.

## Requirements

- Functional:
  - `getObligationMatrix({periodKind, year, periodIndex})` → mỗi obligation type 1 dòng với: `typeId`, `name`, `category`, `sortOrder`, `opening` (carry-in), `phaiTraAmount`, `phaiTraTxnId` (null nếu 0 hoặc nhiều), `phaiTraMultiRow` (bool), tương tự cho `daNop*`, `daNopCashAccountId`, `closing`.
  - `saveObligationMatrix(period, rows)` — cho mỗi row: upsert/delete canonical txn `phai_tra` và `da_nop` riêng biệt. Date = ngày cuối kỳ. Tái dùng `bulkUpsertObligationTxns` / `softDeleteObligationTxns`.
  - Validation server-side: `daNopAmount > 0 && daNopCashAccountId == null` ⇒ throw Error có message rõ.
  - Skip cell khi `multiRow == true` (không bao giờ ghi đè).
- Non-functional:
  - Mọi server action `"use server"`, ACL qua `requireRoleModuleAccess("tai-chinh", "edit")`.
  - Decimal-safe (Prisma.Decimal), không float.
  - Không tạo bút toán mới — sync JE đi qua `*WithSync` đã có.

## Architecture

```
state-obligation-matrix.ts (NEW)
├── getObligationMatrix(p) — $queryRaw + period bounds (tái dùng pattern report)
└── saveObligationMatrix(p, rows)
    ├── computeEndOfPeriodDate(p)  → last day of period (UTC)
    ├── for each row, for each kind in [phai_tra, da_nop]:
    │   ├── if multiRow → skip
    │   ├── if amount == 0 && existingTxnId → softDeleteObligationTxns([id])
    │   ├── if amount > 0 && existingTxnId → bulkUpsertObligationTxns([{id, amount, cashAccountId, date}])
    │   └── if amount > 0 && !existingTxnId → bulkUpsertObligationTxns([{typeId, kind, amount, cashAccountId, date}])
    └── validate da_nop with no cashAccountId BEFORE any write (fail-fast)
```

SQL của `getObligationMatrix` (tương tự `state-obligation-report.ts` nhưng group thêm kind + đếm row):

```sql
SELECT
  t.id, t.name, t.category, t."sortOrder", t."openingBalance",
  -- prior (< periodStart) for opening calc
  COALESCE(SUM(x.amount) FILTER (WHERE x.kind = 'phai_tra' AND x.date < $start), 0) AS prior_inc,
  COALESCE(SUM(x.amount) FILTER (WHERE x.kind = 'da_nop'  AND x.date < $start), 0) AS prior_dec,
  -- in-period totals + counts per kind
  COALESCE(SUM(x.amount) FILTER (WHERE x.kind = 'phai_tra' AND x.date >= $start AND x.date < $end), 0) AS phai_tra_sum,
  COUNT(x.id)            FILTER (WHERE x.kind = 'phai_tra' AND x.date >= $start AND x.date < $end)    AS phai_tra_count,
  MIN(x.id)              FILTER (WHERE x.kind = 'phai_tra' AND x.date >= $start AND x.date < $end)    AS phai_tra_first_id,
  COALESCE(SUM(x.amount) FILTER (WHERE x.kind = 'da_nop'  AND x.date >= $start AND x.date < $end), 0) AS da_nop_sum,
  COUNT(x.id)            FILTER (WHERE x.kind = 'da_nop'  AND x.date >= $start AND x.date < $end)    AS da_nop_count,
  MIN(x.id)              FILTER (WHERE x.kind = 'da_nop'  AND x.date >= $start AND x.date < $end)    AS da_nop_first_id,
  -- single da_nop's cashAccountId (else null)
  CASE WHEN COUNT(x.id) FILTER (WHERE x.kind = 'da_nop' AND x.date >= $start AND x.date < $end) = 1
       THEN MIN(x."cashAccountId") FILTER (WHERE x.kind = 'da_nop' AND x.date >= $start AND x.date < $end)
       ELSE NULL END AS da_nop_cash_account_id
FROM state_obligation_types t
LEFT JOIN state_obligation_txns x
  ON x."typeId" = t.id AND x."deletedAt" IS NULL
WHERE t."deletedAt" IS NULL
GROUP BY t.id
ORDER BY t.category, t."sortOrder";
```

`multiRow = count > 1`. `existingTxnId = count == 1 ? first_id : null`.

## Related Code Files

- Create: `lib/tai-chinh/state-obligation-matrix.ts`
- Read for context: `lib/tai-chinh/state-obligation-report.ts` (period bounds + $queryRaw pattern), `lib/tai-chinh/state-obligation-service.ts` (bulkUpsertObligationTxns, softDeleteObligationTxns), `lib/tai-chinh/state-obligation-internal.ts` (ObligationKind type)
- Modify: none
- Delete: none

## Implementation Steps

1. Define types: `MatrixPeriod`, `MatrixRow`, `MatrixSaveInput` (export-able).
2. Helper `endOfPeriodDate(period)`: month → last day of month UTC; quarter → last day of quarter UTC; year → 12/31 UTC.
3. Helper `periodBounds(period)` — tái dùng/copy từ `state-obligation-report.ts` (cùng logic).
4. `getObligationMatrix(p)` — chạy $queryRaw, map thành `MatrixRow[]` với `phaiTraMultiRow`/`daNopMultiRow` bool.
5. `saveObligationMatrix(p, rows)`:
   - ACL check.
   - Fail-fast validation: bất kỳ row nào có `daNopAmount > 0 && daNopCashAccountId == null` ⇒ throw `"Phải chọn TK tiền cho khoản đã nộp"`.
   - Cho mỗi row, tính delta phải làm cho từng kind. Skip nếu multiRow. Gom thành 2 mảng: `toUpsert` (cho `bulkUpsertObligationTxns`) + `toDelete` (cho `softDeleteObligationTxns`).
   - Gọi 2 service action sẵn có. Không tự mở `$transaction` — `bulkUpsertObligationTxns` đã wrap.
6. `revalidatePath("/tai-chinh/nghia-vu-nha-nuoc/so-theo-doi")` + `/bao-cao` + `/danh-muc` — hoặc dựa vào revalidate sẵn có trong `bulkUpsertObligationTxns`.

## Success Criteria

- [ ] `getObligationMatrix` trả về đủ 1 dòng/type cho cả type chưa có txn nào (LEFT JOIN)
- [ ] `multiRow` đúng khi có 2+ txn cùng kind trong kỳ
- [ ] `saveObligationMatrix` upsert đúng `(typeId, kind, period)`; không tạo trùng row khi gọi lại nhiều lần với cùng input
- [ ] Đặt amount = 0 ⇒ soft-delete txn; Đã nộp = 0 cũng soft-delete JE (qua `deleteTxnWithSync` đã có)
- [ ] Validation TK tiền chặn save TRƯỚC khi ghi DB (fail-fast)
- [ ] Skip multi-row cells — không ghi đè
- [ ] `tsc --noEmit` pass

## Risk Assessment

- **Risk:** SQL $queryRaw injection / parameter binding sai. **Mitigation:** dùng Prisma tagged template (`prisma.$queryRaw\`...\``) với `${start}`/`${end}` Date — Prisma escape tự động. Pattern y hệt `state-obligation-report.ts`.
- **Risk:** `bulkUpsertObligationTxns` không expose API set date riêng cho mỗi row. **Mitigation:** kiểm tra `bulkUpsertObligationTxns` signature trước khi code — nó nhận `Record<string, unknown>` nên truyền `date` field được. Nếu không, mở rộng nhẹ.
- **Risk:** Race khi 2 user cùng save matrix kỳ ⇒ tạo 2 canonical txn cùng `(type, period, kind)`. **Mitigation:** YAGNI v1 — kế toán làm 1 người. Note ở docs.
