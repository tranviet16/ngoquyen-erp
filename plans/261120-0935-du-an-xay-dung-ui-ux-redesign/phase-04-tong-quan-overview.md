---
phase: 4
title: "Tổng quan"
status: pending
priority: P1
effort: "2d"
dependencies: [2, 3]
---

# Phase 4: Tổng quan

## Goal

Make `/du-an/{id}/dt-hd-tt` open a Tổng quan page for lãnh đạo, delivering criterion 2 and the Tổng quan half of criterion 3. The page has:
- headline figures that are existing report fields, with VAT-basis labels;
- the đầu mối most over budget;
- a to-do list where each item links to its already-filtered fix screen once that screen is ready;
- a one-line Kiểm tổng;
- report shortcuts.

## Context

- **Rulings:**
  - [debate-synthesis.md](reports/debate-synthesis.md) §2, rows "Tổng quan headline labels", "Σ U drill-down", "Over-budget list", "Auto-print";
  - where the red team changed them: [red-team-adjudication.md](reports/red-team-adjudication.md), findings 6, 12, 13 and 15, plus the removed revalidation step.
- **Detail to lift:**
  - [candidate 2](reports/planner-debate-candidate-2.md): P3 and the Tổng quan wireframe (layout, `data-figure`).
  - [candidate 1](reports/planner-debate-candidate-1.md): design choice 2 (the to-do table and check list).
  - [candidate 3](reports/planner-debate-candidate-3.md): Phase 4 step 1 (the two "thực tế" labels).
- **Facts:**
  - **Σ U nets across NCC.** `totals.actualMinusInvoice` is a plain sum of T − E (`hd-tt-report.ts:121`), and T = 0 for an NCC without a đầu mối (`:91`).
  - **Two populations of thực tế.** Phần III `total.actual` and HĐ-TT Σ T cover different rows (`phan-iii.ts:46-53,67`), so the labels must differ.
  - **Block C has no dự toán.** Every Phần II kind gets `diff = dtInclVat − actual` (`dt-tt-report.ts:111-117`), so block C would always read as "vượt".
<!-- Red team: finding 13 -->
  - **Chênh is not a report field.** The print view computes it inline as `r.actual === null ? "" : r.estimate - r.actual` (`dt-tt-view.tsx:133`). All new code uses one shared `phanIIIDiff(row)` with the same null guard.
  - **Reusable pieces:**
    - `StatusBadge` (`components/ui/status-badge.tsx:54-84`);
    - the module's shared bits, `report-bits.tsx:1-5`;
    - the Dashboard's local `StatCard` (`app/(app)/du-an/[id]/page.tsx:11-39`), which is extracted here so Tổng quan and the Dashboard share it.
<!-- Red team: finding 6 -->
  - **Link rows.** Whether a supplier has a link row comes from `listCounterparties`, as the Đầu mối page does (`dau-moi/page.tsx:23-37`).
<!-- Red team: finding 12 -->
  - **ACL test coverage.** `PROJECT_PAGE_FILES` (`test/unit/module-release-entrypoints.test.ts:42-63`) does not list the DT-HĐ-TT index, `dt-hd`, `dt-tt` or `hd-tt` pages. The three report pages call no `requireModuleAccess` today. They rely on `getDtHdTtReports`' own check (`report-service.ts:18`).
<!-- Red team: removed step, entry-write-guards.ts stays untouched -->
- **No revalidation change.** These pages are dynamic and render fresh on every visit, and the actions' existing `revalidatePath` already re-renders the current page. So `lib/du-an/dt-hd-tt/entry-write-guards.ts` stays untouched.

## Files

- **Create:**
<!-- Red team: finding 13 -->
  - `lib/du-an/dt-hd-tt/overview.ts`: `buildOverview(reports, board, linkedSupplierIds)`, `selectBudgetHeadline(reports)` (reused by phase 5) and `phanIIIDiff(row)`.
<!-- Red team: finding 6 -->
  - `lib/du-an/dt-hd-tt/overview-todos.ts`: the to-do rows, each counted with its landing screen's own predicate. It also exports `HD_TT_LOC_PREDICATES` for `con-phai-lay-hd` (U > 0), `con-phai-lay-ve` (Y > 0) and `co-viec` (Z not empty), which phase 7's filters import.
<!-- Red team: finding 13 -->
  - `components/du-an/stat-card.tsx`: the `StatCard` extracted from the Dashboard page, unchanged.
  - `components/du-an/dt-hd-tt/tong-quan-view.tsx`
  - `components/du-an/dt-hd-tt/tong-quan-todos.tsx`
<!-- Red team: finding 4 -->
  - `scripts/dt-hd-tt-ui-measure/todos.ts`
  - Tests:
    - `lib/du-an/dt-hd-tt/__tests__/overview.test.ts`
    - `lib/du-an/dt-hd-tt/__tests__/overview-todos.test.ts`
    - `test/unit/dt-hd-tt-overview-cells.test.ts`
    - `test/unit/tong-quan-view.test.ts`
- **Modify:**
  - `app/(app)/du-an/[id]/dt-hd-tt/page.tsx`: replace the redirect with the Tổng quan page.
  - `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx`: set Tổng quan to `ready: true`.
<!-- Red team: finding 13 -->
  - `components/du-an/dt-hd-tt/report-bits.tsx`: add the shared screen pieces. These are a filter chip, the active-filter line "đang lọc: hiện n / m dòng" and a collapsible section header. The file stays without `"use client"`, and its existing exports stay unchanged.
<!-- Red team: finding 13 -->
  - `app/(app)/du-an/[id]/page.tsx`: import the extracted `StatCard`. The markup is unchanged, and the phase-1 Dashboard capture proves it.
<!-- Red team: finding 12 -->
  - `app/(app)/du-an/[id]/dt-hd-tt/{dt-hd,dt-tt,hd-tt}/page.tsx`: add an explicit `await requireModuleAccess("du-an", { minLevel: "read", scope: { kind: "project", projectId } })` before `loadReportPage`.
<!-- Red team: finding 12 -->
  - `test/unit/module-release-entrypoints.test.ts`: add `dt-hd-tt/page.tsx`, `dt-hd/page.tsx`, `dt-tt/page.tsx` and `hd-tt/page.tsx` to `PROJECT_PAGE_FILES`. The assertion itself is unchanged; only this phase edits the file.

## Page content, top to bottom

### 1. Số chính

<!-- Red team: finding 13 -->
<!-- Red team: finding 4 -->
Every figure:
- is a `StatCard`;
- carries the `data-figure` and `data-value` hooks for the measure script;
- is formatted with `moneyOrZero`.

<!-- Red team: finding 15 -->
Links go through `screenHref`. A link carries its filter or hash only when its target is in `READY_TARGETS`; otherwise it opens the bare report page. Phases 6 and 7 add `dt-hd`, `dt-tt` and `hd-tt` to that list.

| Figure | Label | Source field | Link |
|---|---|---|---|
| Dự toán Gxd | "Dự toán (Gxd, sau thuế)" | `phanIII` total row, `estimate` | `dt-tt#phan-iii` |
| Thực tế | "Thực tế toàn công trình (Phần III)" | `phanIII` total row, `actual` | `dt-tt#phan-iii` |
| Chênh | "Chênh DT − TT" | `phanIIIDiff(total row)` | `dt-tt#phan-iii` |
| Σ E | "Hóa đơn gồm VAT (Σ E)" | `hdTt.totals.invoiceTotal` | `hd-tt` |
| Σ T | "Thực tế các NCC có HĐ (HĐ-TT Σ T)" | `hdTt.totals.actual` | `hd-tt` |
| Σ U | "Còn phải lấy HĐ: Σ T − Σ E, bù trừ giữa các NCC" | `hdTt.totals.actualMinusInvoice` | `hd-tt?loc=con-phai-lay-hd` (rows with U > 0) |
| Σ I | "Đã trả (Σ I)" | `hdTt.totals.paid` | `hd-tt` |
| Σ V | "Nợ thực tế (Σ V)" | `hdTt.totals.debt` | `hd-tt` |
| Σ Y | "Còn phải lấy về (Σ Y)" | `hdTt.totals.stillToRecover` | `hd-tt?loc=con-phai-lay-ve` |

<!-- Updated: Validation Session 1 - Σ U shown, labelled as netted, linked to rows with U > 0 -->
The user confirmed the Σ U row on 2026-11-23 (validation question 7): it is shown, labelled as netted across NCC, and links to the rows with U > 0.

### 2. Đầu mối cần chú ý

- Show Phần II rows A and B with `diff < 0`, in ascending order.
- Show 5 rows, with "xem thêm" up to 10 and a link to `dt-tt#phan-ii`.
- Each row shows `dtInclVat`, `actual` and `diff`, and links to `dt-tt#dm-{id}`.
<!-- Red team: finding 6 -->
- Also show the count of Phần II rows with `actual === null` ("n đầu mối chưa chốt thực tế"), linking to `dau-moi?filter.actual=chua-chot`. That filter applies the same null test to the same Phần II figures (`dau-moi/page.tsx:31-32`).

### 3. Việc cần làm

<!-- Red team: finding 6 -->
<!-- Updated: Validation Session 1 - Dự toán to-do lands on the confirmed read-only filter -->
Rows with a zero count are hidden. Each count uses the same predicate as its landing filter. Every href comes from `screenHref`. The Dự toán row lands on the read-only `?loai=thieu` filter, which the user confirmed on 2026-11-23 (validation question 1).

| To-do | Count (the landing predicate) | Link |
|---|---|---|
| Tên chưa gán (per source hd / tt / dt) | board rows whose `effectiveAliasStatus` is `chua_gan` (`aliasQueueSummary`) | `anh-xa?tab=…&status=chua_gan` |
| Đề xuất chờ xác nhận (per source) | board rows whose `effectiveAliasStatus` is `de_xuat` | `anh-xa?tab=…&status=de_xuat` |
| Khóa chưa có hệ số (HĐ / thực tế) | board keys with `missesFactor`, per source | `anh-xa?tab=hd\|tt&status=thieu_he_so` |
| Thực tế nhập chưa gắn đầu mối | `dtTt.untaggedReceipts ≠ 0`; this amount is made up of exactly the receipts without a đầu mối | `thuc-te-nhap?filter.counterpartyId=none` |
| Đầu mối chưa chốt thực tế | Phần II rows with `actual === null` | `dau-moi?filter.actual=chua-chot` |
| NCC có HĐ nhưng chưa thuộc đầu mối | suppliers that have a link row whose đầu mối is empty | `dau-moi?filter.counterpartyId=0#ncc` |
| NCC có số ở HĐ-TT nhưng chưa có dòng NCC | HĐ-TT suppliers with no link row: the existing `withoutRow` list (`dau-moi/page.tsx:36-37`) | `dau-moi#ncc-chua-co-dong`, the notice that lists exactly them |
| Dự toán chưa có loại VL / NC / MTC | `phanIII.dtWithoutKind ≠ 0`; landing ids from `kindlessEstimateIds`, which uses the same rule | `du-toan?loai=thieu` |
| Chưa cài đặt tỷ lệ | `settings.missing` | `cai-dat`, the only allowlisted unfiltered link |
| Việc cần làm của kế toán (Z) | HĐ-TT rows matching the `co-viec` predicate | `hd-tt?loc=co-viec` |

### 4. Kiểm tổng

- One line, "n/n khớp", inside a `<details>`.
- The checks come from the DT-HĐ block tie-outs and `grandCheck`, `dtTt.checks` and `hdTt.checks`.
- Each failing check shows Δ and its fix link, through `screenHref`.

### 5. Report shortcuts

- "Mở" and "Xuất Excel" for each of the three reports.
- No auto-print.

## Steps

<!-- Red team: finding 13 -->
1. **`overview.ts`.** Write `buildOverview`, `selectBudgetHeadline` and `phanIIIDiff`. Figures are direct reads of report fields; no resolver or reference type is involved.
<!-- Red team: finding 6 -->
2. **`overview-todos.ts`.** Use `aliasQueueSummary` and `effectiveAliasStatus` (phase 2), `missesFactor` and `kindlessEstimateIds` (phase 3), and `screenHref`.
<!-- Red team: finding 13 -->
3. **Views.**
   - Extract `StatCard` into `components/du-an/stat-card.tsx`.
   - Extend `report-bits.tsx`.
   - Write `tong-quan-view.tsx` and `tong-quan-todos.tsx` with lucide icons and no emoji, per `design-system/ngoquyenerp/MASTER.md`. Use `StatusBadge` for text statuses.
   - Add the hooks `data-figure`, `data-todo` and `data-todo-count`.
<!-- Red team: finding 12 -->
4. **Index page.** Replace the redirect in `dt-hd-tt/page.tsx`. `requireModuleAccess` comes first, after `await params`. Then load in parallel:
   - the reports, via `loadReportPage`;
   - the board, via `listAliasBoard`;
   - the link rows, via `listCounterparties`.
<!-- Red team: finding 12 -->
5. **Report-page guards.** Add the explicit guard to the `dt-hd`, `dt-tt` and `hd-tt` pages, and add the four pages to `PROJECT_PAGE_FILES`.
6. **Sub-nav.** Turn on the Tổng quan entry.
<!-- Red team: finding 4 -->
<!-- Red team: finding 15 -->
7. **Measure `todos`.**
   - Click every figure and to-do link.
   - A link to a ready target must land with its `data-*` state equal to the link's parameters and at least one row.
   - A link to a target that is not ready must land on the bare page.
   - It exits non-zero on an unfiltered landing for a ready target, and when Tổng quan is missing.

## Todo

- [ ] `overview.ts` and `overview-todos.ts`; each count uses its landing predicate
- [ ] `StatCard` extracted; `report-bits.tsx` extended; Tổng quan views
- [ ] Index page renders Tổng quan; sub-nav entry visible
- [ ] Explicit guard on the three report pages; four pages added to `PROJECT_PAGE_FILES`
- [ ] Measure `todos` on project 4 green for every ready target

## Verification

<!-- Red team: finding 1 -->
```powershell
npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/overview.test.ts lib/du-an/dt-hd-tt/__tests__/overview-todos.test.ts test/unit/dt-hd-tt-overview-cells.test.ts test/unit/tong-quan-view.test.ts test/unit/module-release-entrypoints.test.ts
npx tsx scripts/dt-hd-tt-ui-measure.ts todos --base-url http://127.0.0.1:3003 --project 4
```

Then run the common gate, including the baseline `compare` on `127.0.0.1:3003`. The Dashboard text must still equal the phase-1 capture after the `StatCard` extraction.

<!-- Red team: finding 13 -->
- **Criterion 2 proof:**
  - `overview.test.ts` is a literal equality table. Each figure is checked against the report field it names, for example `expect(o.sigmaE).toBe(r.hdTt.totals.invoiceTotal)`. Chênh is checked against `phanIIIDiff(total row)`, including the `actual === null` case.
  - `dt-hd-tt-overview-cells.test.ts` renders the views and checks that the formatted figure appears in the Gxd row of `DtTtView`, the TỔNG CỘNG row of `HdTtView`, and each listed Phần II row.
<!-- Red team: finding 6 -->
<!-- Red team: finding 15 -->
- **Criterion 3 proof, Tổng quan part.** The final check is in phase 9.
  - `overview-todos.test.ts`, on a fixture that includes a stale `dtKey`, checks three things:
    - whenever a count is greater than zero, applying that to-do's landing predicate to the same data yields at least one row;
    - every href parses back to all the parameters it was built with;
    - a target that is not ready yields the bare path.
  - The allowlist holds `cai-dat` only.
  - `measure todos` passes on project 4.

## Risks and rollback

- **A leader asks for a figure that is not a report field,** for example DT vs HĐ. The answer stays "no new totals", which is a non-goal.
<!-- Red team: finding 6 -->
- **Estimates under a soft-deleted category.** They count in `phanIII.dtWithoutKind`, and the Dự toán landing includes them only if `du-toan-client.tsx` renders them (phase 3, step 7).
<!-- Red team: finding 15 -->
- **Rollback:**
  1. Revert PR 4, plus every later PR touching the same files:
     - PR 5: the Dashboard `page.tsx` and `overview.ts`;
     - PR 6: `dt-hd/page.tsx`;
     - PR 7: `dt-tt/page.tsx` and `hd-tt/page.tsx`.

     Phases 6 and 7 use the pieces this phase adds to `report-bits.tsx` but do not edit that file.
  2. Then re-run `measure todos` and the baseline `compare`.
