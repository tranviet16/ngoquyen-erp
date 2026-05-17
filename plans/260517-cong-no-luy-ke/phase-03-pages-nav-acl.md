---
phase: 3
title: Pages nav ACL
status: completed
priority: P1
effort: 2h
dependencies:
  - 1
  - 2
---

# Phase 3: Pages nav ACL

## Overview

Wire the rebuilt report into both `/chi-tiet` pages, drop the view selector from the filter,
remove the 2 sidebar entries, rename the parent-page tab, and fold the ACL submodule keys.

## Requirements

- Functional: VT/NC `/chi-tiet` pages render the cumulative report; titles renamed
  "Công nợ lũy kế – Vật tư" / "– Nhân công".
- Functional: `/chi-tiet` no longer a standalone sidebar item; reachable only via parent
  page `navLinks` tab labelled "Công nợ lũy kế".
- Functional: ACL guard on `/chi-tiet` uses parent key (`cong-no-vt` / `cong-no-nc`);
  submodule keys `cong-no-vt.chi-tiet` / `cong-no-nc.chi-tiet` removed from the registry.

## Architecture

Route paths `/cong-no-vt/chi-tiet` and `/cong-no-nc/chi-tiet` stay (avoid breaking bookmarks);
only labels/titles/guards change.

ACL: `lib/acl/modules.ts` (MODULE_KEYS list + scope map + actions map),
`lib/acl/module-labels.ts`, `lib/acl/role-defaults.ts` all reference the 2 submodule keys —
remove every occurrence. Existing `module_grants` rows for those keys become orphaned but
harmless (never read); no migration required.

## Related Code Files

- Modify: `app/(app)/cong-no-vt/chi-tiet/page.tsx` — drop `view`/`validViews`, retitle,
  guard → `cong-no-vt`, drop `view` from service call + `DetailReportFilter` + `DetailReportTable`.
- Modify: `app/(app)/cong-no-nc/chi-tiet/page.tsx` — parallel changes, guard → `cong-no-nc`.
- Modify: `components/ledger/detail-report-filter.tsx` — remove the view selector + `view`
  from `defaultValues`/props.
- Modify: `app/(app)/cong-no-vt/page.tsx` + `app/(app)/cong-no-nc/page.tsx` — `navLinks`
  label "Chi tiết NCC"/"Chi tiết NT" → "Công nợ lũy kế".
- Modify: `components/layout/app-sidebar.tsx` — remove "Công nợ VT — Chi tiết" and
  "Công nợ NC — Chi tiết" nav items.
- Modify: `lib/acl/modules.ts`, `lib/acl/module-labels.ts`, `lib/acl/role-defaults.ts` —
  remove the 2 submodule keys.

## Implementation Steps

1. VT page: remove `view`/`validViews`/`ViewMode` import; retitle; change `requireModuleAccess`
   to `"cong-no-vt"`; drop `view` from the `getMaterialDetailReport` call and both components.
2. NC page: same, with `getLaborDetailReport` and `"cong-no-nc"`.
3. `detail-report-filter.tsx`: delete the view `<select>` and `view` field everywhere.
4. Parent pages: rename the `navLinks` entry to "Công nợ lũy kế".
5. `app-sidebar.tsx`: delete the 2 "Chi tiết" entries.
6. ACL: remove `cong-no-vt.chi-tiet` / `cong-no-nc.chi-tiet` from `modules.ts` (3 spots),
   `module-labels.ts`, `role-defaults.ts`.
7. `npx tsc --noEmit` clean; smoke-test both pages logged in as admin on port 3005.

## Success Criteria

- [ ] Both `/chi-tiet` pages load, retitled, with the 8-column report.
- [ ] No sidebar "Chi tiết" entries; parent page tab reads "Công nợ lũy kế".
- [ ] No `cong-no-vt.chi-tiet` / `cong-no-nc.chi-tiet` references remain in `lib/acl/` or pages.
- [ ] `tsc --noEmit` passes.

## Risk Assessment

- `MODULE_KEYS` may be a typed tuple feeding a union — removing entries could break unrelated
  type references; `tsc` will surface them. Search for `chi-tiet` repo-wide after the edit.
- A user whose only grant was the submodule key loses nothing meaningful — parent `cong-no-vt`
  grant already governs the parent page; verify role-defaults still grant parent access.
