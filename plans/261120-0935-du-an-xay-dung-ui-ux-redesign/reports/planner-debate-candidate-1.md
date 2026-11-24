# Planner debate candidate 1: zero print/export drift, smallest safe change

Date 2026-11-20. Lens: print and Excel must not drift, every change should be the smallest one that works, and the baseline comes first. The full accepted scope (acceptance criteria 1–9) is delivered.

All paths are relative to the repository root. Line citations were re-read in the worktree `.claude/worktrees/du-an-danh-muc-hop-dong-d92348` (HEAD `132a73b`, merge-base with `origin/main` `420047c`). None of the cited files are touched by PR #24.

## Outcome in one paragraph

The three existing report components (`DtHdView`, `DtTtView`, `HdTtView`) are frozen and become print-only. New screen components read the same report object, so paper and Excel stay identical and the screen cannot show different figures. A baseline is captured before any app change: print-media text, PDF page count and Excel cells on project 4, plus static-markup snapshots of the three views and Excel sheet snapshots on the fixture. After every phase the baseline is compared again.

The work is split into eight phases. Each phase is its own PR, ships on its own and is reverted with a single `git revert`. Phase-by-phase:

- No schema change, no new server action, no new API route. Data reaches new screens only through existing read actions: `getDtHdTtReports`, `listAliasBoard`, `listCounterparties`.
- There is one engine edit: an optional `reason` field on `DtHdInvoiceRow`. It changes no figure.
- The DataGrid gains one optional prop, `initialFilters`.
- Total effort is 13 days.

## What I could not verify

The repository hook blocks every read under `node_modules`, so I could not open `node_modules/next/dist/docs/` or the `@base-ui/react` 1.4.1 type definitions; the version is confirmed from `package-lock.json:515-516`. Claims that depend on them are tagged `[UNVERIFIED]`, and Phase 0 step 1 makes the implementer read them first. The Next APIs I rely on are limited to ones this repo already uses:

- `useSelectedLayoutSegment` (`components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx:30`);
- `searchParams` as a Promise (`app/(app)/du-an/[id]/dt-hd-tt/anh-xa/page.tsx:14,28`);
- `revalidatePath` (`lib/du-an/dt-hd-tt/entry-write-guards.ts:55`);
- `router.refresh` (`app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx:91`);
- `next/dynamic` with `ssr:false` (`app/(app)/du-an/[id]/dt-hd-tt/hoa-don/hoa-don-client.tsx:23`).

There are two exceptions: `window.history.replaceState` integration (Phase 4) and React `cache` (Phase 3). Both are tagged.

## Data flows

| Flow | Enters | Transforms | Exits |
|---|---|---|---|
| Reports | DB rows of 10 tables for one project (`lib/du-an/dt-hd-tt/report-service.ts:20-31`) | `buildReports` (`lib/du-an/dt-hd-tt/reports.ts:20-30`), unchanged | Print view (frozen), screen component (new), Tổng quan (`overview.ts`, new), Dashboard (Phần III total row only), Excel route (unchanged) |
| Alias board | invoice lines, receipts, aliases, groups, DT lines (`lib/du-an/dt-hd-tt/alias-service.ts:135-157`) | `buildAliasBoard` (pure) | Ánh xạ screen, Tổng quan to-dos, the sub-nav "chưa gán" badge |
| URL contract | links built by `screen-links.ts` | page parses `searchParams` with the same module | initial client state (grid filters, Ánh xạ status/search, DT-HĐ open/filters, HĐ-TT filter) |
| HĐ-TT edit | typed text in an H / S / X / Z cell | `parseNumberText` money style (`lib/du-an/dt-hd-tt/register-ui.ts:44`), then `updateCounterpartySupplier` merges the patch under the project lock (`lib/du-an/dt-hd-tt/counterparty-service.ts:208-231`) | DB row; `revalidateMappingChange` plus `router.refresh()` recompute I, J, K, T, U, V, W, Y and the checks |
| Book detection | `ProjectInvoiceLine` presence for the project | `projectHasDtHdTtBook` (new, not a server action) | shell note on the "Vật tư & công nợ" group; Dashboard "Thực tế" card switch |

## Answers to the eight design choices

### 1. Screen versus print: option (a), print-only frozen views plus separate screen components

**Choice.** Each report page keeps its `ReportToolbar` and `SettingsBanner` and then renders two siblings:

- first `<div className="print:hidden"><XScreen …/></div>`;
- then `<div className="hidden print:block"><XView …/></div>`, the unchanged component.

The print wrapper must be the last child, so the `space-y-4` margins in print are exactly today's. That holds because a hidden first sibling has no box, and the last child gets no end margin. This applies to all three reports. For DT-TT the original brainstorm allowed in-place additions, but acceptance criterion 7 requires `DtTtView`'s static markup to stay unchanged. Links, a jump bar and collapsible groups inside it would break that, so DT-TT also gets a separate screen component.

The repo already uses the `hidden print:inline` and `print:hidden` pattern (`components/data-table/sort-header.tsx:49`, `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx:97`).

**Why this option.** Print is `window.print()` on the live DOM (`components/export-buttons.tsx:93-103`, `app/globals.css:278-290`). Paper is identical only if the printed DOM is untouched, and option (a) guarantees that by construction. Option (b) puts screen state into the printed markup, which is exactly how drift happens. Option (c), a print route, changes the "In" flow and its page-size and fit options, and adds a route that has to be guarded. Both were rejected.

**Cost.**

- **HTML size.** DT-HĐ carries the hidden print tree (about 780 rows) plus the screen component's props, which are serialised in the RSC payload. I estimate 1.6–2.2× today's document size; it is measured in Phase 4 against a 2.2× gate.
- **Small pages.** DT-TT (202 rows) and HĐ-TT (30 rows) grow by a negligible amount.
- **Print drift.** Print drift is close to zero, and the snapshot test plus the print-text baseline catch any slip.
- **"In" flow.** The flow does not change: the same `PrintButton` on the same page.

**Load-bearing assumption.** Hidden print DOM plus screen props stay fast enough at 1366 px or wider on the office network.

**Fails first when** DT-HĐ's document exceeds the 2.2× gate. The fallback, in order:

1. Pass the screen a trimmed projection of `DtHdReport` with only the rendered fields.
2. Only if that still fails, escalate to the brainstorm's plan B (one markup) as a user decision, because it raises print risk.

### 2. Tổng quan data source: existing `getDtHdTtReports` plus `listAliasBoard`, through a pure `buildOverview`

**Choice.** The Tổng quan page:

- calls `getDtHdTtReports` through the existing `loadReportPage` loader (`components/du-an/dt-hd-tt/load-report-page.ts:10-17`);
- calls `listAliasBoard` through `readAliasBoard`, a per-request `React.cache` wrapper in `lib/du-an/dt-hd-tt/cached-reads.ts` `[UNVERIFIED: confirm React cache in this Next version's docs]`. The wrapper lets the DT-HĐ-TT layout badge and the page share one board read.

A pure `buildOverview(reports, board, projectId)` in `lib/du-an/dt-hd-tt/overview.ts` returns:

- the headline figures;
- the đầu mối list;
- the to-dos;
- the check summary.

A lighter summary service was rejected because it would re-derive engine numbers and become a second source of truth.

**How equality is proven.** Every headline figure is a `{ key, label, vatBasis, value, ref }` object, where `ref` names a report cell. Examples: `{ report: "hdTt", path: "totals.invoiceTotal" }`, `{ report: "phanIII", row: "total", col: "estimate" }`.

`resolveCell(reports, ref)` is the only way figures get their value. `overview.test.ts` builds `buildReports(fixture())` (`lib/du-an/dt-hd-tt/__tests__/report-fixture.ts:42`) and, for every figure, asserts `figure.value === resolveCell(reports, figure.ref)`. It also asserts the ref points at a real field, and that no figure exists without a ref.

The Phần III "Chênh" figure is computed in the view as `estimate − actual` (`components/du-an/dt-hd-tt/dt-tt-view.tsx:133`). The test therefore also renders `DtTtView` to static markup and asserts that the formatted value appears in the "CHI PHÍ XÂY DỰNG SAU THUẾ (Gxd)" row.

**Headline figures** follow the brainstorm. Each is labelled with its VAT basis, and no figure mixes bases.

| Group | Figures | Source |
|---|---|---|
| Phần III total row | Dự toán (Gxd), Thực tế, Chênh | `lib/du-an/dt-hd-tt/phan-iii.ts:67` |
| HĐ-TT, gồm VAT | E, T, U | HĐ-TT `totals` |
| HĐ-TT payments | I, V, Y | HĐ-TT `totals` |

**Đầu mối cần chú ý.** These are Phần II rows A and B with a non-null `diff`, sorted ascending so the most over budget comes first. Ten are shown, with "xem đủ" linking to DT-TT `#phan-ii`. Every value shown is a Phần II cell (`dtInclVat`, `actual`, `diff`). Rows from block C are left out because they have no dự toán.

**Việc cần làm.** Rows with zero are hidden. Each row shows its count and/or amount, and the link is built by `screen-links.ts`.

| To-do | Count / amount source | Link |
|---|---|---|
| Tên chưa gán, per source hd / tt / dt | board `alias === null` count and Σ amount (same expression as `anh-xa-client.tsx:101-102`) | `anh-xa?tab=…&status=chua_gan` |
| Đề xuất chờ xác nhận, per source | board `alias.status === "de_xuat"` | `anh-xa?tab=…&status=de_xuat` |
| Dòng DT thiếu hệ số (HĐ) | count of DT-HĐ lines with status "Chưa kết luận (thiếu hệ số)" | `anh-xa?tab=hd&status=thieu_he_so` |
| Thiếu hệ số (thực tế) | count of Phần I rows with `qtyTt === null && !groupOnly` | `anh-xa?tab=tt&status=thieu_he_so` |
| Thực tế nhập chưa gắn đầu mối | `dtTt.untaggedReceipts` amount (`dt-tt-view.tsx:107-109`) | `thuc-te-nhap?dauMoi=0` |
| Đầu mối chưa chốt thực tế | Phần II rows with `actual === null` | `dau-moi?loc=chua-chot` |
| NCC có HĐ nhưng chưa thuộc đầu mối | HĐ-TT rows with `counterpartyId === null && invoiceTotal !== 0` | `dau-moi?loc=khong-dau-moi#ncc` |
| Dự toán chưa có loại VL / NC / MTC | `phanIII.dtWithoutKind` | `du-toan` (see unresolved question 4) |
| Chưa cài đặt tỷ lệ | `settings.missing` | `cai-dat` |
| Ghi chú Z của kế toán | HĐ-TT rows with `todo` | `hd-tt?loc=co-viec` |

The "dự toán chưa có loại" to-do is fixed on the Dự toán tab, not in Ánh xạ. DT lines in a category without a VL / NC / MAY suffix are dropped before Ánh xạ ever sees them (`lib/du-an/dt-hd-tt/keys.ts:84-86`, `report-service.ts:46`).

**Kiểm tổng** shows one line, "n/n khớp", built from these checks:

- the DT-HĐ block tie-outs and `grandCheck`;
- `dtTt.checks`;
- `hdTt.checks`.

It is a `<details>` element. Only failing checks are listed, each with Δ and its fix link: Σ E links to Hóa đơn, Σ T to Đầu mối, the DT-HĐ grand check to Ánh xạ, and Phần I to Ánh xạ tt.

**Shortcuts.** Each of the three reports gets "Xem" (the report page, where "In" lives) and "Xuất Excel" (the same `/api/du-an/{id}/dt-hd-tt/export?report=` link as `report-bits.tsx:73`).

**Load-bearing assumption.** Phần III and HĐ-TT totals are the figures leaders read; the brainstorm accepted this.

**Fails first when** a leader asks for a figure that is not a report cell, for example a DT-vs-HĐ total. The answer stays "no new totals" (non-goal).

### 3. Dashboard book detection and which cards change

**Detection.** A project "has the book" when it has at least one live `ProjectInvoiceLine`. This is the same condition under which old-tab HĐ transactions come from the book and carry `amountTt: 0` (`lib/du-an/dt-hd-tt/invoice-transaction-sync.ts:73-91`); manual invoice lines are refused while legacy HĐ transactions remain.

The detector is `projectHasDtHdTtBook(projectId)` in `lib/du-an/dt-hd-tt/book-presence.ts`. It runs `findFirst({ where: { projectId, deletedAt: null }, select: { id: true } })`, which is covered by the `@@index([projectId, …])` indexes on `project_invoice_lines` (`prisma/schema.prisma:786-788`). It is a plain lib function, not a server action, like `queryProjectById`. Its callers already passed the read guard (layout, `getProjectDashboard`).

There is no second source of truth: the detector reads the book itself.

**Cards.** Only "Thực tế (đã nhập)" changes, and only on book projects:

- the label becomes "Thực tế (sổ đội)";
- the value is the Phần III total row's `actual`;
- the sub-line reads "Theo sổ DT-HĐ-TT · Gxd − TT: {estimate − actual}";
- the tone is danger when that difference is negative.

The values come from the same `phanIIITotal(reports)` helper that Tổng quan uses, so they are equal by construction.

"Dự toán gốc", "Hóa đơn đã lấy" and "CĐT đã trả" are unchanged. "Hóa đơn đã lấy" already reads the book through derived transactions. Projects without invoice lines take the unchanged code path, and `getDtHdTtReports` is never called for them; a test asserts that.

**Load-bearing assumption.** A project with receipts or payments but no invoice lines is still on the old flow.

**Fails first when** a team enters Thực tế nhập before any invoice. The Dashboard then keeps the legacy figure until the first invoice line exists. This is acceptable, because "projects without a book keep their current numbers".

### 4. Shell navigation: two-row group/tab bar; DT-HĐ-TT's sub-nav is the second row

**Choice.** A client component, `components/du-an/project-tab-bar.tsx`, renders one `<nav aria-label="Dự án">` with two rows.

- **Row 1** holds the seven groups from the brainstorm.
- **Row 2** holds the active group's tabs. It is omitted for "Tổng quan" and "Cài đặt", which have one destination each, and for "Đối chiếu DT-HĐ-TT".
- **Labels.** The existing 14 tab labels and hrefs are kept verbatim (`app/(app)/du-an/[id]/layout.tsx:10-25`). Only group labels are new.
- **Group links** go to their first tab.
- **Note.** On book projects, the "Vật tư & công nợ" row adds the note "Hóa đơn ở các tab này lấy từ sổ Hóa đơn" inside the `nav`, so print hides it.

**Active group.** It comes from `useSelectedLayoutSegment()` called inside the `[id]` layout. The segment is `null` for the Dashboard and the first segment otherwise, for example `"hop-dong"` for `/hop-dong/123`. The segment-to-group mapping lives in the pure `lib/du-an/project-tab-groups.ts`, so it can be tested without React.

**`aria-current`.**

- The active tab gets `aria-current="page"`.
- The active group gets `aria-current="true"`.
- Single-destination groups get `"page"`.

Both rows use the existing primary-colour active style of the sub-nav (`dt-hd-tt-sub-nav.tsx:38`).

**No third row.** For "Đối chiếu DT-HĐ-TT" the shell renders row 1 only, and the sub-nav from `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx:11` sits directly below as row 2. The sub-nav becomes one line:

> Tổng quan | Báo cáo: DT-HĐ · DT-TT · HĐ-TT | Nhập sổ: Hóa đơn · Thực tế nhập · Chi thực tế | Thiết lập: Ánh xạ (n) · Đầu mối · Mã nhóm

I estimate about 970 px for this line, against roughly 1 060 px of content width at 1366 px. `flex-wrap` stays as the safety net. The `DT_HD_TT_SECTIONS` segment strings and `invoiceBookHref` are kept; they are used by `app/(app)/du-an/[id]/giao-dich/giao-dich-client.tsx:313`.

**Print safety.** Today the bar is `div.border-b.overflow-x-auto > nav` (`layout.tsx:82-83`). Print hides the `nav` and still prints the empty bordered `div`. The new bar keeps a `div.border-b` wrapper (without `overflow-x-auto`) around the `nav`, so the printed line is the same. The layout root keeps three children.

**Load-bearing assumption.** About 905 px of group labels fit in row 1 at 1366 px with the sidebar open.

**Fails first when** the sidebar is wider than estimated. The row then wraps rather than scrolling, so acceptance criterion 1 still holds, and the UI check script measures it.

### 5. HĐ-TT in-place H / S / X / Z: inline inputs in the HTML screen table

**Choice.** The HĐ-TT screen is an HTML table, not a DataGrid. The canvas grid cannot give a two-row grouped header with a sticky first column and a sticky total row. It is also client-only, while the screen must sit next to the server-rendered print view.

The editable cells and what editing them stores:

| Edited cell | Stores | Display |
|---|---|---|
| I | H | Shows `paid`; input empty when H is null, placeholder G; empty input clears H |
| T | S | — |
| X | `recovered` | — |
| Z | the to-do text | — |

Cell behaviour:

- **Number parsing.** Numbers go through `parseNumberText(text, label, "money")` (`register-ui.ts:44-54`), which accepts "1.500.000".
- **Which rows are editable.** Only rows that have a `ProjectCounterpartySupplier` row can be edited. The link id comes from the existing `listCounterparties` (`counterparty-service.ts:83`). Rows without a link show "Thêm dòng NCC ở Đầu mối" (`dau-moi#ncc`).
- **S on rows without a đầu mối.** S is disabled on rows with no đầu mối. Typing S there makes T = S (`lib/du-an/dt-hd-tt/hd-tt-report.ts:90-91`), which turns the Σ T check ✗ with no explanation (`hd-tt-report.ts:130-141`). See unresolved question 5.
- **Edit permission.** `canEdit` comes from the pattern used by the Đầu mối page (`app/(app)/du-an/[id]/dt-hd-tt/dau-moi/page.tsx:18-29`). Read users get plain text with no button. The server still enforces `edit` (`counterparty-service.ts:215`).

**Concurrency.** The action re-reads the row under `lockProjectDtHdTt` and merges only the sent field (`counterparty-service.ts:216-226`). Edits to different fields never clobber each other, and the same field is last-writer-wins, as in the Đầu mối grid today. After success:

- the edited cell keeps its value;
- `router.refresh()` recomputes the derived cells and the checks;
- drafts in other cells survive the refresh, because edit state is keyed by `(supplierId, col)` in the screen component.

On failure the cell reverts and `toast.error(result.message)` shows the reason.

**Keyboard.** Each editable cell is a focusable `<button>` with an `aria-label` such as "Sửa H thực nộp rà soát của {NCC}".

| Key | Action |
|---|---|
| Enter, F2 or a digit | Opens the input |
| Enter | Saves and moves down the same column |
| Tab / Shift+Tab | Saves and moves to the next / previous editable cell |
| Esc | Cancels |

**Load-bearing assumption.** Kế toán edits a few cells per session; one `refresh` per commit, about 12 queries, is acceptable.

**Fails first when** someone types a long run of cells quickly and refreshes queue up. The mitigation is to debounce the refresh to 400 ms after the last successful save.

### 6. URL-driven filters: one contract module, one optional DataGrid prop

**Choice.** `lib/du-an/dt-hd-tt/screen-links.ts` (pure) owns every builder and parser. Tổng quan, the report screens and the books import it, and invalid values are ignored. The parameters only drive client-side filtering of rows the user can already read, so they add no server query surface.

| Screen | Parameters | Effect |
|---|---|---|
| Ánh xạ | `tab=dt\|hd\|tt`, `status=all\|chua_gan\|de_xuat\|xac_nhan\|ngoai_dt\|thieu_he_so`, `q=<text ≤100>` | Initial tab, status filter and search (`anh-xa-client.tsx:39-41` start from these). The new `thieu_he_so` means an alias with `dtKey` and `factor === null`, hd/tt only. |
| Hóa đơn | `ncc=<supplierId>`, `soHd=<text>`, `chuaGan=1` | Initial `supplierId` equals, `invoiceNo` text, `mapping` equals "chưa gán" |
| Thực tế nhập | `dauMoi=<id>` (0 = chưa gắn), `chuaGan=1` | `counterpartyId` equals, `mapping` equals |
| Chi thực tế | `ncc=<supplierId>`, `dauMoi=<id>` | `supplierId` equals, `counterpartyId` equals |
| Đầu mối | `loc=chua-chot\|khong-dau-moi` (+ `#ncc`) | Counterparty grid: new read-only boolean column "Chưa chốt" equals true. Supplier grid: `counterpartyId` equals "0" |
| DT-HĐ | `loc=con-thieu\|vuot\|chua-co-hd\|thieu-he-so`, `dauMoi=<id\|none>`, `mo=<id\|none,…>` | Status filter, the one-đầu-mối filter, and the open (expanded) đầu mối kept in the URL |
| HĐ-TT | `loc=can-nop-them\|nop-vuot\|con-phai-lay-ve\|tam-bang-hd\|khong-dau-moi\|co-viec` | Row filter; the total row always shows the full report totals, labelled "Tổng cộng (cả bảng)" |

**DataGrid change.** The change is additive:

- `useGridView(rows, columns, initialFilters?)` becomes `useState(initialFilters ?? {})` (`components/data-grid/use-grid-view.ts:25`).
- `DataGrid` gains an optional `initialFilters` prop (`components/data-grid/data-grid.tsx:36-44,79`).
- `useGridView` has one caller (`data-grid.tsx:79`).
- `DataGrid` has about 30 consumers. None pass the prop, so their behaviour is unchanged.
- "Xóa lọc" still resets to `{}` (`data-grid.tsx:243-246`).

The book columns get `filterable: true` (`components/data-grid/types.ts:38`). NCC filters use `filterOptions` restricted to suppliers present in the rows.

**"(chưa gắn)" sentinel.** The select filter treats `""` as "Tất cả" (`components/data-grid/filter-widgets.tsx:154`), so a "(chưa gắn)" option with id `""` cannot be selected. Thực tế nhập therefore switches to the `NONE = 0` sentinel that the Đầu mối grid already uses (`dau-moi-suppliers.tsx:52,64`): `toGrid` maps null to 0 and `cellPatch` maps 0 to null.

**`mo` updates.** DT-HĐ `mo` is updated with `window.history.replaceState`, so expanding a row costs no server round trip. `[UNVERIFIED: confirm Next 16 syncs useSearchParams with native history]`. The fallback is local state plus `router.replace(…, { scroll: false })` only when a filter changes.

**Load-bearing assumption.** Filters in local state, seeded once from the URL, are enough; the brainstorm does not ask for the grid to write its filters back to the URL.

**Fails first when** a book grid remounts after a row is added (it is keyed by row ids, `hoa-don-client.tsx:219`). The filters then reset to the URL's initial filters. That is acceptable, and "Đã lọc x/y" (`data-grid.tsx:299-306`) makes the state visible.

### 7. Searchable pickers: a `SearchableSelect` on `@base-ui/react` Combobox, quick-create untouched

**Choice.** The new `components/ui/searchable-select.tsx` (client) is built on `@base-ui/react/combobox`. Version 1.4.1 is installed and the repo already wraps other Base UI primitives (`components/ui/dialog.tsx:4`). `[UNVERIFIED: read the Combobox types before coding]`.

The props:

```ts
interface SearchableSelectProps {
  options: { id: string | number; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyOption?: string;
  required?: boolean;
  "aria-label"?: string;
}
```

Matching is accent-insensitive through the existing `normVtName` (`lib/text/norm-vt-name.ts:6`), wrapped by a pure `matchesOption` in `lib/text/option-search.ts`.

It is used in three places:

- the Hóa đơn add-form NCC (`hoa-don-client.tsx:199-205`);
- the Chi thực tế add-form NCC (`app/(app)/du-an/[id]/dt-hd-tt/chi-thuc-te/chi-thuc-te-client.tsx:166`, for the `supplierId` field only);
- the Ánh xạ Dòng DT (`app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-editor.tsx:143-149`), keeping the stale-line option and "— Chỉ gán tới Mã nhóm —".

Thực tế nhập's đầu mối select (about 42 options) stays native, because the acceptance criteria name only NCC and Dòng DT.

**Coexistence with quick-create.** Nothing merges. The DT-HĐ-TT books deliberately pick existing suppliers only (prior plan, decision "The Hóa đơn grid picks existing suppliers only. Supplier creation stays admin"; `hoa-don-client.tsx:6`), and no picker in this scope uses quick-create today. The quick-create native selects (`components/master-data/quick-create/quick-create-provider.tsx:17-18`) are not touched. If a book later needs it, the extension is an optional footer action calling `useQuickCreate().request("supplier")` when `enabled` is true. That is not built now.

**Fallback.** If the Combobox API does not fit, build the same props on the existing `Input` plus a `role="listbox"` popup with `aria-activedescendant`. No new dependency is added either way.

**Load-bearing assumption.** Base UI Combobox handles 362 options without virtualisation.

**Fails first when** opening the Dòng DT list lags on low-end PCs. The mitigation is to render at most 100 matches plus "gõ thêm để lọc".

### 8. Phase order and shippable increments

The baseline and the snapshots are Phase 0, before any app change. Then:

| Phase | Scope | Effort |
|---|---|---|
| 1 | Shell | 1 d |
| 2 | Filter plumbing for every fix screen | 1.5 d |
| 3 | Tổng quan and Dashboard | 2.5 d |
| 4 | DT-HĐ screen | 2.5 d |
| 5 | HĐ-TT and DT-TT screens | 2.5 d |
| 6 | Entry speed | 2 d |
| 7 | Final verification and docs | 0.5 d |

With Phase 0 (0.5 d) the total is 13 d.

This is about one day over the brainstorm's 11–12 d. The extra is the explicit baseline tooling and the URL-filter plumbing.

**Why Phase 2 comes before Tổng quan.** The to-do links must land on filtered screens (acceptance criterion 3). Phase 3 links to DT-HĐ and HĐ-TT filters whose parsers ship in Phase 2 but whose screens ship in Phases 4 and 5. Until then those two links open the unfiltered page; unknown parameters are ignored, so nothing breaks.

**Load-bearing assumption.** One implementer works sequentially. Phases 1 and 2 have disjoint files and may run in parallel.

**Fails first when** Phases 4, 5 and 6 are parallelised. They share `scripts/verify-dt-hd-tt-ui.ts`, so in that case its additions are merged by the Phase 7 owner.

## Phases

The common commands below are referred to as "the gate".

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run risk:verify
git diff --exit-code -- test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap
git diff --exit-code origin/main -- lib/du-an/__tests__/project-service-acl-contract.test.ts
```

Print baseline comparison runs against a production build of the branch, on the local copy database that `localhost:3001` uses.

```bash
npm run build
PORT=3002 npm start
# in another shell:
ERP_BASE_URL=http://localhost:3002 ERP_EMAIL=… ERP_PASSWORD=… DT_HD_TT_PROJECT_ID=4 NON_BOOK_PROJECT_ID=<id> \
  npx tsx --env-file=.env scripts/verify-dt-hd-tt-print-baseline.ts compare
```

Implementation branch: `feat/du-an-dt-hd-tt-ui-redesign`, cut fresh from `origin/main`. There is one PR per phase, merged in order.

### Phase 0: baseline and snapshots (0.5 d)

**Goal.** Freeze today's print output, Excel output and view markup before any app file changes.

**Create:**

- `test/unit/dt-hd-tt-print-views.test.ts`. It uses `renderToStaticMarkup(createElement(DtHdView | DtTtView | HdTtView, …))` on `buildReports(fixture())`, following the pattern of `test/unit/sort-header.test.ts:1-14`, and snapshots all three. It also snapshots `buildSheet(report, data, "CT01 — Mầm Non", "17/11/2026")` (AOA, bold, widths) for the three reports.
- `test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap` (generated once, then never updated).
- `scripts/dt-hd-tt-browser-session.ts`. It signs in through the better-auth API, as in `scripts/smoke-ui.ts:33-41`, and opens a page.
- `scripts/verify-dt-hd-tt-print-baseline.ts`, with modes `capture` and `compare`. Its output goes to `scripts/.smoke-shots/dt-hd-tt-baseline/`, which `.gitignore:70` already ignores, so no real data reaches git. The name does not start with `check-` (`.gitignore:66`).

**Steps.**

1. Read the Next 16 docs in `node_modules/next/dist/docs/` on `useSelectedLayoutSegment`, `useSearchParams` and native history, the page `searchParams` prop, `revalidatePath`, and React `cache`. Read the `@base-ui/react` Combobox types. Record any deviation in the phase PR.
2. Write the snapshot test against the untouched views and commit the snapshot. From now on the test is never run with `-u`.
3. Write the browser script. For each report on project 4:
   - Add an init script that replaces `window.print` with a no-op.
   - Open `/du-an/4/dt-hd-tt/{dt-hd|dt-tt|hd-tt}` at 1440×900.
   - Click the real "In" button, which sets the body classes and the `@page` A4 landscape style (`export-buttons.tsx:93-101`).
   - Call `emulateMedia({ media: "print" })`.
   - Save `document.body.innerText`, `page.pdf({ preferCSSPageSize: true })` with its page count, and a full-page print-media screenshot.
   - Fetch `/api/du-an/4/dt-hd-tt/export?report=…`.
4. The script also does the following:
   - Records each report page's document length, for the size gate.
   - Saves the Dashboard's `main` text for project 4 and for one non-book project.
   - Saves a read-only data fingerprint through `../lib/prisma`, as in `scripts/verify-contract-detail-tie-out.ts:14`. The fingerprint is count, Σ and max `updatedAt` of invoice lines, receipts, payments, aliases, counterparties and counterparty suppliers for project 4.
5. `compare` mode:
   - Fails on a different fingerprint, with the message "dữ liệu đã đổi". A data change is never reported as code drift.
   - Fails on a print-text or page-count difference.
   - Fails on any Excel cell value, number format, column width or merge difference, ignoring AOA row 1, the "xuất ngày" row (`lib/du-an/dt-hd-tt/export-sheets.ts:39`).
   - Reports screenshot byte differences as "cần xem lại" (non-fatal).
6. Build the untouched branch, start it on port 3002, and run `capture`.

**Tests.**

- `npx vitest run --project unit test/unit/dt-hd-tt-print-views.test.ts`, then the gate.
- `npx tsx --env-file=.env scripts/verify-dt-hd-tt-print-baseline.ts compare` against the same untouched build must pass, which proves the comparison is deterministic.

**Dependencies:** none.

**Risks.**

| Risk | Likelihood × impact | Mitigation |
|---|---|---|
| Interactive testing on project 4 changes data between capture and compare | M × H | The fingerprint fails fast. Test in-place edits on another project, or restore the values. |
| PDF bytes are non-deterministic | M × L | Only text and page count are fatal. |

**Rollback.** Delete the two scripts and the test. No app code is involved.

### Phase 1: shell with seven groups, and the grouped DT-HĐ-TT sub-nav (1 d)

**Goal.** Meet acceptance criterion 1 with no URL change and no print change.

**Create:**

- `lib/du-an/project-tab-groups.ts`: `PROJECT_TAB_GROUPS` and `groupOfSegment(segment: string | null)`.
- `components/du-an/project-tab-bar.tsx` (client): `ProjectTabBar({ basePath, hasBook })`.
- `lib/du-an/dt-hd-tt/book-presence.ts`: `projectHasDtHdTtBook(projectId): Promise<boolean>`, not "use server".
- `test/unit/project-tab-bar.test.ts`.
- `test/unit/dt-hd-tt-sub-nav.test.ts`.
- `scripts/verify-dt-hd-tt-ui.ts`.

**Modify:**

- `app/(app)/du-an/[id]/layout.tsx`: replace `TABS` and the bar at lines 10-25 and 81-94 with `<div className="border-b"><ProjectTabBar …/></div>`; add the `hasBook` call.
- `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx`: add a `group` field to `DT_HD_TT_SECTIONS`, render the labelled groups, and add a "Tổng quan" entry with `segment: null, ready: false`, which Phase 3 flips.

**Steps.**

1. Write the group table. Map `null` to the "Tổng quan" group. Map each of the 13 named segments to its group.
2. Render row 1 always. Render row 2 only for multi-tab groups other than DT-HĐ-TT. Remove `overflow-x-auto` and `min-w-max`. Keep `flex-wrap`.
3. Keep the header block of the layout byte-identical.

**Tests.**

- `project-tab-bar.test.ts` (unit, with `vi.mock("next/navigation")` returning a segment):
  - for `null`, `"tien-do"`, `"du-toan-dieu-chinh"`, `"dt-hd-tt"`, `"cong-no"`, `"hop-dong"` and `"cai-dat"`, exactly one group link has `aria-current`, and the right tab has `aria-current="page"`;
  - all 14 original hrefs are present across the groups.
- `dt-hd-tt-sub-nav.test.ts`: `invoiceBookHref(4) === "/du-an/4/dt-hd-tt/hoa-don"`, the group labels render, and `aria-current` sits on the active segment.
- `scripts/verify-dt-hd-tt-ui.ts` shell check: at 1366×768 and 1440×900, on `/du-an/4`, `/du-an/4/can-doi-vat-tu` and `/du-an/4/dt-hd-tt/hd-tt`, `nav[aria-label="Dự án"]` has `scrollWidth <= clientWidth` and the expected `aria-current` elements.
- The gate, plus the baseline `compare`.

**Dependencies:** Phase 0.

**Risks.**

| Risk | Likelihood × impact | Mitigation |
|---|---|---|
| Index segment wrongly treated as no active group | L × M | Unit test. |
| Printed border line disappears | L × L | Keep the wrapper `div.border-b`; compare covers it. |
| One extra `findFirst` per project page | L × L | Indexed. |

**Rollback.** `git revert`. Nothing persists.

### Phase 2: URL contract and filters on every fix screen (1.5 d)

**Goal.** Every screen that a to-do or a report number points at accepts its filter from the URL. This covers the filter part of acceptance criterion 6 and the target side of acceptance criterion 3.

**Create:**

- `lib/du-an/dt-hd-tt/screen-links.ts`. It exports:
  - `anhXaHref` and `parseAnhXaQuery`;
  - `bookHref` and `bookInitialFilters(book, sp): Record<string, FilterValue>`;
  - `dauMoiHref` and `parseDauMoiQuery`;
  - `dtHdHref` and `parseDtHdQuery`;
  - `hdTtHref` and `parseHdTtQuery`.
- `lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts`.
- `test/unit/data-grid-initial-filters.test.ts`.

**Modify:**

- `components/data-grid/use-grid-view.ts` and `components/data-grid/data-grid.tsx`: optional `initialFilters`.
- Hóa đơn: `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/page.tsx` and `hoa-don-client.tsx`:
  - the page reads `searchParams`;
  - the `supplierId`, `invoiceNo` and `mapping` columns become `filterable`;
  - the dynamic cast type at lines 23-28 gains `initialFilters`;
  - the Ánh xạ link at line 186 becomes `anhXaHref(id, { tab: "hd", status: "chua_gan" })`.
- Thực tế nhập: `…/thuc-te-nhap/page.tsx` and `thuc-te-nhap-client.tsx`:
  - the `NONE = 0` sentinel at lines 45, 56 and 85;
  - `counterpartyId` and `mapping` become filterable;
  - the link at line 166 becomes `anhXaHref(id, { tab: "tt", status: "chua_gan" })`.
- Chi thực tế: `…/chi-thuc-te/page.tsx` and `chi-thuc-te-client.tsx`: `supplierId` and `counterpartyId` become filterable.
- Ánh xạ: `…/anh-xa/page.tsx` and `anh-xa-client.tsx`:
  - the page reads `status` and `q`;
  - the client gets `initialStatus` and `initialQuery`;
  - a `thieu_he_so` filter is added, hidden on the dt tab like `ngoai_dt` (line 109).
- Đầu mối: `…/dau-moi/page.tsx`, `dau-moi-client.tsx` and `dau-moi-suppliers.tsx`:
  - `loc` is parsed;
  - the counterparty grid gets the read-only boolean `unsettled` column "Chưa chốt" (filterable);
  - the supplier grid's `counterpartyId` becomes filterable;
  - the supplier section gets `id="ncc"`.

**Steps.**

1. Write `screen-links.ts` with strict parsers. Positive integers are accepted, plus `0` for `dauMoi`. Enums are allowed values only. `q` is trimmed to 100 characters.
2. Thread `initialFilters` from each page through its client to the `DataGrid`.

**Tests.**

- `screen-links.test.ts`:
  - every builder round-trips through its parser;
  - garbage values parse to defaults;
  - `bookInitialFilters("hoa-don", { ncc: "12", soHd: "0045", chuaGan: "1" })` equals `{ supplierId: {equals "12"}, invoiceNo: {text "0045"}, mapping: {equals "chưa gán"} }`.
- `data-grid-initial-filters.test.ts`:
  - `applyFilter` (`components/data-grid/apply-filter-sort.ts:94-110`) on these filters keeps exactly the expected rows;
  - a static render of a tiny component calling `useGridView(rows, cols, init)` shows the filtered count;
  - with no third argument the count is unfiltered.
- The gate, plus the baseline `compare`.

**Dependencies:** Phase 0. Phase 2 can run in parallel with Phase 1; the files are disjoint.

**Risks.**

| Risk | Likelihood × impact | Mitigation |
|---|---|---|
| Shared DataGrid change affects about 30 grids | L × H | Optional prop with an unchanged default; `tsc` and the unit tests. |
| The `NONE` change breaks Thực tế nhập edits | M × M | `cellPatch` maps 0 to null; a unit case in `screen-links.test.ts` covers the sentinel helper. Manual edit on a non-baseline project. |

**Rollback.** `git revert`. No data changes.

### Phase 3: Tổng quan, sub-nav badge, Dashboard (2.5 d)

**Goal.** Meet acceptance criteria 2, 3 and 9.

**Create:**

- `lib/du-an/dt-hd-tt/overview.ts`. It exports `buildOverview`, `resolveCell`, `phanIIITotal(reports): { estimate; actual; diff }` and the types `OverviewFigure` and `OverviewTodo`.
- `lib/du-an/dt-hd-tt/__tests__/overview.test.ts`.
- `lib/du-an/dt-hd-tt/cached-reads.ts`: `readAliasBoard = cache(listAliasBoard)`.
- `components/du-an/dt-hd-tt/overview-view.tsx` (server component).

**Modify:**

- `app/(app)/du-an/[id]/dt-hd-tt/page.tsx`: the redirect at line 5 is replaced by the Tổng quan page.
- `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx`: the badge count.
- `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx`: "Tổng quan" becomes ready; the Ánh xạ badge prop is added.
- `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/page.tsx`: use `readAliasBoard`.
- `lib/du-an/dt-hd-tt/entry-write-guards.ts`:
  - add `/du-an/{id}/dt-hd-tt` (Tổng quan) and `/du-an/{id}` (Dashboard) to `revalidateEntryBook` (lines 54-58) and `revalidateMappingChange` (lines 64-68).
- `lib/du-an/dashboard-service.ts`: `book: { estimate; actual; diff } | null`.
- `app/(app)/du-an/[id]/page.tsx`: the Thực tế card at lines 80-85 branches on `dash.book`.
- `lib/du-an/__tests__/dashboard-service.test.ts`: add mocks for `projectInvoiceLine` and for `report-service`, and new cases.
- `scripts/verify-dt-hd-tt-ui.ts`: Tổng quan and Dashboard checks.

**Steps.**

1. Build `overview.ts` as described in design choice 2.
2. Render `overview-view.tsx` in four blocks: Số chính, Đầu mối cần chú ý, Việc cần làm, Kiểm tổng. Then add the report shortcuts. Use `StatusBadge` tones (`components/ui/status-badge.tsx:61`) and lucide icons.
3. In the Dashboard:
   - add `projectHasDtHdTtBook` to the `Promise.all`;
   - when it is true, call `getDtHdTtReports` (which re-checks the read guard) and `phanIIITotal`.
4. Flip the sub-nav entry. The badge is the count of `alias === null` keys across all three tabs of `readAliasBoard`.

**Tests.**

- `overview.test.ts`:
  - every figure equals `resolveCell` on its ref, and every ref resolves;
  - the Phần III Chênh string appears in the Gxd row of `DtTtView`'s markup;
  - the attention list is sorted by `diff` ascending and capped at 10;
  - zero to-dos are hidden;
  - every to-do `href` parses (through `screen-links`) to the intended filter.
- `dashboard-service.test.ts`:
  - a book project returns `book` equal to `phanIIITotal(buildReports(fixture()))`;
  - a project without the book has `book === null` and `getDtHdTtReports` is not called;
  - the existing two cases still pass with the added mock.
- UI script:
  - `/du-an/4/dt-hd-tt` shows Tổng quan;
  - each visible to-do link opens a screen whose filter indicator matches ("Đã lọc", the Ánh xạ select value, or the Đầu mối grid filter);
  - the Dashboard Thực tế text equals the Tổng quan Thực tế text;
  - the non-book Dashboard text equals the Phase 0 capture.
- The gate, plus the baseline `compare`.

**Dependencies:** Phases 1 and 2.

**Risks.**

| Risk | Likelihood × impact | Mitigation |
|---|---|---|
| VAT-basis confusion on headline figures | L × H | Each figure shows its basis; there are no new totals. |
| Non-book Dashboard regresses | L × H | Detector plus test, plus a script comparison against the capture. |
| Extra board read (5 queries) on report and book pages for the badge | M × L | `cache` dedupes on Tổng quan and Ánh xạ. If time to first byte on DT-HĐ grows by more than 150 ms in the script's navigation timing, replace the badge source with a count-only helper. |
| Tổng quan is stale after an edit | M × M | Revalidation list update. |

**Rollback.** `git revert` restores the redirect and the old Dashboard card. Nothing persists.

### Phase 4: DT-HĐ screen layout (2.5 d)

**Goal.** Meet acceptance criterion 4, with Phần B split into "Chưa gán" and "Ngoài DT".

**Create:**

- `lib/du-an/dt-hd-tt/dt-hd-screen-model.ts` (pure):
  - `blockStatusCounts(block)`;
  - `filterBlocks(report, { loc, dauMoi })`, which returns the visible blocks, groups and lines;
  - `splitPartB(report)`;
  - `DT_HD_STATUS_TONE`.
- `lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts`.
- `lib/du-an/dt-hd-tt/__tests__/dt-hd-invoice-reason.test.ts`.
- `components/du-an/dt-hd-tt/dt-hd-screen.tsx` (client): filter bar, summary table, URL state.
- `components/du-an/dt-hd-tt/dt-hd-screen-block.tsx`: groups and lines.
- `components/du-an/dt-hd-tt/dt-hd-screen-part-b.tsx`.
- `test/unit/dt-hd-screen.test.ts`.

**Modify:**

- `lib/du-an/dt-hd-tt/dt-hd-report.ts`: add `reason?: "chua_gan" | "ngoai_dt"` to `DtHdInvoiceRow` (lines 20-30), set from `place.reason` when `place.kind === "outside"` in the row construction at lines 106-111.
- `app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx`: `searchParams`, the screen, and the print wrapper as described in design choice 1.
- `scripts/verify-dt-hd-tt-ui.ts`.

**Steps.**

1. Add the engine field. Neither the print view nor the Excel sheet reads it: `invoiceCells` copies only the listed fields (`lib/du-an/dt-hd-tt/export-sheet-dt-hd.ts:13-22`).
2. Build the summary table, one row per block. The columns are all block fields, so there is no new figure:
   - Đầu mối;
   - Dự toán (`valueDt`);
   - HĐ do NCC xuất (`invoiceTotal`);
   - Trong nhóm mình (`inOwnGroups`);
   - Ngoài DT (`outsideDt`);
   - Ở nhóm khối khác (`crossAssigned`);
   - Thực tế chưa VAT (`actualExVat`, or "chưa chốt" linking to `dau-moi?loc=chua-chot`);
   - Còn phải lấy HĐ (`remainingVsActual`);
   - Tình trạng (non-zero status badges);
   - a ✗ badge only when `tieOut.ok` is false.
3. Make the table header sticky (`thead th.sticky top-0`) against `main`, which is the scroll box (`app/(app)/layout.tsx:53`), with no `overflow-x-auto` wrapper.
4. Expanding a block shows its group rows. Expanding a group shows its DT lines and its "Chỉ gán tới nhóm" rows. The "↳" invoice rows appear only behind a "Hiện dòng hóa đơn" switch, off by default. A "thiếu hệ số" invoice row links to `anhXaHref(id, { tab: "hd", q: itemName })`.
5. Phần B is shown as two collapsed lists of lines, using the existing per-line amounts and counts:
   - "Chưa gán", with a "Gán" link to `anh-xa?tab=hd&status=chua_gan&q=…`;
   - "Ngoài DT".

   The existing `partBTotal` appears once, and no per-list subtotal is invented. The grand check line goes at the bottom.
6. URL state: `loc` and `dauMoi` seed the filters, and `mo` seeds the expanded set. Expanding and collapsing writes `mo` with `history.replaceState`.
7. Size gate: the document length of `/du-an/4/dt-hd-tt/dt-hd` must be at most 2.2× the Phase 0 capture. If it is not, apply the trimmed projection from design choice 1 before merging.

**Tests.**

- `dt-hd-invoice-reason.test.ts`:
  - Phần B rows carry `reason` matching the fixture's alias status;
  - in-line rows carry no `reason`;
  - `blocks`, `partBTotal` and `grandCheck` equal the values the existing golden test asserts, through the same fixture.
  - The golden test `lib/du-an/dt-hd-tt/__tests__/dt-hd-report.test.ts` is not edited.
- `dt-hd-screen-model.test.ts`:
  - each `loc` keeps exactly the matching lines and blocks;
  - `dauMoi=none` selects "Chưa có đầu mối";
  - the Phần B split is exact, and it partitions `partB` lines with nothing lost.
- `dt-hd-screen.test.ts`: a static render with mocked `next/navigation` shows one summary row per fixture block, `aria-expanded="false"`, and no line rows.
- UI script at 1440×900:
  - the summary row count equals the number of blocks (30 on project 4);
  - `main.scrollHeight <= 2200`;
  - `?mo=<id>` survives a reload;
  - `?loc=vuot` shows only blocks with "Vượt".
- The gate. The snapshot must be unchanged, which proves `DtHdView` and the Excel AOA did not move. Then the baseline `compare`.

**Dependencies:** Phase 2, for `screen-links`. It is independent of Phase 3.

**Risks.**

| Risk | Likelihood × impact | Mitigation |
|---|---|---|
| Size over the gate | M × M | Projection fallback. |
| Page wrapper order changes print spacing | L × H | Print wrapper last; `compare` checks text and pages. |
| `replaceState` not synced in Next 16 | M × L | Docs check; `router.replace` fallback. |

**Rollback.** `git revert`. The engine field is optional and not stored.

### Phase 5: HĐ-TT and DT-TT screen layouts (2.5 d)

**Goal.** Meet acceptance criterion 5, the DT-TT jump bar, collapsible Phần I and warning links.

**Create:**

- `lib/du-an/dt-hd-tt/hd-tt-screen-model.ts`. It exports:
  - `HD_TT_SCREEN_LABELS`, keyed by `HD_TT_MONEY_COLS` keys (`lib/du-an/dt-hd-tt/export-sheet-hd-tt.ts:8-22`), with plain names, letter codes and formula tooltips taken from `hd-tt-report.ts:2-10`;
  - `HD_TT_GROUPS`: Hóa đơn | Thanh toán | Thực tế | Lấy về;
  - `hdTtRowMatches(row, loc)`;
  - `hdTtCellPatch(col, text)`.
- `lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-model.test.ts`.
- `components/du-an/dt-hd-tt/hd-tt-screen.tsx` (client).
- `components/du-an/dt-hd-tt/hd-tt-editable-cell.tsx` (client).
- `components/du-an/dt-hd-tt/dt-tt-screen.tsx` (client).
- `test/unit/hd-tt-screen.test.ts`.

**Modify:**

- `app/(app)/du-an/[id]/dt-hd-tt/hd-tt/page.tsx`:
  - `requireModuleAccess` plus `canAccessEntitlement(… "edit" …)`, as in `dau-moi/page.tsx:18-29`;
  - `listCounterparties` for the link ids;
  - `searchParams`;
  - the print wrapper.
- `app/(app)/du-an/[id]/dt-hd-tt/dt-tt/page.tsx`: the screen and the print wrapper.
- `scripts/verify-dt-hd-tt-ui.ts`.

**Steps.**

1. The HĐ-TT screen is a table inside a bounded scroll container (`max-h-[calc(100vh-14rem)] overflow-auto`, the pattern of `anh-xa-client.tsx:120-122`). It has:
   - a two-row sticky header;
   - a sticky first NCC column (`line-clamp-2`, `title` = full name), reusing the `.nq-main` sticky cell styles (`app/globals.css:261-270`);
   - đầu mối group header rows instead of a Đầu mối column, in the order the engine already gives (`hd-tt-report.ts:69-80`);
   - a sticky `bottom-0` total row from `report.totals`;
   - markers shown as badges next to the number;
   - E linking to `bookHref(id, "hoa-don", { ncc })` and G linking to `bookHref(id, "chi-thuc-te", { ncc })`;
   - the checks and the Σ T explanation below the table, copied from the frozen view's logic, `hd-tt-view.tsx:73-90`, but in screen markup.
2. Editable cells follow design choice 5.
3. The DT-TT screen has:
   - a sticky jump bar "Phần I · Phần II · Phần III" (`#phan-i` and so on);
   - Phần I groups collapsed by default, with "Mở tất cả";
   - "chưa chốt" linking to `dau-moi?loc=chua-chot`;
   - "thiếu hệ số" linking to `anh-xa?tab=tt&status=thieu_he_so&q=…`;
   - the untagged-receipts line linking to `thuc-te-nhap?dauMoi=0`;
   - the "chưa xác định loại" line linking to `du-toan`.

**Tests.**

- `hd-tt-screen-model.test.ts`:
  - the label map covers exactly the `HD_TT_MONEY_COLS` keys;
  - `HD_TT_MONEY_COLS` and `HD_TT_HEADER` are untouched (deep-equal against literals);
  - each `loc` predicate is checked on fixture rows;
  - `hdTtCellPatch("paidOverrideVnd", "1.500.000")` gives `{ paidOverrideVnd: 1500000 }`, `""` gives null, and `"abc"` throws.
- `hd-tt-screen.test.ts` (static render, `next/navigation` mocked):
  - `canEdit=false` renders no edit buttons;
  - `canEdit=true` renders four per linked row, and S is disabled on a row with `counterpartyId === null`.
- UI script at 1440×900 on project 4:
  - every NCC cell is at most 2 line heights tall;
  - after scrolling the container down and right, the header, NCC column and total row keep their bounding positions.
- Manual: as an edit user on a non-baseline project, change H and see I update after refresh; as a read user, no buttons appear.
- The gate. The snapshot must be unchanged. Then the baseline `compare`.

**Dependencies:** Phase 2.

**Risks.**

| Risk | Likelihood × impact | Mitigation |
|---|---|---|
| Concurrent edits | L × M | Server merge under the lock. |
| An unexplained ✗ on Σ T | M × M | S disabled without a đầu mối. |
| Nested sticky in a bounded container feels odd | M × L | Container height tied to the viewport. |

**Rollback.** `git revert`. H / S / X / Z values typed in Phase 5 were written by the existing action, which the Đầu mối grid also uses, so they stay valid after a revert.

### Phase 6: entry speed (2 d)

**Goal.** Meet the picker and Ánh xạ part of acceptance criterion 6, plus the compact forms and source lines from the accepted brainstorm.

**Create:**

- `components/ui/searchable-select.tsx`.
- `lib/text/option-search.ts`.
- `test/unit/option-search.test.ts`.
- `lib/du-an/dt-hd-tt/__tests__/alias-board-sources.test.ts`.
- `lib/du-an/dt-hd-tt/__tests__/register-ui-next-key.test.ts`.

**Modify:**

- `hoa-don-client.tsx` and `chi-thuc-te-client.tsx`: NCC picker, plus a compact form that can be collapsed ("Ẩn form thêm dòng"; grid height 560 when open, 720 when collapsed).
- `thuc-te-nhap-client.tsx`: compact, collapsible form only.
- `lib/du-an/dt-hd-tt/alias-board.ts`:
  - add optional `invoiceNo`, `date`, `qty` and `unitPrice` to `BoardSourceLine` (lines 75-81);
  - add `sources?: SourceLineView[]`, capped at 20 per key, to `AliasKeyRow` (lines 24-38).
- `lib/du-an/dt-hd-tt/alias-service.ts`: `listAliasBoard` selects those columns (lines 140-145). The guard is unchanged.
- `lib/du-an/dt-hd-tt/register-ui.ts`: `nextOpenKey(keys, current, canOpen)`.
- `anh-xa-editor.tsx`: Dòng DT picker, a compact source-lines table, and a "Lưu và sang dòng kế" button (status `xac_nhan`; Enter in the hệ số or ghi chú field triggers it).
- `anh-xa-client.tsx`: computes the next key from the pre-save visible list and opens it after the refresh.

**Steps.** Follow design choice 7. "Lưu và sang dòng kế" skips rows the user cannot open: create is needed for a new alias, edit for an existing one (`anh-xa-client.tsx:140`).

**Tests.**

- `option-search.test.ts`: "thep" matches "Thép", "dong yen" matches "Đông Yên", and the empty query matches all.
- `alias-board-sources.test.ts`: sources attach to the right key, are capped at 20, and DT rows have none.
- `register-ui-next-key.test.ts`: returns the next openable key, skips rows that cannot be opened, and returns null at the end.
- Manual: keyboard selection in the picker, and "Lưu và sang dòng kế" with `status=chua_gan` on a non-baseline project.
- The gate, plus the baseline `compare`.

**Dependencies:** Phase 2.

**Risks.**

| Risk | Likelihood × impact | Mitigation |
|---|---|---|
| Combobox API mismatch | M × M | Read the types in Phase 0; fallback in design choice 7. |
| Board payload growth | L × L | About 540 lines; cap of 20 per key. |

**Rollback.** `git revert`. No data changes.

### Phase 7: final verification and docs (0.5 d)

**Goal.** Prove acceptance criteria 7 and 8 end to end, and update the docs.

**Modify:**

- `docs/user-guide/doi-chieu-dt-hd-tt.md`: Tổng quan in §1, filters and pickers in §2–3, H / S / X / Z on HĐ-TT in §4, "In luôn in đủ báo cáo" in §5.
- `docs/project-changelog.md`. Watch for a merge conflict if PR #24 also edits it.

**Steps.**

1. Run the gate on the final branch.
2. Run `scripts/verify-dt-hd-tt-print-baseline.ts compare` and `scripts/verify-dt-hd-tt-ui.ts`.
3. Save their pass/fail output, which contains no figures, to `plans/261120-0935-du-an-xay-dung-ui-ux-redesign/reports/`.

**Dependencies:** all phases.

**Rollback.** Not applicable.

## Dependency graph and file ownership

```
P0 ─┬─ P1 ─┐
    └─ P2 ─┼─ P3 ─┐
           ├─ P4 ─┤
           ├─ P5 ─┼─ P7
           └─ P6 ─┘
```

Recommended order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. P1 and P2 are disjoint. P4, P5 and P6 are disjoint except for `scripts/verify-dt-hd-tt-ui.ts`, which P1 owns and P3, P4 and P5 append to.

Files touched by more than one phase run strictly in sequence:

| File | Phases |
|---|---|
| `dt-hd-tt-sub-nav.tsx` | P1, P3 |
| `anh-xa/page.tsx` | P2, P3 |
| `anh-xa-client.tsx` and book clients | P2, P6 |

## Test matrix

| Level | What | Where |
|---|---|---|
| Unit, pure | URL contract, overview cell refs, DT-HĐ filters and Phần B split, HĐ-TT labels / predicates / patch, option search, next key, alias board sources, tab groups, invoice reason | `lib/du-an/dt-hd-tt/__tests__/*`, `test/unit/*` |
| Unit, static markup | Print views and Excel AOA frozen; tab bar and sub-nav `aria-current`; DT-HĐ collapsed render; HĐ-TT edit gating | `test/unit/dt-hd-tt-print-views.test.ts` and siblings |
| Unit, mocked service | Dashboard with and without book | `lib/du-an/__tests__/dashboard-service.test.ts` |
| Contract (unchanged) | ACL contract test, risk manifest, export golden tests, engine golden tests | existing files, no edits |
| End to end on the local copy | Print text and page count, Excel cells, Dashboard text, layout widths, sticky positions, to-do links | `scripts/verify-dt-hd-tt-print-baseline.ts`, `scripts/verify-dt-hd-tt-ui.ts` |

No new integration tests are needed. The only new database read is the indexed `findFirst` in `book-presence.ts`, covered by the mocked Dashboard test and the scripts.

## Backwards compatibility

- **URLs.** No URL changes. Every new parameter is optional and invalid values are ignored. `/du-an/{id}/dt-hd-tt` now opens Tổng quan instead of redirecting; that is acceptance criterion 2.
- **Exports.** `invoiceBookHref` and the `DT_HD_TT_SECTIONS` segment strings are kept.
- **DataGrid.** The new prop is optional, and grids that do not pass it are unchanged.
- **`DtHdInvoiceRow`.** The field is optional, and neither print nor Excel reads it.
- **Contracts and data.** No server action, route, ACL level or schema changes. Old tabs (decision 4) are untouched.

## Acceptance criteria → phase and proof

| # | Phase | Proof |
|---|---|---|
| 1 | P1 | `test/unit/project-tab-bar.test.ts` (`aria-current` per segment). `scripts/verify-dt-hd-tt-ui.ts`: no horizontal scroll at 1366 and 1440. |
| 2 | P3 | `lib/du-an/dt-hd-tt/__tests__/overview.test.ts`: every figure equals `resolveCell` of its ref, and Chênh equals the rendered Gxd cell. UI script: `/du-an/4/dt-hd-tt` shows Tổng quan. |
| 3 | P2 targets, P3 links (P4 and P5 complete the DT-HĐ and HĐ-TT targets) | `screen-links.test.ts` round trips; `overview.test.ts` (every to-do href parses to its filter); `data-grid-initial-filters.test.ts`; UI script follows each to-do on project 4 and checks the filtered state. |
| 4 | P4 | `dt-hd-screen-model.test.ts`, `dt-hd-screen.test.ts`. UI script: 30 summary rows, `scrollHeight <= 2200` at 1440×900, `mo` survives reload, `loc` filters. |
| 5 | P5 | `hd-tt-screen-model.test.ts`, `hd-tt-screen.test.ts` (edit versus read). UI script: NCC at most 2 lines, sticky header, column and total. Manual edit round trip. |
| 6 | P2 (filters, URL), P6 (pickers, next row) | `data-grid-initial-filters.test.ts`, `screen-links.test.ts`, `option-search.test.ts`, `register-ui-next-key.test.ts`, `alias-board-sources.test.ts`. UI script: `hoa-don?ncc=…` shows "Đã lọc". |
| 7 | P0 capture, every phase compare, P7 final | `test/unit/dt-hd-tt-print-views.test.ts` with an unchanged snapshot (`git diff --exit-code`). `verify-dt-hd-tt-print-baseline.ts compare` exits 0 on print text, page count and Excel cells. |
| 8 | Every phase | The gate. The ACL contract test is byte-identical to `origin/main`. |
| 9 | P3 | `dashboard-service.test.ts` (book uses `phanIIITotal`; no book means `getDtHdTtReports` is not called). UI script: project 4 Dashboard Thực tế equals Tổng quan; the non-book Dashboard equals the Phase 0 capture. |

## Unresolved questions

1. **Book filters versus columns.** Acceptance criterion 6 asks every book to filter by NCC, số HĐ and chưa gán, but Thực tế nhập has no NCC or số HĐ column (`lib/du-an/dt-hd-tt/receipt-service.ts:23-37`), and Chi thực tế has no số HĐ or mapping column (`payment-service.ts:22-35`). By default each book filters on the columns it has, and đầu mối stands in for NCC on Thực tế nhập. Is that acceptable?
2. **What "Lưu và sang dòng kế" saves.** It saves with status "Xác nhận". Should it instead keep the status of whichever button the user would otherwise press, for example "Lưu đề xuất"?
3. **"Dự toán gốc" on book projects.** The plan changes only the Thực tế card and compares it against Phần III Gxd. Should "Dự toán gốc" also switch to Gxd (brainstorm data issue 2), or stay as the sum of estimate lines?
4. **The one unfiltered to-do target.** The "dự toán chưa có loại" to-do can only open the Dự toán tab unfiltered, because the fix is a hạng mục code suffix. Is this exception to "already filtered" acceptable, or should the Dự toán tab gain a filter (outside the DT-HĐ-TT module)?
5. **S on rows without a đầu mối.** S is disabled on HĐ-TT for an NCC with no đầu mối, to avoid an unexplained Σ T ✗, while the Đầu mối grid still allows it. Confirm. Separately, should kongming's suspected engine case (`hd-tt-report.ts:90-91,130-141`) get its own confirming test as a follow-up?
6. **"In" on Tổng quan.** The Tổng quan "In" shortcut opens the report page, so printing takes one more click. Is an auto-print parameter wanted? It adds behaviour and risk, so the default is no.
7. **Cost of the Ánh xạ badge.** The badge costs one alias-board read on every DT-HĐ-TT page that is not deduplicated. Accept it, or go straight to a count-only helper?
8. **Unverified APIs.** `history.replaceState` syncing in Next 16 and the shape of the Base UI Combobox API are unverified because `node_modules` was unreadable to this planner. Phase 0 step 1 resolves both before any dependent code.

Status: DONE_WITH_CONCERNS
Summary: The candidate freezes the three report views as print-only, puts baselines and snapshots first in Phase 0, and delivers acceptance criteria 1–9 in eight revertible phases (13 d) with no new server actions or routes and one optional engine field. The concerns are that the Next 16 history-sync and Base UI Combobox APIs could not be checked because `node_modules` was unreadable, plus the eight product questions listed last.
