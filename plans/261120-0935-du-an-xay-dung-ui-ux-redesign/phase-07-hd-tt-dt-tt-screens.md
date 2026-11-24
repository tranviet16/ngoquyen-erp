---
phase: 7
title: "HĐ-TT screen with in-place H/S/X/Z, and DT-TT screen"
status: pending
priority: P1
effort: "3d"
dependencies: [1, 3, 4]
---

# Phase 7: HĐ-TT screen with in-place H / S / X / Z, and DT-TT screen

## Goal

- Meet criterion 5 on HĐ-TT:
  - all 13 money columns under plain grouped headers;
  - sticky header, NCC column and total row;
  - filters;
  - kế toán types H / S / X / Z in place. S is allowed only where it cannot break the Σ T check.
- Make DT-TT easier to read with a jump bar, collapsible groups and warning links.
- Leave print unchanged.

<!-- Red team: finding 4 -->
**Merge order.** This PR merges after phase 6, because both add entries to `screen-links.ts` and its test.

## Context

- **Rulings:**
  - [debate-synthesis.md](reports/debate-synthesis.md) §2, rows "HĐ-TT edit mode", "Link id for the action", "S when no đầu mối", "Cell-patch code", "Draft safety on refresh";
  - where the red team changed them: [red-team-adjudication.md](reports/red-team-adjudication.md), findings 5, 10, 12, 13 and 14.
- **Detail to lift:**
  - [candidate 2](reports/planner-debate-candidate-2.md), P6 and the HĐ-TT wireframe: table, toggle, keyboard.
  - [candidate 1](reports/planner-debate-candidate-1.md), design choice 5: labelled total row.
  - [candidate 3](reports/planner-debate-candidate-3.md), Phase 6: dirty-cell guard and DT-TT links.
- **Save action.** `updateCounterpartySupplier(id, projectId, patch)` in `lib/du-an/dt-hd-tt/counterparty-service.ts:208-230`:
  - enforces `edit` (`:215`) and locks the project (`:217`);
  - merges the patch into the stored fields (`:220-224`);
  - revalidates through `revalidateMappingChange` (`:228`), which already re-renders the page being viewed.
- **`linkId`.** `HdTtRow` has no link id (`hd-tt-report.ts:19-43`). The link is in scope at `:82-114` and has an `id` (`book-index.ts:65`). Golden tests use `toMatchObject` (`__tests__/dt-tt-hd-tt-report.test.ts:61-74`).
<!-- Red team: finding 10 -->
- **Where S breaks Σ T.**
  - S overrides every other rule (`hd-tt-report.ts:90`).
  - The first sibling of a multi-NCC đầu mối gets the remainder (`:95-96`), and a single-NCC đầu mối takes the đầu mối actual (`:97`). An unsettled đầu mối gives T = E as a temporary value (`:92-94`).
  - The Σ T check expects the đầu mối actuals plus the temporary part (`:129-141`).
  - S is therefore safe only on a later NCC of a multi-NCC đầu mối whose thực tế is settled. Anywhere else it turns the check ✗.
<!-- Red team: finding 10 -->
- **Fields and parsers.**
  - Z is free text up to 1 000 characters (`todoNote: optionalText()`, `register-schemas.ts:19,106`).
  - `parseNumberText(text, label, "money")` reads "1.500" as 1 500 and "1.500.000" as 1 500 000 (`register-ui.ts:44-54`).
  - The Đầu mối grid's `parseNumberCell` reads "1.500" as 1.5 and rejects "1.500.000" (`entry-cell-parse.ts:41-46`). The grid uses it for H, S and X in `cellPatch` (`dau-moi-suppliers.tsx:61-72`).
  - After this phase both screens edit the same three fields, so they must parse the same way.
<!-- Red team: finding 10 -->
- **Rows move.** Row order depends on đầu mối order, then link order, then supplier name (`hd-tt-report.ts:69-80`). A new supplier inserts a row mid-list, so drafts must be keyed by link, not by position.
<!-- Red team: finding 12 -->
- **Edit rights.** Admin passes every check (`lib/acl/effective.ts:73`), so `canEdit` is proven only with non-admin accounts (step 13). `hd-tt/page.tsx` has an explicit read guard from phase 4. This phase reuses its `userId`.
<!-- Updated: Validation Session 1 - S rule is a UI guard plus a check-line explanation; the server action is unchanged -->
- **S rule scope.** The user decided on 2026-11-23 (validation question 10) that S is guarded in the HĐ-TT UI and explained on the ✗ check line. The server action stays unchanged. It merges stored fields on every save, so a server-side S rule would block every edit to a row that already holds an imported S.
- **Do not edit `HD_TT_MONEY_COLS`.** These labels are also the Excel header (`export-sheet-hd-tt.ts:8-24`) and are asserted by `__tests__/export-sheets.test.ts`.

## Files

**Create:**
<!-- Red team: finding 10 -->
<!-- Red team: finding 12 -->
<!-- Red team: finding 14 -->
- `lib/du-an/dt-hd-tt/hd-tt-screen-model.ts`:
  - screen labels, with the Excel letter kept as a small code (for example "HĐ gồm VAT · E"). Separate from `HD_TT_MONEY_COLS`;
  - groups covering all 13 money columns: Hóa đơn (HĐ chưa VAT, VAT, E) | Thanh toán (G, I, J, K) | Thực tế (T, U, V) | Lấy về (W, X, Y);
  - screen rows carrying `siblingIndex`, `siblingCount` and `counterpartySettled`, derived from the report rows;
  - `canTypeSplit(row)` and `splitBlockers(rows)`;
  - `hdTtCellPatch(field, text)` and `supplierCellPatch(col, value)`;
  - the pure draft reducer `mergeDrafts`;
  - `canEditFrom(check, userId, projectId)`.
- `components/du-an/dt-hd-tt/hd-tt-screen.tsx`
- `components/du-an/dt-hd-tt/hd-tt-screen-table.tsx`
- `components/du-an/dt-hd-tt/hd-tt-edit-cell.tsx`
- `components/du-an/dt-hd-tt/dt-tt-screen.tsx`
<!-- Red team: finding 4 -->
- `scripts/dt-hd-tt-ui-measure/hd-tt.ts`
- Tests:
  - `lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-model.test.ts`
  - `lib/du-an/dt-hd-tt/__tests__/hd-tt-link-id.test.ts`
  <!-- Red team: finding 10 -->
  - `lib/du-an/dt-hd-tt/__tests__/hd-tt-split-rules.test.ts`
  <!-- Red team: finding 5 -->
  - `test/unit/hd-tt-screen-table.test.ts`: static render only.
  - `test/unit/dt-tt-screen.test.ts`: static render only.

**Modify:**
- `lib/du-an/dt-hd-tt/hd-tt-report.ts`: additive `linkId: number | null`.
<!-- Red team: finding 12 -->
- `app/(app)/du-an/[id]/dt-hd-tt/hd-tt/page.tsx`: take `userId` from the guard and pass `canEdit = await canEditFrom(canAccessEntitlement, userId, projectId)`.
- `app/(app)/du-an/[id]/dt-hd-tt/dt-tt/page.tsx`
<!-- Red team: finding 10 -->
- `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx`: `cellPatch` uses `supplierCellPatch` for H, S and X, so the grid parses money the Vietnamese way, like HĐ-TT.
<!-- Red team: finding 4 -->
<!-- Red team: finding 15 -->
- `lib/du-an/dt-hd-tt/screen-links.ts` and its test:
  - the `hd-tt` `loc` builder and parser, and the `dt-tt` anchors, with round-trip tests;
  - `hd-tt` and `dt-tt` added to `READY_TARGETS`.

## Steps

1. **Additive `linkId`.** Add it and test it in `hd-tt-link-id.test.ts`.
<!-- Red team: finding 10 -->
   - `hd-tt-split-rules.test.ts` documents the three ✗ cases: S on a row without a đầu mối, on the first sibling, and under an unsettled đầu mối.
   - It also checks that S on a later sibling of a settled multi-NCC đầu mối keeps Σ T ✓.
2. **One bounded scroll box** owns all three sticky axes:
   - a two-row header with groups;
   - the NCC column, with `line-clamp-2` and the full name in `title`;
   - a `tfoot` total row, which needs its own background and z-index because the global rules cover only `thead` and `tbody`.
<!-- Red team: finding 14 -->
<!-- Red team: finding 13 -->
3. **Columns and markers.**
   - All 13 money columns are always shown, grouped as in `hd-tt-screen-model.ts`, inside the bounded box. The NCC column is sticky and the box scrolls horizontally. L (I / E) and Z follow.
   - Rows are grouped under their đầu mối.
   - The markers "(H)", "(tạm = HĐ)" and "(tách)" become `StatusBadge` badges next to the number.
   - Formulas are in tooltips.
<!-- Red team: finding 14 -->
<!-- Red team: finding 6 -->
4. **Filters.**
   - The `loc` chips are `con-phai-lay-hd`, `con-phai-lay-ve` and `co-viec`. They are the values a Tổng quan to-do or figure links to, and they use phase 4's `HD_TT_LOC_PREDICATES`, so counts and landings share one predicate.
   - The total row always shows `report.totals`, labelled "Tổng cộng (cả bảng)" while a filter is active.
<!-- Red team: finding 13 -->
5. **Number links.** E links to `hoa-don?filter.supplierId={id}`. G links to `chi-thuc-te?filter.supplierId={id}`.
<!-- Red team: finding 10 -->
<!-- Red team: finding 12 -->
6. **Edit mode, for edit users only.**
   - `canEdit` comes from `canEditFrom`. Read users see no toggle and no inputs.
   - The toggle "Nhập H / S / X / Z" adds explicit H and S input columns. X and Z become inputs.
   - Inputs appear only on rows with a `linkId`. Rows without a link show "Thêm dòng NCC ở Đầu mối" and link to `dau-moi#ncc`.
   - S is enabled only when `canTypeSplit(row)` is true: a later NCC of a multi-NCC đầu mối whose thực tế is settled. Elsewhere it is disabled with a reason-specific title:
     - "Gắn NCC vào đầu mối trước";
     - "Đầu mối chỉ có một NCC";
     - "NCC đầu tiên nhận phần còn lại — nhập S ở NCC sau";
     - "Đầu mối chưa chốt thực tế".
<!-- Red team: finding 10 -->
<!-- Updated: Validation Session 1 - S rule is a UI guard plus a check-line explanation; the server action is unchanged -->
7. **Σ T explanation.**
   - When the Σ T check is ✗ and `splitBlockers(rows)` is not empty, the screen's check line adds "do S ở dòng {NCC}". It names each row whose stored S is outside the rule, for example an imported value.
   - Each name links to `dau-moi?filter.supplierName={name}#ncc`, where that S stays editable because the server action is unchanged.
   - The print view's `TieOutLine` is untouched.
<!-- Red team: finding 10 -->
8. **Save flow.**
   - **Parsing per field** (`hdTtCellPatch`):
     - H, S and X use `parseNumberText(text, label, "money")`;
     - Z is trimmed text of at most 1 000 characters;
     - empty input means null.
   - Call `updateCounterpartySupplier(linkId, projectId, patch)`.
   - **Drafts** are keyed by `` `${linkId}:${field}` ``, never by row position. `mergeDrafts` keeps each draft through re-renders until the server value matches it.
   - **On failure:** keep the draft, mark the cell with the returned message, and leave focus on that cell. This covers `LINK_GONE` too.
   - **On success:** focus moves on.
   - There is no extra `router.refresh()`. The action's `revalidateMappingChange` already re-renders the page with the new T of the first sibling.
   - **Keys:** Enter saves and moves down after success, Tab moves across, Esc reverts.
<!-- Red team: finding 10 -->
9. **Đầu mối grid parity.** Switch H, S and X in `dau-moi-suppliers.tsx` to `supplierCellPatch`, which calls `parseNumberText(String(value ?? ""), label, "money")`. `hd-tt-screen-model.test.ts` asserts that both screens parse "1.500" and "1.500.000" identically. The grid's edit overlay shows whole-number money as plain digits, which both parsers read the same way.
<!-- Red team: finding 13 -->
10. **DT-TT screen.**
    - A sticky jump bar "Phần I · II · III".
    - Collapsible Phần I groups.
    - `#dm-{id}` anchors on Phần II rows.
    - Chênh uses `phanIIIDiff`.
    - "Chưa chốt" links to `dau-moi?filter.actual=chua-chot`.
    - The untagged-receipts warning links to `thuc-te-nhap?filter.counterpartyId=none`.
    - The no-kind warning links to `du-toan?loai=thieu`.
<!-- Red team: finding 5 -->
11. **Page order on both pages.** The order is toolbar, banner, screen wrapper, then the print wrapper (`data-print-view`) last. The views themselves are untouched. The `hd-tt` measure checks this order in the DOM.
<!-- Red team: finding 4 -->
<!-- Red team: finding 15 -->
12. **Contract and readiness.**
    - Add the `hd-tt` and `dt-tt` builders with round-trip tests.
    - Add both targets to `READY_TARGETS`. Tổng quan's links to them then carry their filters and hashes.
    - Run `measure todos` again.
<!-- Red team: finding 12 -->
<!-- Red team: finding 4 -->
<!-- Red team: finding 5 -->
13. **Measure `hd-tt` and the manual sessions** run inside the manual session protocol (plan.md), on project 4. The dump is restored afterwards.
    - `measure hd-tt --as edit` checks:
      - NCC names on at most 2 lines;
      - header, NCC column and total row holding position while scrolling;
      - 13 money column headers;
      - the print view last;
      - more than zero inputs in edit mode.
    - `measure hd-tt --as read` checks that there is no toggle and there are zero inputs.
    - Named manual checks with the edit account:
      - type H, S on an allowed row, X, and a Vietnamese Z;
      - type "1.500" on both screens and get the same value;
      - delete the link row on Đầu mối in a second tab, then save on HĐ-TT: the cell is marked, the draft is kept and focus stays;
      - a draft survives the re-render that follows another cell's save;
      - Enter, Tab and Esc behave as in step 8.

## Todo

- [ ] `linkId` added; golden and export tests unchanged and green; split-rule cases documented
- [ ] Screen table: 13 grouped money columns, sticky axes, badges, `loc` filters, number links
- [ ] `canTypeSplit`, reason titles and the Σ T explanation naming the S row
- [ ] Per-field parsing; drafts keyed by link and field; failure keeps the draft; no extra refresh
- [ ] Đầu mối grid H / S / X on the money parser, with the parity test
- [ ] `canEditFrom` in the page, with a unit test of the request it makes
- [ ] DT-TT screen: jump bar, collapsible groups, warning links
- [ ] `hd-tt` and `dt-tt` builders; both targets ready; `measure todos` green
- [ ] `measure hd-tt` per account and the manual sessions inside the session protocol; dump restored
- [ ] Baseline compare exits 0

## Verification

<!-- Red team: finding 1 -->
```powershell
npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-model.test.ts lib/du-an/dt-hd-tt/__tests__/hd-tt-link-id.test.ts lib/du-an/dt-hd-tt/__tests__/hd-tt-split-rules.test.ts lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts test/unit/hd-tt-screen-table.test.ts test/unit/dt-tt-screen.test.ts test/unit/dt-hd-tt-print-views.test.ts lib/du-an/dt-hd-tt/__tests__/dt-tt-hd-tt-report.test.ts lib/du-an/dt-hd-tt/__tests__/export-sheets.test.ts test/unit/module-release-entrypoints.test.ts
npx tsx scripts/dt-hd-tt-ui-measure.ts todos --base-url http://127.0.0.1:3003 --project 4
npx tsx scripts/dt-hd-tt-ui-measure.ts hd-tt --base-url http://127.0.0.1:3003 --project 4 --as edit
npx tsx scripts/dt-hd-tt-ui-measure.ts hd-tt --base-url http://127.0.0.1:3003 --project 4 --as read
```

Then run the common gate, including the baseline `compare` on `127.0.0.1:3003` after the dump is restored.

<!-- Red team: finding 5 -->
<!-- Red team: finding 12 -->
**Criterion 5 proof:**
- `hd-tt-screen-model.test.ts` covers these cases:
  - every one of the 13 money keys is in exactly one group;
  - `canTypeSplit` on all five row situations;
  - per-field parsing, including a 1 001-character Z;
  - parser parity on "1.500" and "1.500.000";
  - `mergeDrafts` with rows reordered and a failed save;
  - `canEditFrom` requests `minLevel: "edit"` with the project scope.
- `hd-tt-screen-table.test.ts` renders statically and checks that:
  - there are no inputs when `canEdit` is false;
  - edit mode shows four inputs per linked row;
  - S is disabled with its reason where `canTypeSplit` is false;
  - the 13 headers and the sticky classes are present.
- `measure hd-tt` passes for both accounts, and the named manual checks pass.

## Risks and rollback

- **Concurrent edits by two kế toán:** the action merges per field under the project lock, so the last write per field wins. That matches the Đầu mối grid today.
<!-- Red team: finding 12 -->
- **Typing on project 4 changes the baseline data:** every write happens inside the session protocol, and the restore is proven by the matching fingerprint in the next `compare`.
<!-- Red team: finding 14 -->
- **Width:** 13 money columns at 1440 px need horizontal scroll inside the bounded box. The sticky NCC column keeps each row readable.
<!-- Red team: finding 15 -->
- **Rollback:**
  1. Revert PR 7. No later PR touches its files.
  2. Then re-run `measure todos` and the baseline `compare`.

  `linkId` is harmless if left in place.
