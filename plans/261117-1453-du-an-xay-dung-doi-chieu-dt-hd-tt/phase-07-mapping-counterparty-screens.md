---
phase: 7
title: "Ánh xạ, Đầu mối and Mã nhóm screens"
status: completed
priority: P2
effort: "1.5d"
dependencies: [5]
---

# Phase 7: Ánh xạ, Đầu mối and Mã nhóm screens

## Goal
Users can do the following without the workbook:
- map new names after entry;
- manage Mã nhóm, đầu mối and their NCC links;
- type the HĐ-TT figures.

## Files to Create / Modify
- Create in `lib/du-an/dt-hd-tt/`: `alias-service.ts`, `group-code-service.ts`, `counterparty-service.ts` (all `"use server"`, guarded), `__tests__/alias-rules.test.ts`.
- Create in `app/(app)/du-an/[id]/dt-hd-tt/`: `anh-xa/page.tsx`, `anh-xa/anh-xa-client.tsx`, `dau-moi/page.tsx`, `dau-moi/dau-moi-client.tsx`, `ma-nhom/page.tsx`, `ma-nhom/ma-nhom-client.tsx`.
- Create: `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts`.

## Tasks & Steps
1. **Ánh xạ** has three tabs: DT, HĐ and TT.
   - One row per distinct key, built from lines LEFT JOIN alias, with line count, Σ amount and NCC.
   - The "chưa gán" counter comes first.
   - Pickers for Mã nhóm and Dòng DT (filtered by group), plus hệ số, Xác nhận / Ngoài DT, and loại on DT keys.
   - A list of orphan aliases.
   - Writes use `findFirst({ projectId, source, itemKey, deletedAt: null })` followed by an audited `create`/`update`. P2002 maps to a Vietnamese message. A bulk confirm writes an explicit audit row.
   - Changing an hd alias regenerates the derived transactions of the affected invoice lines through `invoice-transaction-sync`.
2. **Đầu mối:**
   - name, kind, sort group / order, thực tế basis, manual figure, payment section;
   - linked NCC with H, S, X and Z;
   - one đầu mối per NCC, with the unique-index error shown in Vietnamese.
3. **Mã nhóm:** code, name, NCC phụ trách (đầu mối), main-material flag.
4. **Rules for every write:**
   - Access: `create` to add, `edit` to change or delete; H / X / S / Z require `edit`.
   - Foreign ids are checked against the project.
   - `lockProjectDtHdTt` is taken.
   - The report pages and the old tabs are revalidated.

## Verification
- Unit tests for the alias rules (status transitions; hệ số 0 → null).
- Integration test, run through the real extended Prisma client, output attached to `reports/`:
  - confirming an alias moves an invoice line from "chưa gán" into its DT line, and moves its derived transaction to the estimate's category / itemCode;
  - changing a basis changes HĐ-TT T;
  - a cross-project groupCodeId is refused.
- `npm run build`.

## Implementation notes (17/11)

Code is written; **no check has run yet** (the agent's shell could not start any process: `ENAMETOOLONG ... uv_spawn`). tsc, eslint, the unit suite, the integration run and the build are still to do. Save the integration output to `reports/phase-07-integration-run.txt`.

- **Services** (`alias-service.ts`, `group-code-service.ts`, `counterparty-service.ts`, all `"use server"`):
  - `list*` needs `read` and returns data; every write action returns `ActionResult` through the shared `runEntryAction` (`entry-action-result.ts`), so refusals reach the toast in production builds.
  - `create*` needs `create`; `update*`, `softDelete*` and `confirmAliases` need `edit`. Update and delete first bind the record to the URL's project (`existing.projectId !==`, neutral "không còn trong công trình này" message), then check access.
  - Updates take a **patch** (only the changed fields). Unknown keys are refused before any read (`assertPatchKeys`); the patch is merged with the row re-read under `lockProjectDtHdTt` (`mergePatch`) and the merged row is validated with the full schema.
  - Each write: lock, re-read, check foreign ids against the project (Mã nhóm, đầu mối, Dòng DT, active NCC), findFirst for duplicates, audited `create` / `update`, soft delete. A unique-index race maps to the same Vietnamese message (`withUniqueMessage`).
- **Alias rules** (`alias-rules.ts`, pure):
  - dt aliases carry Mã nhóm + loại (blank loại = the key's own kind); they cannot be "Ngoài DT".
  - hd / tt aliases carry Mã nhóm, Dòng DT, hệ số. "Ngoài DT" clears all three. "Xác nhận" needs a Dòng DT or a Mã nhóm. Hệ số 0 / blank → null; negative is refused.
  - A Dòng DT pick takes that line's Mã nhóm; picking a different group is refused.
  - Alias name / ĐVT come from the source book on the server; a key with no source line cannot be mapped.
- **Derived transactions:** any hd alias create / update / delete re-syncs the invoice lines with that key through `syncDerivedTransactions`. A dt alias whose loại changes re-syncs the invoice lines mapped to that DT line, because the loại decides the transaction type.
- **Bulk confirm** (`confirmAliases`): only `de_xuat` aliases that already point to a Dòng DT / Mã nhóm (or dt aliases) move to `xac_nhan`. One `updateMany` under `bypassAudit` plus one explicit `audit_logs` row (`bulk_confirm`, the moved ids). Status alone does not move a line, so there is no re-sync.
- **Deletes refused while in use:** a Mã nhóm used by aliases; an đầu mối used by receipts, payments, Mã nhóm or NCC links.
- **One NCC per project:** the duplicate names the owning đầu mối. H / S / X / Z cannot be typed when linking an NCC (`create`); they are edited on the row (`edit`).
- **Screens:**
  - Ánh xạ: tabs DT / HĐ / TT with a "chưa gán" counter per tab. Unmapped keys come first, then proposals. Search and a status filter. An inline editor per key: Mã nhóm, Dòng DT filtered by the group, hệ số or loại; buttons Xác nhận, Lưu đề xuất, Ngoài DT, Bỏ gán. Bulk confirm works on the filtered list. Orphan aliases are listed at the bottom. `?tab=dt|hd|tt` opens a tab; without it the page opens the first tab that has unmapped keys.
  - Đầu mối: a DataGrid of đầu mối, with the report's current thực tế per row, and a DataGrid of NCC links with E / I / T from HĐ-TT next to the typed H / S / X / Z. It also lists the HĐ-TT suppliers that have no row yet.
  - Mã nhóm: a DataGrid with the alias count per group.
  - Grid edits send one field. Form numbers are parsed strictly (`parseNumberText`): unreadable text is refused, never saved as null.
- **New helper modules:** `alias-board.ts` (pure board builder), `register-schemas.ts` (zod schemas, `mergePatch`, `assertPatchKeys`), `register-ui.ts` (client-safe constants, labels, `parseNumberText`, `isBulkConfirmable`). `entry-write-guards.ts` gained `revalidateMappingChange`, `isUniqueViolation`, `withUniqueMessage`.
- **Tests:**
  - `__tests__/alias-rules.test.ts` and `__tests__/register-schemas.test.ts`.
  - The ACL contract covers the 3 services: level split, lock, `ActionResult`, and no bulk write without `bypassAudit` + a manual audit row.
  - `p0-server-action-contracts` adds refusal / binding / patch-key / validation checks.
  - `module-release-entrypoints` registers the 3 pages.
  - `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts` covers the verification list plus ACL, duplicates and the bulk-confirm audit.
- **Sub-nav:** `anh-xa`, `dau-moi` and `ma-nhom` are now `ready: true`.

### Review fixes (17/11, [review](reports/code-reviewer-phase-07-mapping-screens-review.md))

- **H1 (long alias transactions):**
  - Every alias write transaction runs with `{ timeout: 60_000, maxWait: 10_000 }`.
  - Derived transactions are re-synced only when placement can change: an hd alias whose `placementSignature` changes (Dòng DT, hệ số, Mã nhóm, into or out of Ngoài DT, created or removed), or a dt alias whose loại changes.
  - A note-only edit, or a đề xuất ↔ xác nhận change, writes no transaction.
- **M1 (stored refs re-checked):**
  - Mã nhóm and Dòng DT are re-checked only when the write changes them, as `refChanged` does.
  - An alias whose Dòng DT has left the dự toán can still have its note, hệ số or status edited, and its Dòng DT can be cleared. It cannot be newly confirmed on that missing line.
  - The editor shows the missing line as its own option, "(dòng DT không còn) …".
- **M2 (stale group copies):**
  - When the alias points to a Dòng DT that still exists, the stored Mã nhóm is always the DT line's current group. Only an explicitly sent, different group is refused.
  - The Ánh xạ table and the Mã nhóm alias count, which also decides whether a delete is refused, use the effective group: the DT line's group for hd / tt aliases on a live line, otherwise the stored group. The resolver is `effectiveGroupResolver` in `alias-board.ts`; the counts come from `aliasCountsByGroup` in the new `alias-groups.ts`.
- **L1:** a hệ số in (0, 5e-7) is refused with "Hệ số quá nhỏ (tối thiểu 0,000001)" instead of being saved as null.
- **L2:** số chốt tay and H / S / X are text cells read with `parseNumberCell`. Non-number text gives an error and is never saved as null. The shared `cells.ts` is unchanged.
- **L3:** bulk confirm skips proposals whose Dòng DT no longer exists and reports them as `staleDtLine`.
- **Out of scope (review question 1):** Dự toán edits made outside this module (rename, delete, category-code change) do not take `lockProjectDtHdTt`, do not re-sync derived transactions and do not flag aliases whose Dòng DT went stale. Such aliases appear in Ánh xạ with "(dòng DT không còn)" and can be re-picked there.
