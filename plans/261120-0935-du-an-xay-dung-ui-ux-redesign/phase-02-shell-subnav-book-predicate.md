---
phase: 2
title: "Shell regroup, grouped sub-nav, shared book predicate"
status: pending
priority: P1
effort: "1.25d"
dependencies: [1]
---

# Phase 2: Shell regroup, grouped sub-nav, shared book predicate

## Goal

Meet criterion 1: the project shell shows 7 groups with an active state, no horizontal scroll and no wrapped row. Phase 2 also delivers:
- the grouped DT-HĐ-TT sub-nav;
- one shared "project uses the book" predicate;
- one shared "chưa gán" definition;
- an Ánh xạ badge that can never break a page.

There is no URL change and no print change.

## Context

- **Rulings:**
  - [debate-synthesis.md](reports/debate-synthesis.md) §2;
  - where the red team changed them: [red-team-adjudication.md](reports/red-team-adjudication.md), findings 4, 5, 6, 9 and 13.
- **Detail to lift:**
  - [candidate 2](reports/planner-debate-candidate-2.md), P1: group map, nav view split, measure-script design;
  - [candidate 3](reports/planner-debate-candidate-3.md), Phase 2: step 3 (guard extraction test) and step 4 (queue summary);
  - [candidate 1](reports/planner-debate-candidate-1.md), design choice 4, "Print safety".
- **Current shell:** `app/(app)/du-an/[id]/layout.tsx:10-25` (`TABS`) and `:82-94` (bar). Every tab gets the same class, there is no `aria-current`, and the bar is `overflow-x-auto`.
- **Entrypoint test:** the layout must keep `queryProjectById(projectId)` (`test/unit/module-release-entrypoints.test.ts:195-205`).
- **Book predicate:**
  - It exists today inside `lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts:11-23`. It counts a superseded transaction, a live transaction with `sourceInvoiceLineId`, or a superseded estimate.
  - The guard has two callers: `bang-can-doi-vat-tu.adapter.ts:462` and `du-an-xay-dung.adapter.ts:500`.
<!-- Red team: finding 5 -->
  - No test exercises the guard today. The import integration test only checks the DT-HĐ-TT adapter's own `blocking` list, and it is skipped unless `DT_HD_TT_WORKBOOK` is set (`test/integration/du-an-dt-hd-tt-import.integration.test.ts:24,58,63,70`).
<!-- Red team: finding 6 -->
- **Two definitions of "chưa gán" today:**
  - The engine places an hd or tt line as chưa gán when it has no alias, and also when its alias is not `ngoai_dt`, its `dtKey` is not a live DT key, and it has no group (`lib/du-an/dt-hd-tt/book-index.ts:73-82`).
  - Ánh xạ counts only `alias === null` (`app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-client.tsx:26,53`).
  - `alias-board.ts:118-121` already resolves groups against the live DT keys, so the shared predicate belongs there.
<!-- Red team: finding 9 -->
- **Layout cost and isolation:**
  - The DT-HĐ-TT layout runs no query today (`app/(app)/du-an/[id]/dt-hd-tt/layout.tsx:5-15`).
  - `listAliasBoard` reads every invoice line, receipt, alias, DT line and group (`lib/du-an/dt-hd-tt/alias-service.ts:135-156`).
  - `listAliasBoard` lives in a `"use server"` file (`alias-service.ts:1`), so a new loader cannot be exported there without adding a server action.
  - There is no error boundary below `app/global-error.tsx`.
<!-- Red team: finding 5 -->
- **Tests:** unit tests run with `environment: "node"`, only `*.test.ts` files are picked up, and no DOM library is installed (`vitest.config.mts:7,21`). Behaviour is tested through pure functions. Interactions go to the measure script.

## Files

**Create:**
- `lib/du-an/project-nav.ts`: the 7-group map and `resolveProjectNav(segment)`.
- `components/du-an/project-nav.tsx`: client `ProjectNav`, using `useSelectedLayoutSegment()`, plus a pure `ProjectNavView`.
<!-- Red team: finding 13 -->
- `lib/du-an/dt-hd-tt/book-presence.ts`: `projectUsesBook(db, projectId)`; not `"use server"`. It stays its own module because the import guard and the Dashboard loader (phase 5) both use it, and neither `lib/import` nor the report module is the right sole home.
<!-- Red team: finding 9 -->
- `components/du-an/dt-hd-tt/alias-queue-badge.tsx`: an async server component. It calls the narrow loader, counts with `aliasQueueSummary`, catches its own errors and renders nothing on failure.
<!-- Red team: finding 4 -->
- `scripts/dt-hd-tt-ui-measure.ts`: a dispatcher.
  - `measure <name>` runs `scripts/dt-hd-tt-ui-measure/<name>.ts`, and `all` runs every file in that folder. An unknown name exits non-zero.
  - `--base-url` is required. Sessions come from the phase-1 helper, and `--as` defaults to the admin state.
  - Each later screen phase adds its own subcommand file together with its screen and `data-*` hooks. So no two parallel phases edit the same script file, and a subcommand never exists before its screen.
- `scripts/dt-hd-tt-ui-measure/nav.ts`.
- **Tests:**
  <!-- Red team: finding 5 -->
  - `test/unit/legacy-import-guard.test.ts`, written first and run against today's guard;
  - `test/unit/project-nav.test.ts`;
  - `test/unit/dt-hd-tt-sub-nav.test.ts`;
  - `lib/du-an/dt-hd-tt/__tests__/book-presence.test.ts`;
  <!-- Red team: finding 6 -->
  - `lib/du-an/dt-hd-tt/__tests__/alias-status.test.ts`.

**Modify:**
- `app/(app)/du-an/[id]/layout.tsx`:
  - replace `TABS` and the bar with `<ProjectNav>`;
  - keep `queryProjectById` and the `div.border-b` wrapper;
  - feed the book note (step 4) from `projectUsesBook` inside its own `<Suspense fallback={null}>`, so a failed count hides only the note.
- `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx`:
  - add a `group` field (Tổng quan / Báo cáo / Nhập sổ / Thiết lập);
  - add a Tổng quan entry with `ready: false`. It is the index route: its href is the base path with no trailing segment, and it is active when the selected segment is `null`;
  <!-- Red team: finding 9 -->
  - add a `badge?: ReactNode` slot;
  - keep `DT_HD_TT_SECTIONS` and `invoiceBookHref` exported.
<!-- Red team: finding 9 -->
- `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx`: pass `<Suspense fallback={null}><AliasQueueBadge projectId={projectId} /></Suspense>` as the sub-nav's badge.
<!-- Red team: finding 9 -->
<!-- Red team: finding 13 -->
- `components/du-an/dt-hd-tt/load-report-page.ts`: add the narrow loader `loadAliasQueueInputs(projectId)`. It reads, in this order:
  - the read check (`requireReleasedModuleRequest`, as `listAliasBoard` does at `alias-service.ts:136`);
  - the live aliases (`source`, `itemKey`, `status`, `dtKey`, `groupCodeId`);
  - the distinct item keys of live invoice lines and receipts;
  - the live DT keys from `loadDtLines` (`lib/du-an/dt-hd-tt/alias-groups.ts:11`).
<!-- Red team: finding 6 -->
<!-- Red team: finding 13 -->
- `lib/du-an/dt-hd-tt/alias-board.ts`: add `effectiveAliasStatus(alias, liveDtKeys)` and `aliasQueueSummary(entries, liveDtKeys)`. The `entries` are `{ source, itemKey, alias }` values, which both the board rows (Tổng quan) and the narrow loader (badge) provide.
- `lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts`: delegate to `projectUsesBook`, with the same signature and message. Do this only after the guard test is green on today's code.

## Steps

1. **Group map.** Follow the brainstorm table exactly:

   | Group | Tabs |
   |---|---|
   | Tổng quan | Dashboard |
   | Tiến độ & nghiệm thu | Tiến độ, Nghiệm thu |
   | Dự toán | Dự toán, DT điều chỉnh, Phát sinh |
   | Đối chiếu DT-HĐ-TT | its own sub-nav |
   | Vật tư & công nợ | Giao dịch, Cân đối VT, Định mức, Công nợ NCC |
   | Hợp đồng & dòng tiền | Hợp đồng, Dòng tiền 3 bên |
   | Cài đặt | — |

   Each of the 14 hrefs appears exactly once. A group link goes to its first tab.
<!-- Red team: finding 5 -->
2. **Active state.**
   - Row 1 marks the active group with `aria-current="true"`. Row 2 marks the active tab with `aria-current="page"`.
   - Both rows use `flex-wrap`, with no `overflow-x-auto`.
   - For each of the 14 segments plus `null`, the nav model gives:
     - exactly one active group;
     - at most one active tab;
     - no tab row for Cài đặt;
     - the child layout's sub-nav as row 2 for the DT-HĐ-TT group.
3. **Row 2 height.** Row 2 is drawn for every group so the bar height does not jump. Cài đặt's row 2 is empty. DT-HĐ-TT's row 2 is its own sub-nav.
4. **Book note.** On book projects, show "Hóa đơn ở các tab này lấy từ sổ Hóa đơn" inside the "Vật tư & công nợ" `nav`. The shell layout gets the flag from `projectUsesBook`, which is two `count` queries per project page. The step-9 timing covers that cost. `nav` is hidden on print by `globals.css`.
<!-- Red team: finding 5 -->
5. **Guard test first, then the predicate.**
   1. Write `legacy-import-guard.test.ts` with a fake db. It covers the three triggers, each returning the exact message, plus the empty case and an unknown project code. It must pass on today's guard.
   2. Then extract `projectUsesBook` with the guard's exact `where` clauses.
   3. Make the guard resolve the code to an id and call the predicate. The same test must stay green.
   4. `book-presence.test.ts` covers the three triggering cases and the empty case.
<!-- Red team: finding 6 -->
6. **One "chưa gán" definition.**
   - `effectiveAliasStatus` returns `chua_gan` when there is no alias. It also returns `chua_gan` for an hd or tt alias that is not `ngoai_dt`, whose `dtKey` is not in `liveDtKeys` and whose `groupCodeId` is null. This mirrors `book-index.ts:73-82`. In every other case it returns the stored status. A dt alias always keeps its stored status.
   - `aliasQueueSummary` counts chưa gán and đề xuất per source through `effectiveAliasStatus`. The "thiếu hệ số" count is computed in phase 4 with phase 3's `missesFactor`.
   - `alias-status.test.ts` includes a fixture alias whose `dtKey` is stale.
   - Phase 3 (the Ánh xạ status filter and header), phase 4 (Tổng quan) and phase 6 (Phần B) all use this same function.
<!-- Red team: finding 9 -->
7. **Badge.**
   - The narrow loader feeds `aliasQueueSummary`, and the sub-nav shows "n chưa gán" on Ánh xạ.
   - The badge renders in its own `Suspense` with a `null` fallback, and any error renders no badge.
   - So the count can never block a report page or the print path.
<!-- Red team: finding 4 -->
8. **Measure script: dispatcher and `nav`.**
   - `nav` runs at 1366 px and 1440 px, on the Dashboard and on every tab. It checks:
     - no horizontal scroll;
     - every row is one line tall, meaning its `offsetHeight` equals a one-line reference element. With `flex-wrap`, a width check alone could never fail;
     - exactly one active group;
     - at most one active tab;
     - no tab row under Cài đặt;
     - row 2 of the DT-HĐ-TT group is the sub-nav.
   - The hooks are `data-nav-row="groups" | "tabs" | "dt-hd-tt"`.
<!-- Red team: finding 9 -->
9. **Timing.** The baseline `compare` on `127.0.0.1:3003` prints the dt-hd server-time median, which must be at most the baseline plus 100 ms. That keeps the badge and the book note out of phase 6's 300 ms budget for the DT-HĐ screen. Phase 8 re-runs this check.

## Todo

- [ ] Guard test green on today's guard, then `projectUsesBook` extracted and the guard delegating with the test still green
- [ ] `project-nav.ts`, `ProjectNav` and the nav-model tests for all 14 segments plus `null`
- [ ] Shell layout uses `ProjectNav`; book note in its own `Suspense`; entrypoint test green
- [ ] Sub-nav grouped; Tổng quan index entry present but hidden
- [ ] `effectiveAliasStatus` and `aliasQueueSummary` in `alias-board.ts`, with the stale-`dtKey` fixture
- [ ] Badge in its own `Suspense`, fed by the narrow loader
- [ ] Measure dispatcher and `nav` pass at 1366 and 1440
- [ ] dt-hd server time is at most the baseline plus 100 ms

## Verification

<!-- Red team: finding 1 -->
<!-- Red team: finding 5 -->
```powershell
npx vitest run --project unit test/unit/legacy-import-guard.test.ts test/unit/project-nav.test.ts test/unit/dt-hd-tt-sub-nav.test.ts lib/du-an/dt-hd-tt/__tests__/book-presence.test.ts lib/du-an/dt-hd-tt/__tests__/alias-status.test.ts test/unit/module-release-entrypoints.test.ts
npx tsx scripts/dt-hd-tt-ui-measure.ts nav --base-url http://127.0.0.1:3003 --project 4
```

Then run the common gate (plan.md), including the baseline `compare` against the branch served on `127.0.0.1:3003`. It must exit 0, and dt-hd must be within the baseline plus 100 ms.

<!-- Red team: finding 4 -->
- **Criterion 1 proof:**
  - `project-nav.test.ts` checks the nav model for all 14 segments plus `null`.
  - `measure nav` checks one-line rows, no horizontal scroll and the `aria-current` counts at 1366 and 1440.

## Risks and rollback

<!-- Red team: finding 4 -->
- **Labels wrap at 1366:** `measure nav` fails. Reduce padding first, and shorten labels last.
<!-- Red team: finding 9 -->
- **Badge or book-note cost:** both use narrow reads and are gated by the step-9 timing. A failure in either renders nothing instead of failing the page.
<!-- Red team: finding 15 -->
- **Rollback:**
  1. Revert PR 2, plus PR 4 (`dt-hd-tt-sub-nav.tsx`) and PR 5 (`load-report-page.ts`) if they have merged.
  2. `npx tsc --noEmit` in the gate flags any later PR that imports a module from this phase; revert that PR too. Phase 3, for example, imports `effectiveAliasStatus`.
  3. Then re-run `measure todos` and the baseline `compare`.

  The guard test keeps the import path safe either way.
