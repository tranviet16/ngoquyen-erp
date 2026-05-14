# Phase 2 — ACL submodules + sidebar nav

## Context Links

- ACL config: `lib/acl/modules.ts:1-85`, `lib/acl/module-labels.ts:1-34`, `lib/acl/role-defaults.ts:26-36`
- Sidebar: `components/layout/app-sidebar.tsx:10-54`
- Breadcrumb (no edit needed): `components/layout/breadcrumb.tsx:52` already has `"chi-tiet": "Chi tiết"`
- Precedent submodule keys: `thanh-toan.ke-hoach`, `thanh-toan.tong-hop` — copy the exact same pattern

## Overview

- **Priority**: P1
- **Status**: completed
- **Effort**: 1.5h
- **Owner files**: `lib/acl/modules.ts`, `lib/acl/module-labels.ts`, `lib/acl/role-defaults.ts`, `components/layout/app-sidebar.tsx`

Add 2 new module keys (`cong-no-vt.chi-tiet`, `cong-no-nc.chi-tiet`) to ACL config and wire sidebar nav. Mirrors the existing `thanh-toan.*` submodule pattern.

## Key Insights

- ACL "4-file ritual" is established: `modules.ts` (key + axis + levels), `module-labels.ts` (VN label), `role-defaults.ts` (canbo_vt fallback), `app-sidebar.tsx` (nav item).
- Breadcrumb labels already present — no edit needed.
- Parent module `cong-no-vt` has axis `dept` and levels `[read, comment, edit]` (`modules.ts:44,75`). Submodules inherit the same.
- `CANBO_VT_EDIT_MODULES` set (`role-defaults.ts:26-36`) currently lists `cong-no-vt` but NOT `cong-no-vt.chi-tiet`. Without explicit add, canbo_vt would lose default access on the submodule even while having it on parent — breaks UX.
- Layout guard at `app/(app)/cong-no-vt/layout.tsx:4` checks parent module only — page-level guard for submodule must be added in P3/P4 (`requireModuleAccess("cong-no-vt.chi-tiet", { minLevel: "read", scope: "module" })`).

## Requirements

### Functional

- Add `cong-no-vt.chi-tiet` and `cong-no-nc.chi-tiet` to `MODULE_KEYS`.
- Set axis `dept` in `MODULE_AXIS` for both.
- Set levels `["read", "comment", "edit"]` in `MODULE_LEVELS` for both.
- Set VN labels in `MODULE_LABELS`: `"Công nợ vật tư – Chi tiết"`, `"Công nợ nhân công – Chi tiết"`.
- Add both keys to `CANBO_VT_EDIT_MODULES` so canbo_vt role retains edit access by default.
- Add 2 nav items under "Tài chính & Công nợ" group in `app-sidebar.tsx` (or as nested under existing entries — see decision below).

### Non-functional

- `canAccess(unknownKey)` must continue returning false gracefully (already handled — verify by not adding keys to unrelated maps).
- Admin permissions UI (`/admin/permissions`) auto-discovers the keys via `MODULE_KEYS` — no separate edit.

## Architecture

### Nav placement decision

Current sidebar (`app-sidebar.tsx:27-35`) keeps `cong-no-vt`, `cong-no-nc` as top-level rows. Adding `.chi-tiet` as a 4th sibling under "Tài chính & Công nợ" breaks the visual grouping with parent. Choice:

- **Option A** (chosen): Add as additional rows immediately after parent: `Công nợ VT — Chi tiết`, `Công nợ NC — Chi tiết`. Simple, matches `thanh-toan.ke-hoach` / `thanh-toan.tong-hop` precedent.
- **Option B** (rejected): Introduce nested children — `AppSidebarClient` doesn't support nesting today; would require client component refactor. YAGNI.

## Related Code Files

**Modify:**
- `lib/acl/modules.ts` — 3 maps (KEYS, AXIS, LEVELS)
- `lib/acl/module-labels.ts` — MODULE_LABELS
- `lib/acl/role-defaults.ts` — CANBO_VT_EDIT_MODULES
- `components/layout/app-sidebar.tsx` — NAV_GROUPS

**Create:** none.

**Delete:** none.

## Implementation Steps

1. `lib/acl/modules.ts`:
   - Append `"cong-no-vt.chi-tiet"`, `"cong-no-nc.chi-tiet"` to `MODULE_KEYS` array (after the parent entries).
   - Add entries to `MODULE_AXIS`: both `"dept"`.
   - Add entries to `MODULE_LEVELS`: both `["read", "comment", "edit"]`.
2. `lib/acl/module-labels.ts`:
   - Add to `MODULE_LABELS`: `"cong-no-vt.chi-tiet": "Công nợ vật tư – Chi tiết"`, `"cong-no-nc.chi-tiet": "Công nợ nhân công – Chi tiết"`.
3. `lib/acl/role-defaults.ts`:
   - Append both keys to `CANBO_VT_EDIT_MODULES` Set.
4. `components/layout/app-sidebar.tsx`:
   - In NAV_GROUPS → "Tài chính & Công nợ" group → items array, insert after `cong-no-vt` row: `{ label: "Công nợ VT — Chi tiết", href: "/cong-no-vt/chi-tiet", icon: "FileText", moduleKey: "cong-no-vt.chi-tiet" }`.
   - Insert after `cong-no-nc` row: `{ label: "Công nợ NC — Chi tiết", href: "/cong-no-nc/chi-tiet", icon: "FileText", moduleKey: "cong-no-nc.chi-tiet" }`.
   - Verify `FileText` icon is available in the client component icon map; fall back to `Receipt` if not.
5. Compile + smoke test:
   - `pnpm tsc --noEmit` — `MODULE_KEYS` is a `const tuple`, so TS will fail-fast on missing entries in `MODULE_AXIS`/`MODULE_LEVELS`/`MODULE_LABELS`/breadcrumb labels if any.
   - Login as canbo_vt → confirm "Chi tiết" links appear in sidebar.
   - Login as viewer → confirm "Chi tiết" links hidden.

## Todo List

- [ ] Add 2 keys to `MODULE_KEYS`
- [ ] Add 2 entries to `MODULE_AXIS` (`dept`)
- [ ] Add 2 entries to `MODULE_LEVELS` (`[read, comment, edit]`)
- [ ] Add 2 entries to `MODULE_LABELS` (VN)
- [ ] Append 2 entries to `CANBO_VT_EDIT_MODULES`
- [ ] Add 2 nav items in `app-sidebar.tsx`
- [ ] Verify icon name exists in client sidebar icon map
- [ ] `pnpm tsc --noEmit` — green
- [ ] Manual smoke: 3 roles (admin/canbo_vt/viewer) login + sidebar visibility check

## Success Criteria

- TS compile passes (exhaustiveness check enforces all 4 maps include the new keys).
- `/admin/permissions` grid lists the 2 new submodule rows with VN labels.
- canbo_vt role sees both "Chi tiết" links by default; viewer does not.
- Breadcrumb on `/cong-no-vt/chi-tiet` reads `Công nợ vật tư > Chi tiết` (breadcrumb labels already present).
- No regression on parent `cong-no-vt` / `cong-no-nc` access.

## Risk Assessment

| Risk | L | I | Mitigation |
|------|---|---|------------|
| TS exhaustiveness gaps (missed map) | Med | Low | `Record<ModuleKey, ...>` types catch this at compile; trust the type system |
| Icon name `FileText` not registered in `AppSidebarClient` | Low | Low | Grep client component icon map before commit; fall back to `Receipt` |
| Sidebar order surprises users | Low | Low | Place immediately after parent — same precedent as thanh-toan |
| canbo_vt loses access if `CANBO_VT_EDIT_MODULES` edit missed | Med | Med | Explicitly enumerated in todo list; manual smoke test step covers it |

## Security Considerations

- ACL config is the only authority — no separate endpoint exposure. New keys default-deny for unrecognized roles.
- Page-level guard (added in P3/P4) prevents direct URL access by users with parent-only access.

## Next Steps

- P3 and P4 use `requireModuleAccess("cong-no-vt.chi-tiet", ...)` / `("cong-no-nc.chi-tiet", ...)` at the page top.
