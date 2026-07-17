---
phase: 3
title: "Guard CRUD cho project, vật tư, công nợ"
status: complete
priority: P1
effort: 2d
dependencies: [2]
---

# Phase 3: Guard CRUD cho project, vật tư, công nợ

## Overview

Áp explicit server min-level cho pure create/update/delete của `du-an`, `vat-tu-ncc`, `cong-no-vt`, `cong-no-nc`; loại bỏ role-level guard gây lệch với per-user grants.

## Architecture

- Entry action/service phải resolve current user qua `requireReleasedModuleRequest(module, {minLevel, scope})`; admin bypass vẫn nằm trong `canAccessEntitlement` (`lib/acl/effective.ts:68-77`).
- Project writes bind authoritative `projectId`. `SupplierDeliveryDaily`, `SupplierReconciliation`, `LedgerTransaction` và `LedgerOpeningBalance` hiện không có dept/creator-dept; phase này authorize chúng ở `scope:"module"`, không bịa dept scope hoặc hứa cross-dept isolation. Dept ownership/backfill cho bốn model là schema project riêng cần business mapping.
- Giữ business ownership/status validation sau entitlement. Exact admin raw patch dùng active/current admin predicate, không `minLevel:"admin"`.

## Related code files and function checklist

| Family | Files/functions | Change |
|---|---|---|
| Project pure create | `lib/du-an/{transaction,estimate,schedule,contract,cashflow,change-order,acceptance}-service.ts` create exports | module+project min create |
| Project update/delete | same update/softDelete exports; `settings-service.ts:29-35` | min edit; record project must match scope |
| Project raw | six `adminPatch*` exports | exact active admin + project existence; no business-level admin |
| Supplier operations | `lib/vat-tu-ncc/delivery-service.ts:50-99`, `reconciliation-service.ts:30-83` | module-scope create=create; update/delete=edit; load row first, never trust caller `supplierId` as record identity |
| Material ledger | `lib/cong-no-vt/material-ledger-service.ts:39-222` | module-scope create=create; update/delete/patch/opening upsert/bulk=edit; raw=exact active admin |
| Labor ledger | `lib/cong-no-nc/labor-ledger-service.ts:53-226` | same |

## Implementation steps

1. Replace duplicate role-only gates on user-scoped services with effective user entitlement at exact module/resource scope. Enumerate and update every caller signature if a service now needs resolved `userId`/dept.
2. For project create, validate FKs and bind project scope. For VT/NCC/ledgers, validate all FKs but use module scope; do not infer dept from supplier, entity, optional project or actor current department.
3. For update/delete, load record first with minimal scope fields, assert edit, then mutate using scoped `where`/transaction to prevent TOCTOU/IDOR.
4. Convert normal `softDelete*` calls from old admin-level guard to edit. Keep `adminPatch*` exact admin because they bypass schemas.
5. Keep `set*OpeningBalance` and `upsertSettings` edit-only: existence is ambiguous/upsert can update.
6. Refactor four ledger bulk upserts to preflight all rows, classify create/update, require edit for entire batch, and perform all writes in one `prisma.$transaction`; any invalid/out-of-scope row aborts all.
7. Update tests: cross-project IDOR for `du-an`; record-ID/supplier-ID mismatch and module authorization for VT/NCC/ledgers. Do not label global tables as cross-dept tests.

## Test scenario matrix

| Level | Pure create | Update/delete | Bulk/upsert | Raw patch |
|---|---:|---:|---:|---:|
| read/comment | deny | deny | deny | deny |
| create | allow in scope | deny | deny | deny |
| edit | allow | allow | allow atomically | deny unless role admin |
| role admin | allow | allow | allow | allow |

## Todo

- [x] Seven project create exports use min create.
- [x] VT/NCC create exports use min create.
- [x] Two ledger transaction creates use min create.
- [x] Destructive calls use edit; raw calls exact admin.
- [x] Bulk failures rollback all writes through a Prisma transaction client.
- [x] Cross-project IDOR and direct-project guard tests updated and green.

## Success criteria

- No create-only principal can mutate an existing row, including soft-delete.
- Explicit per-user create grant works even if role fallback is read/null.
- Focused module service tests + `test/security/acl-enforcement.test.ts` green.

## Risks and security

VT/NCC/ledger rows have no authoritative dept/creator owner. Preserve their current global record scope; a later dept-isolation feature needs explicit schema, backfill and product decisions.

## Next steps

Phase 5 only after this phase and Phase 4 are green.
