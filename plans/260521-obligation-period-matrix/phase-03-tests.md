---
phase: 3
title: "Unit tests cho matrix service"
status: completed
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 3: Tests

## Overview

Unit tests cho `state-obligation-matrix.ts` theo pattern `state-obligation-service.test.ts` đã có (mock `@/lib/prisma`).

## Requirements

- Functional:
  - Test `getObligationMatrix`:
    - 0 txn → row có amount = 0, multiRow = false, txnId = null
    - 1 txn phai_tra → amount = đúng, multiRow = false, txnId = đúng
    - 2 txn cùng kind → amount = sum, multiRow = true, txnId = null
    - Carry-in (opening) đúng theo formula `openingBalance + Σphai_tra(<start) − Σda_nop(<start)`
    - `da_nop_cash_account_id` = null khi 2+ rows, = đúng khi 1 row
  - Test `saveObligationMatrix`:
    - Validation: `daNopAmount > 0` mà `cashAccountId == null` ⇒ throw error TRƯỚC khi gọi DB
    - Phải trả mới (no existing) → gọi `bulkUpsertObligationTxns` với `{typeId, kind: "phai_tra", date: endOfPeriod, amount}`
    - Phải trả update (có existing) → gọi với `{id, amount}`
    - Phải trả = 0 (có existing) → gọi `softDeleteObligationTxns([id])`
    - Đã nộp tương tự, kèm `cashAccountId`
    - Multi-row cell → KHÔNG gọi gì (skip)
    - Hỗn hợp nhiều rows: gọi đúng lượt với đúng payload
  - Test `endOfPeriodDate`:
    - month 5/2026 → 2026-05-31 UTC
    - month 2/2024 → 2024-02-29 UTC (leap)
    - month 2/2026 → 2026-02-28 UTC
    - quarter 2/2026 → 2026-06-30 UTC
    - year 2026 → 2026-12-31 UTC
- Non-functional:
  - Mock `@/lib/prisma`, `@/lib/auth`, `@/lib/acl/role-permissions` theo cùng pattern `state-obligation-service.test.ts`.
  - Tests pure & deterministic — không real DB.

## Architecture

```
lib/tai-chinh/__tests__/state-obligation-matrix.test.ts (NEW)
├── Mocks: prisma, auth, requireRoleModuleAccess (no-op)
├── describe("getObligationMatrix")
│   ├── mock $queryRaw raw rows
│   └── assert mapped MatrixRow output
├── describe("saveObligationMatrix")
│   ├── mock bulkUpsertObligationTxns + softDeleteObligationTxns (track calls)
│   └── assert correct calls per scenario
└── describe("endOfPeriodDate")
    └── pure function unit tests
```

## Related Code Files

- Create: `lib/tai-chinh/__tests__/state-obligation-matrix.test.ts`
- Read for context: `lib/tai-chinh/__tests__/state-obligation-service.test.ts` (mock pattern)
- Modify: none

## Implementation Steps

1. Copy mock setup từ `state-obligation-service.test.ts`.
2. Mock `bulkUpsertObligationTxns` + `softDeleteObligationTxns` import từ `state-obligation-service` — `vi.mock("@/lib/tai-chinh/state-obligation-service", () => ({ ... }))`.
3. Viết tests theo danh sách Requirements.
4. Chạy `npm run test -- state-obligation-matrix`.
5. Nếu fail → fix code Phase 1 hoặc test giả định, lặp.

## Success Criteria

- [ ] Tất cả test cases pass
- [ ] Coverage tối thiểu: `getObligationMatrix` (4 cases), `saveObligationMatrix` (≥5 cases), `endOfPeriodDate` (5 cases)
- [ ] Vitest suite tổng vẫn xanh

## Risk Assessment

- **Risk:** Mock `bulkUpsertObligationTxns` từ cùng module có thể bị circular hoặc khó isolate. **Mitigation:** nếu khó, refactor `saveObligationMatrix` thành nhận `deps = { upsert, delete }` injectable → test thuần. Nhưng YAGNI nếu vi.mock hoạt động bình thường.
