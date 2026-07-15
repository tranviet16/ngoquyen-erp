---
title: "Professional construction ERP interface"
status: completed
priority: P1
created: 2026-05-28
---

# Professional construction ERP interface

## Goal

Rework the core ERP first screen into a professional construction-operations cockpit.

## Scope

- App shell visual system: global tokens, sidebar, topbar, content spacing.
- Dashboard page: construction-focused hierarchy, KPI cards, operations summary, shortcut rail.
- Keep current data fetching and permissions unchanged.

## Design Direction

- Style: Swiss/minimal operations dashboard.
- Industry tone: construction project control room, not marketing landing page.
- Palette: concrete/off-white base, graphite text, safety orange accent, blue operational primary.
- Density: medium-high, built for repeated daily use.

## Files

- `app/globals.css`
- `app/(app)/layout.tsx`
- `components/layout/app-sidebar-client.tsx`
- `components/layout/topbar.tsx`
- `app/(app)/dashboard/page.tsx`
- `app/(app)/dashboard/_components/*.tsx`

## Success Criteria

- Dashboard immediately communicates construction ERP: projects, materials, cash, work approvals.
- No decorative card nesting or marketing hero.
- Responsive layout works on mobile and desktop.
- `npm run lint`, `tsc --noEmit`, unit tests, and build pass.
