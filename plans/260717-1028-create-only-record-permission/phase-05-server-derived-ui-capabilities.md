---
phase: 5
title: "Server-derived UI capabilities"
status: completed
priority: P1
effort: 1.5-2d
dependencies: [3, 4]
---

# Phase 5: Server-derived UI capabilities

## Overview

Server Components resolve capabilities from the same ACL/resource scope as writes, then pass booleans/actions to client. UI hides/disables controls; server remains authoritative.

## Requirements

- Props tối thiểu: `canCreate`, `canEdit`, `canDelete`; delete normally equals edit, exact admin raw controls remain `isAdmin` riêng.
- Do not derive capabilities from `role`, `isLeader`, department presence in client. Existing task derivation at `kanban-client.tsx:187,330-342` must be removed.
- Keep comment capability separate where UI supports comments/attachments.
- `thanh-toan.tong-hop` exposes read/export only.

## File/caller inventory

| Surface | Server caller | Client/shared component change |
|---|---|---|
| 7 project detail record pages | `app/(app)/du-an/[id]/*/page.tsx` | seven clients listed in scout report receive capabilities; create/edit/delete buttons/handlers conditional |
| VT/NCC | supplier day/reconciliation pages | `components/vat-tu-ncc/delivery-grid.tsx`, `doi-chieu-client.tsx`; module-scope capability because records have no dept owner |
| Ledgers | four `nhap-lieu`/`so-du-ban-dau` pages | `components/ledger-grid/{transaction-grid,opening-grid}.tsx`; module-scope capability; omit handlers (`data-grid.tsx:165-179`) and set cells readonly |
| Payment | `ke-hoach/page.tsx`, `[id]/page.tsx` | `round-list-client.tsx`, `round-detail-client.tsx`; separate create-item vs edit-item capability |
| Task | `van-hanh/cong-viec/page.tsx` | `kanban-client.tsx`, `task-detail-panel.tsx`, subtask/comment/attachment sections |
| Coordination | list/create/detail server pages | list create CTA, route-level create guard, server-resolved workflow actions |
| Permission admin | admin permission/role/user pages | add create labels/options; remove admin level; hide grant matrix for exact admin-only modules |

## Implementation steps

1. At each server page, call `canAccess`/entitlement using concrete module + resource scope and min create/edit; do not query client role to approximate.
2. Pass serializable capability booleans. For row-specific workflows, return server-resolved action list/capability map, following existing coordination detail pattern (`[id]/page.tsx:39-51`).
3. Update component prop signatures and every caller explicitly; TypeScript compile is caller enumeration gate.
4. Hide create CTA/dialog when `canCreate=false`; omit add handlers. Hide edit/delete, disable inline mutation/paste/reorder when `canEdit=false`.
5. Keep `isAdmin` only for raw override UI and exact admin sections; it must not imply a business access level in types.
6. Permission UIs: label `create = "Tạo mới"`; project/dept selectors include it; module/role grid excludes admin-only module grant controls and explains exact-admin behavior.

## UI test matrix

| Principal | Create CTA | Inline edit/delete | Raw override | Read/export |
|---|---:|---:|---:|---:|
| read/comment | hidden | hidden | hidden | allowed per scope |
| create | shown | hidden | hidden | allowed |
| edit | shown | shown | hidden | allowed |
| literal admin | shown | shown | shown where supported | all |

## Todo

- [ ] Every changed client caller compiles with explicit capability props.
- [ ] DataGrid add/update/delete handlers independently gated.
- [ ] Payment create-only form usable without exposing update/delete.
- [ ] Admin permission grids no longer render `admin` level.
- [ ] Direct action invocation still denied despite hidden UI.

## Success criteria

- Component/E2E tests confirm visibility matrix on desktop and mobile.
- No client-side `role === "admin" || ...` used to infer create/edit/delete; exact raw-admin checks are documented exceptions.

## Risks and security

Stale capability props can produce optimistic UI but cannot authorize writes. Server denial must surface a stable localized error and refresh state; never downgrade guard to match stale UI.

## Next steps

Phase 6 performs repository-wide negative grep, E2E and deploy probes.
