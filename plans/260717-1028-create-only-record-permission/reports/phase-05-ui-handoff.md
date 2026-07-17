# Phase 5 UI handoff

Implemented server-derived payment capabilities and the permission UI level update.

- Payment list passes server-resolved create capability and per-round edit capability; create-only users cannot see delete controls.
- Payment detail passes separate create-item and edit capabilities. New items remain available to create-only users while existing rows stay read-only.
- User, project, module, and role grant interfaces display `Tạo mới`; admin-only modules are excluded from grant matrices with an explanatory notice.
- Kanban now receives a server-resolved per-department capability map for create/edit/delete/drag controls. The create dialog retains legacy role-based presentation logic and needs the planned Phase 6 sweep.

Validation attempted on 2026-07-17:

- `node_modules/.bin/tsc.cmd --noEmit` reached the checker. Its failures were unrelated active worktree callsites still using the removed `admin` access level; no payment or permission UI type errors were reported.
- `git diff --check` found no whitespace errors (only CRLF warnings).
- A PowerShell-specific parsing issue prevented the scoped ESLint invocation for paths containing `(app)`.
