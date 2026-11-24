# Debate evidence packet — Dự án xây dựng UI/UX redesign (focus Đối chiếu DT-HĐ-TT)

Date 2026-11-20. Shared by all three planner candidates. Read this first; then read code only where you need detail.

## Where things are

- **Plan dir:** `C:/Users/tranv/OneDrive/Desktop/ngoquyen-erp/plans/261120-0935-du-an-xay-dung-ui-ux-redesign/`
- **Code to read (W):** `C:/Users/tranv/OneDrive/Desktop/ngoquyen-erp/.claude/worktrees/du-an-danh-muc-hop-dong-d92348`. It contains `origin/main` plus the open contracts PR #24.
  - PR #24 touches only `hop-dong/**`, `lib/du-an/contract-*`, schema and docs.
  - It does **not** touch `app/(app)/du-an/[id]/layout.tsx`, the dashboard, or `dt-hd-tt/**`.
- **Implementation branch:** cut fresh from `origin/main`. The main checkout's branch `feat/master-data-quick-create` is stale (already merged).
- **Accepted brainstorm, which is the contract:** `C:/Users/tranv/OneDrive/Desktop/ngoquyen-erp/plans/reports/brainstorm-261120-1606-du-an-xay-dung-ui-ux-redesign.md`
- **Earlier counsel:** `C:/Users/tranv/OneDrive/Desktop/ngoquyen-erp/plans/reports/kongming-261120-1606-du-an-xay-dung-ui-ux-redesign.md`. It has file:line findings; reuse them rather than re-deriving.
- **Prior feature plan:** `C:/Users/tranv/OneDrive/Desktop/ngoquyen-erp/plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/plan.md`. Its decisions 1–8 are settled business rules; do not reopen them.
- **Repo rule (AGENTS.md):** Next.js is 16.2.10 with breaking changes. Read `W/node_modules/next/dist/docs/` before relying on any Next API. In this version `params` and `searchParams` are Promises (see `anh-xa/page.tsx`).

## Accepted contract (from the brainstorm; user decisions of 20/11)

- **Approach B.** Restructure DT-HĐ-TT around a Tổng quan landing with drill-down. Give the three reports a screen layout separate from print. Regroup the project shell's 14 tabs into 7 groups without changing any URL. Do not merge or hide the old tabs.
- **First screen serves lãnh đạo / chỉ huy.** Tổng quan leads with:
  - headline figures DT / HĐ / TT;
  - the đầu mối most over budget;
  - then "việc cần làm" with one-click filtered links.
- **Dashboard dự án is in scope.** On a project that has the team book, the "Thực tế" card (today 0 đ, "−100 %" in green) must read the book. Other projects stay unchanged.
- **Kế toán edits H / S / X / Z directly on the HĐ-TT table** (edit permission). The Đầu mối page grid stays.
- **The entry books stay the long-term place the đội enters data.** So the full entry-speed work is in scope: grid filters, searchable pickers, compact form, faster Ánh xạ.
- **Pain points, all four:**
  - reports too long;
  - no idea what to do next;
  - too many overlapping tabs;
  - slow entry.

### Constraints

- Report figures unchanged. Engine `W/lib/du-an/dt-hd-tt/*-report.ts`, `reports.ts`, `book-index.ts` and their golden tests stay as they are. An additive field on a report row type is acceptable only if no figure changes.
- A4 print output and Excel export of all three reports identical to before.
- ACL read / create / edit split unchanged.
- No URL changes.
- Decision 4 (old tabs keep showing the invoice list) stands.
- No schema change.
- Desktop ≥ 1366 px.

### Non-goals

- Merging or hiding the old tabs.
- New formulas, or totals mixing VAT bases.
- Filtered print.
- Virtualised report tables.
- Turning the entry grids into wizards.

### Acceptance criteria (from brainstorm)

1. At 1366 px and 1440 px the project tab bar has no horizontal scroll. The active group and tab are highlighted and carry `aria-current`.
2. `/du-an/{id}/dt-hd-tt` opens Tổng quan. Each figure equals one existing report cell, proven by a test.
3. Every to-do item reaches its fix screen in one click, already filtered.
4. DT-HĐ on screen opens with the 30 đầu mối summary rows, about 2 screens instead of 16 466 px.
   - Expand per đầu mối, then per group.
   - Filters: Còn thiếu, Vượt, Chưa có HĐ, Thiếu hệ số, one đầu mối.
   - The open đầu mối is kept in the URL.
5. HĐ-TT at 1440 px:
   - NCC name on at most 2 lines;
   - sticky NCC column, header and total row;
   - H / S / X / Z editable in place for edit users, read-only for read users.
6. Hóa đơn, Thực tế nhập and Chi thực tế grids:
   - filter by NCC, số HĐ and chưa gán;
   - accept an initial filter from the URL;
   - searchable NCC and Dòng DT pickers;
   - Ánh xạ has "Lưu và sang dòng kế".
7. Print-to-PDF text and the Excel files of the three reports on MNTC-GD1 (project 4) equal baselines saved before the work. Static-markup snapshots of `DtHdView`, `DtTtView` and `HdTtView` are unchanged.
8. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` are green. The ACL contract test is unchanged.
9. On MNTC-GD1 the Dashboard shows thực tế from the book, equal to Tổng quan. Projects without a book keep their current numbers.

## Measured current state (local copy localhost:3001, project 4 MNTC-GD1, viewport 1440×900)

- **Data volume:** 362 estimate lines; 280 invoice lines; 258 actual receipts; 119 cash payments; 716 aliases; 91 Mã nhóm; 42 đầu mối; 28 legal NCC under đầu mối. Only project 4 has book data on the copy.
- **DT-HĐ:** 30 sections (blocks), 780 `<tr>`, `scrollHeight` 16 466 px. 30/30 tie-out lines are ✓. Each block's summary sentence is about 215 characters.
- **DT-TT:** 202 `<tr>`, height 2 162 px.
- **HĐ-TT:** 30 `<tr>`. The table's `scrollWidth` is 1 430 px inside a 1 082 px box, so it scrolls horizontally. NCC names wrap to 5 lines.
- **Hóa đơn:** the add form takes about a third of the viewport, leaving room for about 9 grid rows. The grid is lazy-loaded (`next/dynamic`, `ssr:false`).
- **Dashboard:** "Thực tế (đã nhập)" shows 0 đ with "Biến động −100.0 %" in the success tone. "Hóa đơn đã lấy" shows a non-zero total.

## Code map and facts

### Shell

- `W/app/(app)/du-an/[id]/layout.tsx` (99 lines) is a server component.
  - `TABS` has 14 entries (lines 10–25).
  - Every tab gets the same class, with no active state and no `aria-current` (lines 85–91).
  - The bar is a horizontal-scroll row (82–83).
  - The header shows the project code, name, CĐT and an admin-only `ProjectEditButton`.
- Tab hrefs:
  - `""` Dashboard
  - `/tien-do`
  - `/nghiem-thu`
  - `/du-toan`
  - `/du-toan-dieu-chinh`
  - `/phat-sinh`
  - `/dinh-muc`
  - `/giao-dich`
  - `/can-doi-vat-tu`
  - `/dt-hd-tt` (has its own `layout.tsx` and a sub-nav)
  - `/hop-dong` (sub-routes `[contractId]` and `hoa-don-cdt` after PR #24)
  - `/dong-tien-3-ben`
  - `/cong-no`
  - `/cai-dat`

### DT-HĐ-TT sub-navigation

- `W/components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx` is a client component using `useSelectedLayoutSegment`.
  - `DT_HD_TT_SECTIONS` has 9 flat pills: 3 reports, 3 books, 3 registers.
  - `invoiceBookHref()` is exported and used elsewhere.
- `dt-hd-tt/page.tsx` redirects to `/dt-hd`.
- `dt-hd-tt/layout.tsx` renders the sub-nav.

### Reports

- `getDtHdTtReports(projectId)` (`W/lib/du-an/dt-hd-tt/report-service.ts:17`, `"use server"`) runs 10 Prisma queries in parallel plus a supplier lookup, then `buildReports(inputs)`.
  - It returns `{ settings, dtHd, dtTt, phanIII, hdTt }`.
  - It enforces read ACL through `requireReleasedModuleRequest`.
- `W/components/du-an/dt-hd-tt/load-report-page.ts` is the shared loader for the 3 report pages.
- `report-bits.tsx` holds:
  - the formatters `money` / `moneyOrZero` / `qty` / `pct`;
  - the class constants `TH` / `TD` / `TD_NUM`;
  - `ReportTable`, which wraps each table in `overflow-x-auto`, so no sticky header against page scroll;
  - `TieOutLine`;
  - `SettingsBanner`, which has the only link on any report;
  - `ReportToolbar` (Xuất Excel plus `PrintButton`, default A4 landscape).
- `dt-hd-view.tsx` (141 lines) renders blocks → groups → DT lines → "↳" invoice rows, all expanded.
  - `BlockSummary` is a `·`-joined muted text-xs sentence (lines 44–60).
  - Part B gives "Ngoài DT" and "chưa gán" the same tag (line 127).
  - The engine knows the difference (`book-index.ts:16`), but `DtHdInvoiceRow` does not carry it.
- `dt-tt-view.tsx` (154 lines) renders Phần I, II and III as stacked tables.
  - Phần II rows carry `dtExVat`, `dtInclVat`, `actual` (gồm VAT, or null = "chưa chốt") and `diff` (DT − TT, gồm VAT basis).
  - Phần II is therefore the same-VAT-basis per-đầu mối over/under-budget data for the lãnh đạo view.
- `hd-tt-view.tsx` (93 lines):
  - columns come from `HD_TT_MONEY_COLS` (`W/lib/du-an/dt-hd-tt/export-sheet-hd-tt.ts:8-22`), which is also the Excel header (`HD_TT_HEADER`, line 24) and is asserted by `__tests__/export-sheets.test.ts`;
  - markers "(H)", "(tạm = HĐ)" and "(tách)" are appended inside number cells;
  - `print:[zoom:0.8]`.
- `dt-hd-report.ts:162-180`: a block's tie-out is an identity, because own invoices are split into `inOwnGroups + outsideDt + crossAssigned`. The checks a user can actually break are on HĐ-TT (`hd-tt-report.ts`, `checks`).

### Print

- "In" is `window.print()` on the live page (`W/app/globals.css:273-290`, `@media print`).
- Print CSS hides `nav`, `aside`, `header`, `button`, `[role=navigation]` and `.no-print`.
- `PrintButton` is in `W/components/export-buttons.tsx:65`, with page-size and orientation options.
- Any screen-only collapse or filter in the same DOM changes the paper output.
- Excel is safe: `/api/du-an/{id}/dt-hd-tt/export?report=` builds the file from the report object (`export-sheets.ts`).

### Entry books

- `hoa-don-client.tsx`, `thuc-te-nhap-client.tsx` and `chi-thuc-te-client.tsx` share one layout: an add-form on top, then a `DataGrid` (glide-data-grid, canvas, `next/dynamic` `ssr:false`) with a fixed `height` (560 / 480 / 420).
- The NCC field is a native `<select>`. Cells are saved one at a time through server actions (`updateInvoiceLine` etc.), which return `ActionResult`.
- Grid columns support `filterable?: boolean` (`W/components/data-grid/types.ts:38`), but no book column sets it.
- `useGridView` keeps filters in local state with no initial value (`W/components/data-grid/use-grid-view.ts:24`).
- The filter UI lives in `filter-bar.tsx` and `filter-widgets.tsx`. The `FilterValue` type is in `W/lib/table/types.ts`.

### Registers

- **Ánh xạ:**
  - `W/app/(app)/du-an/[id]/dt-hd-tt/anh-xa/page.tsx` reads only `?tab=`.
  - `anh-xa-client.tsx` holds the status filter and search in local state, with the filter starting at "Tất cả".
  - `anh-xa-editor.tsx` picks the Dòng DT from a native `<select>` over up to 362 lines.
  - The editor does not show the source lines.
  - Saving closes the editor; it does not advance to the next key.
- **Đầu mối:**
  - `dau-moi/page.tsx` renders the counterparty grid and, below it, `dau-moi-suppliers.tsx`, the NCC-of-đầu-mối grid where H / S / X / Z are typed.
  - The server action is `updateCounterpartySupplier(id, projectId, patch: CounterpartySupplierPatch)` (`W/lib/du-an/dt-hd-tt/counterparty-service.ts:208`). It already enforces `edit`.

### Dashboard

- `W/app/(app)/du-an/[id]/page.tsx` (134 lines) and `W/lib/du-an/dashboard-service.ts` (`"use server"`, read ACL).
- "Thực tế" sums `projectTransaction.amountTt`. Transactions derived from the invoice book carry HĐ only (`derive-transactions.ts`), so a book project shows about 0.
- The contract warning text hardcodes "90 ngày" while `warningDays` is configurable. This is a follow-up, not required.

### Reusable UI

- `W/components/ui/` contains: button, card, date-input, dialog, dropdown-menu, empty-state, form, input, label, month-year-picker, separator, sheet, sidebar, skeleton, `status-badge`, table, `tooltip`.
- No combobox exists.
- `@base-ui/react` 1.4 is installed and offers Combobox / Autocomplete primitives, so no new dependency is needed.
- **Master-data quick-create** (`W/components/master-data/quick-create/`):
  - a native `<select>` with a "+ Tạo mới…" option;
  - admin-only (`enabled`);
  - used by `hop-dong-form.tsx`, `delivery-form.tsx` and `new-row-project-select.tsx`.
- Design system: `W/design-system/ngoquyenerp/MASTER.md`. Data-dense dashboard, no emoji icons, visible focus, lucide icons.

### Tests

- Vitest 4. The `unit` project covers `lib/**/*.test.ts` and `test/unit/**/*.test.ts` with environment `node`.
- Static-markup rendering is an established pattern: `renderToStaticMarkup` in `W/test/unit/sort-header.test.ts`.
- `W/lib/du-an/dt-hd-tt/__tests__/report-fixture.ts` gives a report fixture to snapshot the three views.
- Integration tests are under `test/integration/**`.
- An ACL contract test exists for server actions: `test/risk-manifest*.ts` and `lib/du-an/__tests__/project-service-acl-contract.test.ts`. New server actions or routes must be classified there.

## Design choices each candidate must make explicitly

1. **Screen-versus-print strategy.** Options:
   - (a) keep the current views as print-only (`hidden print:block`) and add screen components over the same report object;
   - (b) one markup with screen-only classes and controls hidden in print;
   - (c) a dedicated print route opened by "In".

   State the cost: HTML size, print-drift risk, change to the "In" flow.
2. **Tổng quan data source.** Reuse `getDtHdTtReports`, plus the alias board for counts, or a lighter summary service. Say how every figure is proven to equal a report cell.
3. **Dashboard book detection, and which cards change.** For example: the project has non-deleted invoice lines, or a superseding import run. Avoid a second source of truth.
4. **Shell navigation pattern.** A two-row group/tab bar, a grouped dropdown, or a side list. Say how the active group is derived (`useSelectedLayoutSegment(s)`) and how DT-HĐ-TT's own sub-nav nests without a third row.
5. **HĐ-TT in-place H / S / X / Z editing.** Inline inputs in an HTML table, or a DataGrid. Concurrency and refresh behaviour, and keyboard flow.
6. **URL-driven filters.** The parameter contract for Ánh xạ (`tab`, `status`, `q`), the books (initial grid filter) and DT-HĐ (open đầu mối, filter). How `DataGrid` gains an initial-filter input without breaking other users of the grid.
7. **Searchable pickers.** Build on `@base-ui/react` Combobox, or something else. How it coexists with the admin-only quick-create option.
8. **Phase order and shippable increments.** Where the print baseline (PDF text + Excel) and the view snapshot tests sit. Effort per phase.

## What each candidate must deliver

Write to `{plan-dir}/reports/planner-debate-candidate-{N}.md`:

- **Chosen answers to the 8 design choices,** each with the assumption it depends on and when it fails first.
- **Phases.** For each: goal, exact files to create / modify (paths under the repo root, not W), steps, tests with exact commands, effort, dependencies, risks and rollback.
- **A mapping from each acceptance criterion (1–9) to the phase and test that proves it.**
- **Unresolved questions,** last.
- No code beyond short signatures or pseudocode. Complete sentences, selective, no filler.
