# System Architecture

## Overview

This document describes the high-level architecture of the ngoquyyen-erp system, with emphasis on access control and the Vận hành (Operations) module structure.

## Access Control Architecture (ACL)

The system implements a **2-axis ACL model** layered on top of a **dynamic role foundation** (`Role` + `RolePermission` tables + UserDeptAccess). Roles are data-driven rows in the `roles` table — admins can create, edit, and delete roles and their per-module permission grants from the UI; there is no hardcoded role hierarchy or `rank` integer.

### Global Module Availability

Release state is an independent, global gate stored in `ModuleAvailability(moduleKey, status, updatedAt)`. The PostgreSQL migration backfills all 18 registered module keys to `ready`; `dashboard` and `admin.permissions` are protected core modules and cannot be changed to `development` or deleted through the admin UI, Server Action or database constraints/triggers.

The resolver bulk-loads availability once per request. Missing rows, invalid values and database errors resolve to `development` (fail closed). The compile-time module catalog remains the contract for keys, labels, axes and levels; the database stores only mutable rollout state.

Access is evaluated in this order:

1. Authenticate the user.
2. Resolve raw ACL entitlement through `canAccessEntitlement`; unauthorized users remain hidden or receive Forbidden.
3. Resolve rollout availability. An entitled user opening a development module is redirected to `/dang-phat-trien`.
4. For a ready module, continue with the existing resource-axis checks and business handler.

`canAccess`, shared role guards, project visibility, bespoke APIs and server actions all enforce rollout state. Project pages repeat their project-scoped guard locally because App Router layouts and child pages may render in parallel. Project Server Actions independently enforce project scope and bind ID mutations to the record's owning project. Admins may bypass ACL entitlement according to the existing role policy, but they do not bypass a module's development status. The development page renders only an inert, synthetic blurred shell and never loads the destination component or business data.

Release-status writes are allowlisted, require an active admin, reject protected core modules, and write the availability change plus its before/after `AuditLog` entry atomically in one serializable interactive transaction. Stale multi-admin baselines are rejected, serialization conflicts receive one bounded retry, and revalidation occurs only after commit. Integration fault injection verifies that an audit insert failure rolls back the availability update.

### Axis 1: Module Access (Trục 1 — Module Permissions)

Gating mechanism for per-user visibility and route access at the module level.

- **Table:** `ModulePermission(userId, moduleKey, level)`
- **Composite Key:** `(userId, moduleKey)`
- **Levels:** `"read"`, `"comment"`, `"edit"`, `"admin"` (per-module valid sets; some modules have fewer options)
- **Semantics:** Determines whether a user can see a module on the sidebar and access routes within that module
- **Fallback:** If no `ModulePermission` row exists, the system falls back to the user's role grants in the `RolePermission` table, resolved by `lib/acl/role-permissions.ts`
- **Admin ACL Short-Circuit (D1):** Users with `role = "admin"` bypass ACL entitlement checks, but remain subject to global module availability

### Axis 2: Resource Access (Trục 2 — Per-Module Axis Dispatch)

Once module-level gate passes, per-module dispatch rules apply:

| Module | Axis Type | Table(s) | Behavior |
|--------|-----------|----------|----------|
| `du-an` (Projects) | Project-based | `ProjectPermission` + `ProjectGrantAll` | User-specific per-project grants + optional super-grant covering all projects |
| `cong-no-vt`, `cong-no-nc` (Supplier Debt) | Dept-based | `UserDeptAccess` (existing) | Scoped to user's department(s) |
| `vat-tu-ncc` (Supplier Material Ledger) | Dept-based | `UserDeptAccess` (existing) | Scoped to user's department(s); `chot-ky` writes need `edit` level; `kiem-tra-khop` also requires active admin |
| `task` (Tasks/Cộng Việc) | Dept-based | `UserDeptAccess` (existing) | Scoped to user's department(s) |
| `coordination` (Phiếu Phối Hợp) | Dept-based | `UserDeptAccess` (existing) | Scoped to user's department(s) |
| `hieu-suat` (Performance) | Role-based | AppRole + `isLeader` + `isDirector` | Role/director flags determine access |
| `sl-dt` (Material) | Admin-only | — | Admin users only |
| `admin/*` | Admin-only | — | Admin users only |
| `master-data` | Admin-only | — | Admin users only |

### Effective Check Logic

```
canAccess(userId, moduleKey, options) = 
  if moduleAvailability(moduleKey) !== "ready": return false;
  // canAccessEntitlement handles the existing D1 ACL short-circuit.
  moduleLevel = modulePermission(userId, moduleKey) ?? appRole_default(user.role, moduleKey);
  if moduleLevel < "read": return false;
  
  return axisCheck(userId, moduleKey, resource, options);
```

**Key Decision (D3):** For module `du-an`, `ProjectPermission` rows override `ProjectGrantAll` even when level is lower. Resolver priority:
1. If `ProjectPermission(userId, projectId)` exists → use that level
2. Else if `ProjectGrantAll(userId)` exists → use that level
3. Else → deny access

This enables granular exceptions: e.g., "edit all projects except P5 (read-only)".

## Nghĩa vụ với Nhà nước (State Obligations)

The State Obligations module provides tracking of Vietnamese tax and social insurance obligations with period-by-period reporting.

### Data Model

**StateObligationType (Catalog)**
- Company-wide obligation types (e.g., GTGT, BHXH)
- 8 seeded standard VN obligations (code, category, opening balance)
- Soft-deletable; supports custom additions

**StateObligationTxn (Ledger)**
- Per-obligation transaction log (date, kind, amount)
- `kind: "phai_tra"` (accrual) — ledger-only
- `kind: "da_nop"` (payment) — auto-creates linked JournalEntry (refModule="state_obligation", type="chi")
- journalEntryId field FK to JournalEntry (populated for da_nop only)

### JournalEntry Sync Strategy

**Decision: Single Source of Truth = StateObligationTxn**

- **da_nop (paid) txns:** Generate derived read-only JournalEntry (refModule="state_obligation")
  - JournalEntry cannot be edited/deleted independently (journal-service rejects with access check)
  - Deleting the StateObligationTxn cascades to JournalEntry
  - Cash account debit sourced from cashAccountId field

- **phai_tra (accrual) txns:** No JournalEntry created (accrual-only, no cash movement)

**Journal Integration (journal-service.ts):**
- Edit/delete of refModule="state_obligation" entries rejected upfront (user guided to update StateObligationTxn instead)
- Query filters include these entries in reports but mark as derived/read-only

### Routes

```
GET /tai-chinh/nghia-vu-nha-nuoc               Landing (navigation to sub-pages)
GET /tai-chinh/nghia-vu-nha-nuoc/danh-muc      Catalog grid (edit opening balances per obligation type)
GET /tai-chinh/nghia-vu-nha-nuoc/so-theo-doi   Ledger grid (CRUD transactions)
GET /tai-chinh/nghia-vu-nha-nuoc/bao-cao       Period report (opening + period accrue/pay + closing)

POST/PATCH /api/tai-chinh/state-obligation/txn  Server actions (create, update, delete with sync)
GET /api/tai-chinh/state-obligation/report       Period aggregation
```

### ACL

**Module Key:** `tai-chinh` (admin-only)
- All sub-pages protected by parent layout guard: `requireModuleAccess("tai-chinh", { scope: "module" })`
- No granular submodule keys (unlike payment or debt modules)

### Implementation Details

**lib/tai-chinh/state-obligation-service.ts (217 LOC)**
- `createTxn()`, `updateTxn()`, `deleteTxn()` — CRUD with JournalEntry sync
- `useServerAction` hooks for form integration
- Error handling + audit logging

**lib/tai-chinh/state-obligation-internal.ts (159 LOC)**
- `createTxnWithSync()`, `updateTxnWithSync()`, `deleteTxnWithSync()`
- Internal transaction helpers (used by service + tests)
- JournalEntry creation/deletion logic

**lib/tai-chinh/state-obligation-report.ts (104 LOC)**
- `getObligationReport(year, month)` — SQL aggregation
- Opens opening_balances balance by type + period transactions
- Returns: id, name, code, category, opening, period_inc, period_dec, closing per type

**lib/tai-chinh/__tests__/state-obligation-service.test.ts (14 tests)**
- Mocked Prisma $queryRaw for report aggregation
- JournalEntry sync helpers tested with fake tx client
- CRUD operation coverage

---

## Vật Tư NCC — Công nợ, Báo giá, Thanh toán, Chốt Kỳ (2026-10-06)

**Quy định cơ bản:**
- **Nguồn sự thật công nợ:** `ledger_transactions` (ledgerType="material") + `ledger_opening_balances` — `SupplierReconciliation` là snapshot dẫn xuất, chỉ đông cứng khi ký.
- **Quy ước ngày sổ cái:** `date` = ngày nghiệp vụ (business day) tại múi giờ Asia/Bangkok, lưu tại UTC 00:00 (TIMESTAMP(3) không múi giờ). Truy vấn cửa sổ: `date >= from AND date < to + 1 ngày`.
- **Migration dữ liệu:** `20261006110000_normalize_ledger_dates_to_business_day` chuẩn hoá mọi `date` từ các nguồn cũ (đợt thanh toán ghi giờ đóng đợt, Excel import ghi nửa đêm → ngày nghiệp vụ Asia/Bangkok UTC 00:00). Có sao lưu DB trước chạy.

### Phân loại giao dịch sổ cái

`lib/ledger/transaction-classification.ts`: hằng + fragment SQL (không hàm TypeScript):
- **`lay_hang`** (lấy hàng): tăng nợ — phiếu giao nhận ngày
- **`thue_hd`** (thuế hoá đơn): tăng nợ ở cột TT — ghi qua tab Thanh toán (bắt buộc số hoá đơn, khác ngày HĐ)
- **`thanh_toan`** (thanh toán): giảm nợ — chuyển khoản
- **`dieu_chinh`** (điều chỉnh): dương → phát sinh, âm → trả; không bị khoá kỳ (lối thoát chuẩn)

SQL fragment `typeInSql(types[])`, `increaseSql(col)`, `decreaseSql(col)` dùng cho mọi truy vấn — thay `lay_hang`/`thue_hd`/`thanh_toan`/`dieu_chinh` từ fragment, không hardcode.

**Lỗ hổng đóng:** `patchMaterialTransaction(id, patch, client, authorized)` bỏ tham số `authorized`; dòng có `paymentRoundItemId` hoặc `deliveryId` (tự sinh) không sửa/xóa được qua action tay (guard server `AUTO_GENERATED_GUARD.assertManualEditable`).

### Cửa sổ báo cáo — Bộ chọn mốc dùng chung

`lib/ledger/report-period.ts`: đổi preset (Toàn bộ / Năm / Quý / Tháng / Tuần ISO / Kỳ chuẩn / Tuỳ chọn) thành cửa sổ `[from, to]` UTC 00:00 (cả hai đầu bao gồm, truy vấn: `date >= from AND date < to + 1 ngày`).

**Preset:**
- **`all`**: mọi giao dịch
- **`year`**: năm dương lịch (vd. 2026)
- **`quarter`**: quý Q1–Q4
- **`month`**: tháng (mặc định tháng hiện tại)
- **`week`**: tuần ISO theo chuẩn (Thứ 2 – CN); tuần 53 chỉ ở năm có 53 tuần
- **`ncc`**: "Kỳ chuẩn 27→26" — 27 tháng trước → 26 tháng chọn, áp dụng unifrom tất cả NCC
- **`custom`**: từ ngày → đến ngày (ISO format YYYY-MM-DD)

Dùng cho `/cong-no-vt/{bao-cao-thang, chi-tiet, tong-hop}` và `lib/export/templates/cong-no-monthly.ts`.

### Truy vấn cửa sổ — Bất biến toán học

`queryDebtMatrix(partyIds, window)` (hoặc `queryMaterialDetailReport` cho chi tiết) + tests chứng minh:
1. **LH = Đầu kỳ + Phát sinh**: Cuối kỳ(đến T) = Lũy kế(T)
2. **Tuần ISO tham gia tháng**: Tổng các tuần ISO trong tháng = Tháng (không lệch ngày biên)
3. **`dieu_chinh` bị loại khỏi `balance-service`** khi tính số dư dẫn xuất từ phiếu / thanh toán (chỉ dùng cho điều chỉnh ngoại lệ)

### Biên kỳ chốt — Tuỳ chọn, liền kề marker gần nhất, khoá advisory

`lib/vat-tu-ncc/period-bounds.ts` + `period-lock.ts`:

**Validate:** `validatePeriodBounds(range, context, selfId?)` (pure module):
1. `from ≤ to`
2. Không chồng kỳ đã ký
3. `from > mốc số dư ban đầu + 1` (phiếu tới mốc đó nằm trong opening balance)
4. Không chồng kỳ chưa ký; **liền kề marker gần nhất** — kỳ mới bắt đầu ngay sau marker muộn nhất, hoặc trùng khít marker chưa ký (tái chốt idempotent)

**Lock & assertPeriodOpen:**
- `lockSuppliers(tx, [supplierId1, supplierId2, ...])`: lấy advisory lock `pg_advisory_xact_lock(hashtext('vat-tu-ncc:' || id))` **trong transaction**, sắp xếp id tăng dần tránh deadlock
- Mọi đường ghi (phiếu ngày, sổ cái vật tư, số dư ban đầu, chốt kỳ, ký/gỡ ký, đồng bộ đợt thanh toán) dùng cùng khoá trên NCC → không check-then-write race với ký kỳ
- `assertPeriodOpen(supplierId, date, client)`: ném lỗi nếu `date` rơi vào kỳ ký → từ chối ghi, chênh lệch → `dieu_chinh` kỳ sau

**Gợi ý kỳ tiếp theo:** `suggestNextPeriod()` dùng max(mốc opening + 1, ngày sau marker gần nhất, phiếu sớm nhất chưa có event) → cận từ, 26 cận đến.

### Ký xác nhận & Snapshot

`signReconciliation(supplierId, reconId)` (inside `$transaction` + khoá NCC):
- **Bảng dẫn xuất trước ký**: A (opening = cuối kỳ trước), B (Σ lay_hang + thue_hd), C (Σ thanh_toan) — live query
- **Sau ký**: `openingBalance/totalIn/totalPaid/closingBalance` đông cứng (display-only), cộng full `signedSnapshotJson` (line items + subtotals = source of truth tái in)
- **`totalIn` = B** (không gộp thue_hd riêng), **thuế trong JSON** (phiếu mục lục)
- **Gỡ ký**: admin-only, từ chối nếu kỳ sau đã ký (break chain), xoá marker nếu gỡ ký kỳ cuối cùng
- **Kỳ đã ký bất biến**; số dư ban đầu của NCC bị khoá sau ký đầu tiên

### Dữ liệu & Migrations

**Bổ sung model:**
- `Project.entityId: Int? FK → Entity` — Chủ thể cho phiếu dùng dự án
- `SupplierDeliveryDaily.unitPrice/totalAmount: Decimal?` — null → gán khi chốt
- `LedgerTransaction.deliveryId/paymentRoundItemId: Int? FK` (partial-unique) — liên kết & snapshot
- `SupplierReconciliation`: 4 cột nullable (opened/in/out/closed) + `signedSnapshotJson: Json?`

**Migrations:**
- `20260729160000_add_project_entity_and_delivery_pricing`
- `20260729161000_link_ledger_to_payment_item`
- `20260729162000_reconciliation_derived_snapshot`
- `20261006110000_normalize_ledger_dates_to_business_day` (phase 1)

### Backlog (chưa trong phạm vi)

- Importer (`cong-no-vat-tu.adapter.ts:189-200`) ghi SQL thô không qua khoá kỳ — công cụ admin tải lịch sử, từ chối nếu kỳ từ date trong ghi bị ký (user xử lý manual).

---

## Module Structure: Vận Hành (Operations)

### New Route Hierarchy

Routes reorganized under `/van-hanh` prefix:

```
/van-hanh
  /cong-viec           → Task management (moved from /cong-viec)
  /phieu-phoi-hop      → Coordination forms (moved from /phieu-phoi-hop)
  /hieu-suat           → Performance dashboard (new, placeholder; impl in Plan C)
```

**Migration:** Old routes (`/cong-viec`, `/phieu-phoi-hop`) issue 307 redirects to new paths during cutover window, later flipped to 308 (permanent).

### Sidebar Integration

Sidebar is a server component that filters navigation items per `canAccess` checks. "Vận hành" appears as a single top-level group with 3 sub-items, removing the previous split between "Cộng tác" entries.

## Data Models

### ModulePermission

```prisma
model ModulePermission {
  userId    String
  moduleKey String  // e.g., "du-an", "task", "cong-no-vt"
  level     String  // CHECK constraint: level IN ('read', 'comment', 'edit', ...)
  grantedAt DateTime
  grantedBy String?
  
  @@id([userId, moduleKey])
  @@index([userId])
}
```

**Postgres CHECK Constraint:** Validates that level is a valid string literal per module config.

### ProjectPermission

```prisma
model ProjectPermission {
  userId    String
  projectId Int
  level     String  // CHECK constraint: level IN ('read', 'comment', 'edit')
  grantedAt DateTime
  grantedBy String?
  
  @@id([userId, projectId])
  @@index([userId])
  @@index([projectId])
}
```

Used only for `du-an` module. One row per unique (user, project) pair with explicit level override.

### ProjectGrantAll

```prisma
model ProjectGrantAll {
  userId    String  @id
  level     String  // CHECK constraint: level IN ('read', 'comment', 'edit')
  grantedAt DateTime
  grantedBy String?
}
```

Super-grant for a user across all projects within `du-an` module. One row per user max. Overridden by explicit `ProjectPermission` row if it exists (D3).

## Admin UI

### /admin/permissions/modules

Matrix editor for granting/revoking module access.

- **UI:** Excel-like grid with columns for each module, rows for each user
- **Interaction:** Select cells and bulk-edit level in batched transaction (per D5)
- **Validation:** Dropdown per cell shows valid levels for that module only
- **Scale:** No pagination/virtualization; assumes ≤20 users (D6)

### /admin/permissions/projects

Per-project and super-grant manager for `du-an` module.

- **Left Panel:** List all projects; click to edit
- **Right Panel (Per-Project):** Explicit `ProjectPermission` rows for selected project
- **Right Panel (Super-Grant):** Single row for `ProjectGrantAll`; visual indicator if user has both = exception case
- **D3 Clarity:** UI shows "Override" badge when explicit project row overrides super-grant

## Audit & Logging

**Decision (D2 — Revoke = Delete):** Revoking a permission deletes the row rather than storing `level = "none"`. Audit logs capture all grant/revoke events via explicit `writeAuditLog` calls (not auto-middleware, per verification that Prisma middleware doesn't cover composite-key tables).

Related audit tables: `AuditLog` (existing) captures writes to `ModulePermission`, `ProjectPermission`, `ProjectGrantAll` via manual logging in permission action handlers.

## Dependencies & Constraints

- **Extends:** `lib/dept-access.ts` (UserDeptAccess), `lib/acl/role-permissions.ts` (dynamic `Role`/`RolePermission` resolution), `lib/rbac.ts` (`isAdmin` helper)
- **Non-Interfering:** ACL helpers are additive; no replacement of existing systems
- **Route Guards:** All 28 segment routes in `(app)` directory protected via `requireModuleAccess(moduleKey, opts)` from `lib/acl/guards.ts`
- **Type Safety:** Module keys and valid level sets are constants in `lib/acl/modules.ts`; invalid (moduleKey, level) pairs rejected at type-check time

## Performance Considerations

- **Sidebar Query Count:** Server component uses per-request `cache()` to deduplicate access checks; target ≤3 Prisma queries per page load
- **Route Guard Overhead:** Minimal; checks are synchronous after loader fills user/project context
- **Bulk Operations:** Chunked in 100-row batches within transactions to prevent timeout
- **Matrix Editor Debounce:** Client-side request queue per cell to prevent race conditions (max 1 in-flight request per `(userId, moduleKey)`)

## Testing & Validation

### Automated Test Suite (Comprehensive)

**Coverage:** 339 unit/integration tests + 6 E2E specs + security matrix + performance queries + load tests

**Test Layers:**
- **Unit Tests (lib/):** 40+ ACL resolver cases, 32+ golden fixtures (3 roles × 3 axes), payment service, import engine, balance-service
- **Integration Tests:** Real DB with `truncateAll()` cleanup per `*_test` guard
- **E2E Tests (Playwright):** 6 Server-Action workflows + 4 security specs (authz matrix, auth bypass, IDOR, SSE stream)
- **Security Tests:** ACL enforcement matrix + manual checklist (`SECURITY-MANUAL-REVIEW.md`)
- **Performance Tests:** N+1 query counter (0 N+1 found; baseline: dashboard 8, ledgerSummary 1, aggregateMonth 2, taskBoard 9) + load suite (on-demand)
- **CI Pipeline:** GitHub Actions with 3 jobs (unit/integration blocking, e2e blocking, perf informational)

**Key Metrics:**
- **Line Coverage (lib/):** 30.93% (1303/4212 lines) — 60% project threshold deferred (out-of-scope services documented)
- **ACL Test Coverage:** 40/40 resolver + 32/32 golden fixtures PASS
- **Route Guard Audit:** 28/28 segments protected ✓
- **Build & Type Check:** `next build` green, `tsc --noEmit` clean

## Next Steps (Unblocked Plans)

- **Plan B (Task Swimlane):** Builds on `canAccess("van-hanh.cong-viec", task)` + new route structure
- **Plan C (Performance MVP):** Uses `canAccess("van-hanh.hieu-suat", scope)` + role-based axis
- Both can run in parallel after this plan merges; no code conflicts
