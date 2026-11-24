# Phase 7 code review: Ánh xạ / Đầu mối / Mã nhóm

Scope: uncommitted phase-7 code in `C:\Users\tranv\ngoquyen-du-an-dt-hd-tt` (branch `feat/du-an-dt-hd-tt`). This was a read-only review; nothing was executed because the Bash tool fails with ENAMETOOLONG. The caller reports tsc, eslint, unit, integration and build as green.

## Verified OK (no finding)
- **ACL and project binding.**
  - `list*` actions require `read`, `create*` require `create`, and `update*` / `softDelete*` / `confirmAliases` require `edit`.
  - Update and delete bind `existing.projectId === scopeId` before the ACL check, then re-read under `lockProjectDtHdTt` with `projectId` in the `where`.
  - Bulk confirm filters `projectId` and refuses on a count mismatch.
  - No path lets project-A rights touch project-B rows.
- **Foreign ids.**
  - `groupCodeId` and `dtKey` are checked against the project in `checkedMapping`.
  - `counterpartyId` is checked through `assertCounterpartyInProject`; `supplierId` must be an active supplier.
  - `supplierId`, `projectId` and `source` cannot be patched (`assertPatchKeys`).
- **Derived-transaction re-sync triggers.** These are correct:
  - hd alias create / update / delete;
  - dt alias loại change on create, update and delete, using `effectiveKind` against the key suffix, which matches `buildBookIndex`;
  - a status-only bulk confirm does not move a line (`placeInvoice` only looks at `ngoai_dt`);
  - a dt group change does not affect `deriveTransactions`.
- **Bulk confirm audit.** `bypassAudit` awaits inside the ALS scope. The manual `auditLog.create` runs on `tx`, so it is atomic, and it lists exactly the ids that moved, read under the lock.
- **Unique indexes.** All four partial uniques have a pre-check under the lock plus a Vietnamese P2002/23505 mapping.
- **Deletes refused while in use.** Mã nhóm is refused while aliases use it. Đầu mối is refused while receipts, payments, group codes or links use it.
- **Report flow.** Đầu mối basis feeds `actualByCounterparty` and then HĐ-TT T, and the integration test covers it. `revalidateMappingChange` covers the 3 reports, the 3 books, the 3 register screens and the old tabs.

## High

### H1. Alias writes run many audited row writes inside an interactive transaction with Prisma's default 5 s timeout
- **Where:** `lib/du-an/dt-hd-tt/alias-service.ts:133,161,190`, with `resyncAffectedInvoices` at `:87-97`.
- **What happens:** `syncDerivedTransactions` issues one audited `projectTransaction.update` per invoice line carrying the key. For a dt loại change, that is every line of every hd alias mapped to that DT line. Each audited update costs:
  - a `safeReadBefore` (base client);
  - the update;
  - `resolveCurrentUserId` (a session DB lookup);
  - an audit `base.$transaction`.

  That is about 4–6 round trips per line. It runs inside `prisma.$transaction(async tx => …)` with no options, so it gets the default `timeout: 5000`. The advisory-lock wait counts against that budget too.
- **Failure scenario:**
  1. A common key (for example "Xi măng PCB40|tấn", or a DT line with a few hundred mapped invoice lines) gets "Xác nhận", a hệ số edit, or a dt loại change.
  2. The transaction hits P2028 (transaction expired) and the user sees "Lỗi hệ thống".
  3. Audit rows are written through `base` outside the transaction (`lib/prisma.ts:83-107`). Every `update` audit row already written stays committed although the transaction rolled back, so the history shows changes that never happened.
  4. The same thing happens when an import commit holds the project lock for more than 5 s.
- **Fix:**
  1. Pass `{ timeout: 60_000, maxWait: 10_000 }`, which is the repo precedent (`lib/payment/payment-service.ts:660`, `lib/vat-tu-ncc/period-close-service.ts:324`).
  2. Skip the re-sync when nothing placement-relevant changed. For hd, the fields that matter are `dtKey`, `factor`, and a status change to or from `ngoai_dt` (`groupCodeId` does not change a derived transaction). Without this, a note-only edit also produces N no-op audited writes.
  3. Optionally, in `syncDerivedTransactions`, skip the `update` when the derived fields are unchanged.

## Medium

### M1. `updateAlias` re-validates stored foreign refs that did not change, so aliases whose DT line vanished cannot be edited
- **Where:** `alias-service.ts:171` → `checkedMapping:72-73`.
- **What happens:** On every update, the merged `dtKey` is checked against the current dự toán, even when the patch is `{status}` or `{note}`. This contradicts the module's own convention in `entry-write-guards.ts:42-46` (`refChanged`: only re-check ids that changed).
- **Failure scenario:**
  1. The dự toán is re-synced or renamed (the orphan panel's own doc names this as a common event).
  2. Every hd/tt alias pointing to the old line now fails "Xác nhận", "Lưu đề xuất", note edits and hệ số edits with "Dòng DT không thuộc dự toán của công trình này".
  3. The UI makes it worse (`anh-xa-editor.tsx:36,139-142`). The stale `dtKey` has no `<option>`, so the select shows "— Chỉ gán tới Mã nhóm —" while state still holds the stale key.
  4. Re-picking that displayed option fires no `onChange`, so the user cannot clear it without first picking another line.
  5. Only "Ngoài DT" and "Bỏ gán" work.
- **Fix:**
  - Validate `dtKey` / `groupCodeId` only when `refChanged(current, merged)`, or always allow a null `dtKey`.
  - In the editor, include an explicit "(dòng DT không còn)" option for a stale `dtKey`.

### M2. Changing a DT line's Mã nhóm leaves the `groupCodeId` copied onto its hd/tt aliases stale, which blocks edits and misreports group usage
- **Where:**
  - `alias-rules.ts:104-109` (`groupForDtLine`);
  - `alias-service.ts:74-78` (the copy happens only when the hd/tt alias itself is written);
  - `updateAlias` / `createAlias` / `softDeleteAlias` for `source === "dt"` do not cascade.
- **Failure scenario:**
  1. dt alias X has group G, and hd alias A (dtKey X) stored G. The user changes X to group H on the DT tab, or the dt alias is created after A was mapped with a picked group.
  2. The reports place A under H (`book-index.ts:76-79` uses the DT line's group), but:
     - the Ánh xạ row for A still shows G (`anh-xa-client.tsx:150`);
     - Mã nhóm G's `aliasCount` includes A;
     - `softDeleteGroupCode(G)` is refused (`group-code-service.ts:129`);
     - any later status-only edit of A throws "Dòng DT đã chọn thuộc Mã nhóm khác" (stored G vs line group H) until the user manually re-picks H.
- **Fix:**
  - When the merged mapping has a `dtKey` that exists, store the DT line's group. Only refuse when the patch explicitly sends a conflicting `groupCodeId`.
  - Or, on a dt alias group change or delete, cascade the group to hd/tt aliases with `dtKey = itemKey` under the same lock. Each must be an audited `update`; an `updateMany` would need `bypassAudit` plus a manual audit row.

## Low

### L1. Very small hệ số values are silently stored as null
- **Where:** `alias-rules.ts:73-74`.
- **What happens:** A positive factor below 5e-7 rounds to 0 and becomes null (value-tracking) with no message. The unit test asserts this, but it contradicts the "unparseable input rejected, never saved as null" rule.
- **Fix:** Refuse with "Hệ số quá nhỏ (tối thiểu 0,000001)".

### L2. Pasting non-numeric text into number grid cells saves null
- **Where:** `components/data-grid/cells.ts:139-141` (shared grid, the same as the phase-6 books).
- **What happens:** For number/currency cells (H/S/X, số chốt tay, thứ tự), pasted text that does not parse becomes `null`. That silently clears H/S/X, or turns số chốt tay into "chưa chốt".
- **Fix:** Have `parseCellValue` throw (or return a sentinel the handler refuses) on non-finite input. This is a cross-module change, so it may belong outside this phase.

### L3. `confirmAliases` does not re-validate targets
- **Where:** `alias-service.ts:217-225`.
- **What happens:** It confirms `de_xuat` aliases whose `dtKey` no longer exists, and stale-group aliases (M2), without re-checking them. That gives a "confirmed" status to mappings the single-row path would refuse.
- **Fix:** Filter the targets with the same `loadDtLines` existence check, and count the rejected ones as skipped.

### L4. The bulk-confirm audit row is filed under a project-level record id
- **Where:** `alias-service.ts:229`.
- **What happens:** The bulk-confirm audit uses `recordId: "project:<id>"`. Per-alias history (`tableName + recordId = aliasId`, as in the integration test at :284) never shows a bulk confirmation. This matches the spec, so it is informational only.

## Unresolved questions
1. Estimate (dự toán) edits outside this module do not take `lockProjectDtHdTt` and do not re-sync derived transactions or flag stale alias `dtKey`s. Examples are renaming an item, deleting it, or changing a category code (which changes the loại). Is that intentionally deferred? It is the main source of the M1 state.
2. For M2, which is preferred: derive the group on every write (no stored copy is trusted), or cascade on dt alias change?
3. For H1, are invoice books with more than 100 lines per key expected in production (the admin-pc data)? That decides whether only the timeout fix is needed, or the skip-unchanged re-sync as well.

Status: DONE_WITH_CONCERNS
Summary: 0 Critical, 1 High, 2 Medium, 4 Low.
