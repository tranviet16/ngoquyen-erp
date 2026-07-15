# UI/UX Review Summary - Ngô Quyền ERP

Date: 2026-06-08
Scope: Review current UI direction and propose mockups before broad redesign.

## Confirmed Priority

- Primary role: admin-first. Admin sees the broadest operational surface and covers needs from director, accountant, site commander, material officer, and viewer roles.
- First implementation area: dashboard and finance. These screens should become the product's professional control-room experience before wider table/workbench standardization.
- Design lens: cross-role situational awareness, fast risk triage, visible money/work/project signals, and direct drill-down into existing modules.

## Current Strengths

- App already moved toward professional ERP shell: dark sidebar, compact topbar, Lucide icons, Vietnamese fonts.
- Data density is appropriate for internal construction operations.
- `nq-*` shell tokens create a reusable visual base.
- Tables and Glide grid support real workflows, not decorative dashboard-only UI.

## Main UX Gaps

- Dashboard lacks executive hierarchy: KPI cards exist, but visual charts and cross-module risk summary are still thin.
- Finance page uses raw SVG charts with limited axes, tooltips, summaries, and accessible chart narrative.
- Table/list pages need a stronger "workbench" pattern: filter chips, saved views, bulk actions, row status language.
- Kanban filters are functional but visually heavy; controls should collapse into a compact query/filter bar.
- Existing palette is coherent, but beige/concrete background can feel flat if every surface has similar weight.

## Recommended Direction

- Keep current construction-control-room tone: graphite, concrete, operational blue, safety orange.
- Do not switch to marketing SaaS style, glassmorphism, oversized cards, or soft pastel dashboards.
- Add chart-first cards only where they answer daily decisions: cash movement, source-of-funds composition, overdue work, debt aging, project progress.
- Standardize page headers: title, one-line context, primary action, secondary actions, filter summary.
- Standardize card hierarchy: KPI strip, analytical panels, work queues.

## Mockups

Open:

`plans/260608-ui-ux-review-mockups/mockups.html`

Mockup screens:

1. Admin executive cockpit dashboard
2. Admin finance analytics with clearer chart composition
3. Data workbench table pattern

## Implementation Plan

### Phase 1 - Admin Dashboard Cockpit

- Status: implemented on 2026-06-08.
- Upgrade `app/(app)/dashboard/page.tsx` and dashboard components into an admin-first cockpit.
- Add cross-module risk blocks: overdue work, pending forms, unread notifications, financial warnings, project/material shortcuts.
- Keep current server-side permission filtering, but show admin-oriented summary when access is broad.
- Use compact chart cards only for decision support, not decorative analytics.

### Phase 2 - Finance Analytics

- Status: implemented on 2026-06-08.
- Rework `app/(app)/tai-chinh/page.tsx` and `components/tai-chinh/cashflow-chart.tsx`.
- Replace raw chart presentation with chart cards that include legend, axis context, summary insight, empty/error states, and export/drill-down actions.
- Added admin-friendly source-of-funds composition from real cash account balances, replacing liquidity-warning language.
- Preserved current data services and extended dashboard aggregation only to expose existing account-balance data.

### Phase 3 - Shared Visual Polish

- Status: implemented on 2026-06-08.
- Extracted repeated finance analytical panel structure into `components/tai-chinh/finance-section-card.tsx`.
- Aligned finance KPI cards, source-of-funds, due-soon panels, and chart colors with `app/globals.css` `nq-*` and chart tokens.
- Verified responsive card headers, visible focus styles on links, and chart color-not-only labels/legends.

## Unresolved Questions

- None for the dashboard/finance priority batch.
