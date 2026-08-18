# Phase 2 — Import adapter `bang-can-doi-vat-tu`

## Context links

- Brainstorm parser rules & risks: `plans/reports/brainstorm-260818-can-doi-vat-tu-mam-non-trai-chuoi.md`
- Skeleton to copy: `lib/import/adapters/du-an-xay-dung.adapter.ts`
- Contract: `lib/import/adapters/adapter-types.ts` (`ImportAdapter`)
- Registry: `lib/import/adapters/adapter-registry.ts`
- Utilities: `lib/import/adapters/excel-utils.ts` (`num`, `parseExcelDate`, `normHeader`, `buildRowsFromMatrix`)
- Real CSV: `SOP/Bang cân đối vật tư.xlsx - Bảng vật tư theo dự toán.csv`
- Existing adapter tests: `lib/import/adapters/__tests__/`
- Rollback: whatever mechanism `du-an-xay-dung` uses — inserted rows carry `importRunId`; `rollbackImportRun(id)` deletes by that id.

## Overview

- Date: 2026-08-18
- Description: Adapter that parses the "Bảng cân đối vật tư" CSV/XLSX into `ProjectEstimate` + `ProjectTransaction` rows (invoice values in `amountHd`, `amountTt=0`), grouped by `ProjectCategory` per HM×section. Hard subtotal-reconciliation gate at ±0.5%.
- Priority: P1
- Implementation status: done (2026-08-18)
- Review status: pending

## Key Insights

- Sheet has 2 HM blocks. HM header detected by cell starting with `HM:` in column A. Section marker detected by single Roman numeral in STT column (I/II/III/IV) with a section name in column B ("Vật liệu", "Nhân công", "Máy", "Chi phí chung").
- No stable itemCode in sheet — STT is unstable (duplicates across sections, blanks). Synthetic itemCode: `<HMSlug>-<SectionCode>-<Seq>` where `HMSlug` = "HM1"/"HM2" (derived from block index, not the long HM string), `SectionCode` = VL/NC/MAY/CPC, `Seq` = 3-digit zero-padded sequence per (HM, section).
- Row classification (executed in order):
  1. Row where column A starts with `HM:` → new HM block.
  2. Row where STT is `I|II|III|IV` (single token) → section switch.
  3. Row where column B starts with `Cộng` / `Tổng` → subtotal row (captured for reconciliation, NOT emitted).
  4. Row where numeric STT is present OR (blank STT AND `DựToán TT` present) → estimate item; assign new synthetic itemCode; **if row also has HĐ TT populated, also emit a transaction row with the same itemCode**.
  5. Row where blank STT AND only hóa-đơn values → transaction sub-line of the last estimate item (inherit its itemCode + categoryId).
  6. Row where blank STT AND only note text (columns C+ empty except an "action item" string) → skip.
- Number normalization: strip commas/spaces; `(x)` → negative; non-numeric text → null; ignore all columns after Số HĐ (scratch).
- `Số HĐ` copied verbatim to `invoiceNo` (e.g. "7+9", "353+374").
- Sheet's `TT` (thanh tiền) may differ from `SL × ĐG` due to sheet rounding — store the sheet's `TT` in `totalVnd`/`amountHd` as-is; log rows where |sheet TT − SL×ĐG| / max(TT,1) > 0.5% (informational, not blocking).
- **Reconciliation gate (blocking):** for each (HM, section), sum parsed estimate `TT` and transaction `amountHd`; compare to the section's `Cộng` row values from the sheet (parsed but not emitted). If |Δ| / sheet-subtotal > 0.5%, return validation error with per-section diff table.
- Chi phí chung rows have SL=1, ĐVT="gói" (design decision 1). Also covers "Thi công phá dỡ", "Máy khác %" (invoice-only items with no clean qty).
- Cross-phase note ("lấy hđơn từ gđ1 sang") → append to transaction `note`; will surface as mismatch in Phase 4 tab, documented.
- **`$executeRaw` bypasses zod** — the adapter must still write only known transactionType values. Enum values used: `lay_hang` (VL), `nhan_cong` (NC), `may_moc` (Máy), `chi_phi_chung` (CPC). Phase 1 adds `chi_phi_chung` to zod so downstream manual edits validate.

## Requirements

- New file `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts` implementing `ImportAdapter` with `supportsRollback: true`.
- Register in `lib/import/adapters/adapter-registry.ts`.
- Parser: HM block split + section tracking + row classification + subtotal capture (as above).
- Validator: subtotal reconciliation gate per (HM, section) at ±0.5%; also fail if HM block has zero estimate rows or zero transaction rows.
- Apply: for each HM, `get-or-create` project (by fixed code "MNTC-GD1"; project name "Mầm Non Trại Chuối GĐ1"); per (HM, section) `get-or-create` `ProjectCategory` (code=`<HMSlug>-<SectionCode>`, name=`<HM label> - <Section label>`); insert `ProjectEstimate` and `ProjectTransaction` rows via `$executeRaw` tagged with `importRunId`.
- Adapter option: `asOfDate?: string` (ISO date) — applied as `date` on every transaction row; default `new Date()` at apply time. Threaded through `ParsedData.meta` or a mapping key (existing pattern: check how `du-an-xay-dung` handles similar options; if none, use `meta.asOfDate`).
- Every transaction row gets `note` starting with "Nhập từ bảng cân đối vật tư" + optional sheet note appended.
- Unit test in `lib/import/adapters/__tests__/bang-can-doi-vat-tu.test.ts` that reads the real CSV from `SOP/` and asserts: total row count, HM1 estimate subtotal 7,511,996,392 (±0.5%), HM1 invoice subtotal 4,303,557,521 (±0.5%), HM1 section subtotals (Cộng VL 4,888,371,451 / 3,493,161,627; NC 2,134,640,427 / 416,607,407; Máy 488,984,514 / 153,530,094; CPC 240,258,393 HĐ-only), presence of at least one `chi_phi_chung` row.

## Architecture

- Adapter is stateless (per contract). Parser is pure (no DB). Validator is pure. Apply runs inside the caller's Prisma transaction.
- Idempotency: project matched by fixed `code="MNTC-GD1"`; categories matched by `(projectId, code)`. Estimates deduped by `(projectId, categoryId, itemCode)` — synthetic itemCode is stable across re-imports (deterministic seq per section) IF row order in the sheet is preserved. If the sheet is re-ordered, itemCodes shift → **runbook: rollback then re-import**. Documented in Phase 5 convention doc.
- Transactions have NO natural dedup key. Re-import without rollback WILL double-count. Enforced by convention only; adapter does not attempt dedup (would be fragile and violates one-row-one-event).

## Related code files

- Create: `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts`
- Modify: `lib/import/adapters/adapter-registry.ts` (add import + array entry)
- Create: `lib/import/adapters/__tests__/bang-can-doi-vat-tu.test.ts`
- Read (do not modify): `lib/import/adapters/du-an-xay-dung.adapter.ts`, `lib/import/adapters/excel-utils.ts`

## Implementation Steps

1. Read the CSV end-to-end (all 554 rows) to confirm every row classification path is exercised. Note edge cases (inox block with blank STT + real dự toán; "Xong" text in numeric cells; `#REF!`; `(x)` negatives; duplicate STT across sections; sheet subtotal row wording variants).
2. Build the parser: matrix → row classifier → emit `{_type: 'estimate'|'transaction'}` rows with `categoryCode`, synthetic `itemCode`, and parsed numbers. Capture subtotal rows into a separate `meta.sheetSubtotals` map keyed by `(hmSlug, sectionCode)`.
3. Build the validator: compare parsed rollups to `meta.sheetSubtotals` per (HM, section); collect any diff > 0.5% as `ValidationError` with a message including both numbers and the diff. Also flag rows where sheet `TT` diverges from `SL × ĐG` by > 0.5% (informational log, not error).
4. Build `apply`: copy `du-an-xay-dung.adapter.ts` skeleton — project get-or-create, category get-or-create (per HM×section), estimate insert, transaction insert (with `amountTt=0, unitPriceTt=0`, `date = meta.asOfDate ?? new Date()`, `note = "Nhập từ bảng cân đối vật tư"` + optional sheet note, `status='approved'`).
5. Register in `adapter-registry.ts`.
6. Write unit test using the real CSV. Test must pass parse → validate → assertions on `ParsedData` rollups; do NOT run `apply` against a real DB in unit tests (use integration test if needed later).
7. Run: `pnpm test lib/import/adapters/__tests__/bang-can-doi-vat-tu.test.ts`.
8. Manual smoke via `/admin/import` on a dev DB (Phase 3).

## Todo list

- [ ] Full CSV read (all rows), classify each row on paper — verify no case missed.
- [ ] Parser + synthetic itemCode generator.
- [ ] Subtotal capture + reconciliation validator.
- [ ] Apply function (copy skeleton, wire `asOfDate` option).
- [ ] Registry entry.
- [ ] Unit test with real CSV fixture.
- [ ] Run test → iterate parser until gate passes.
- [ ] Typecheck.

## Success Criteria

- Unit test green with the real CSV.
- `pnpm typecheck` green.
- Dry-run via `/admin/import` returns 0 validation errors on the real CSV.
- Parsed HM1 estimate subtotal = 7,511,996,392 ± 0.5%; HM1 invoice subtotal = 4,303,557,521 ± 0.5%.
- No `chi_phi_chung` row is skipped or misclassified as estimate.

## Risk Assessment

- **Row classification bugs (High × High):** heterogeneous rows; missing an edge case silently drops or double-counts a row. Mitigation: (a) subtotal gate catches most misses; (b) unit test with real CSV catches remaining; (c) full manual CSV walk in Todo step 1.
- **Sheet subtotal wording variants (Med × Med):** "Cộng VL", "Tổng vật liệu", stray whitespace. Mitigation: normalize (lowercase, strip diacritics, collapse spaces) before matching; test asserts each section matched.
- **Synthetic itemCode instability across re-imports (Med × Med):** any row insertion in the sheet shifts every downstream seq → estimates deduped incorrectly. Mitigation: convention doc says "rollback before re-import"; adapter does NOT attempt fuzzy dedup.
- **Double-count on re-import (High × High if convention ignored):** transactions have no dedup. Mitigation: convention doc + Phase 3 runbook + `supportsRollback: true`.
- **`(x)` negatives lost (Low × Med):** must preserve — user corrections. Mitigation: explicit unit test case for a `(x)` row.
- **`amountTt=0` treated as "not yet entered" vs actual zero (Low × Low for import; Med × Med for future edits):** convention doc addresses.

## Security Considerations

- Adapter runs behind existing `/admin/import` guard (admin only). No new endpoint.
- `$executeRaw` uses parameterized values (Prisma tagged templates) — no SQL injection.
- Audit middleware bypass is intentional and documented, matching `du-an-xay-dung` precedent.

## Next steps

Phase 3 uses this adapter against the real CSV.
