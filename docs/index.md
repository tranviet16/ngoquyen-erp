# Documentation Index

Welcome to the ngoquyyen-erp documentation. This directory contains comprehensive guides for understanding, developing, and maintaining the system.

## Start Here

**New to the project?** Start with [`codebase-summary.md`](./codebase-summary.md) for a high-level overview of the directory structure, core systems, and key concepts.

## Core Documentation

### Architecture & Design
- **[`system-architecture.md`](./system-architecture.md)** — Deep dive into the 2-axis ACL model (Module + Resource scopes), data models, and admin UI. Describes how access control is enforced across the system.

### Development & Implementation
- **[`code-standards.md`](./code-standards.md)** — Code patterns, conventions, and best practices for working with the codebase. Essential reference for implementing new routes and permission checks.

### Project Status & Planning
- **[`development-roadmap.md`](./development-roadmap.md)** — Project phases, milestones, and timeline. Tracks current progress and upcoming features (Plans B & C unblocked as of 2026-05-10).

- **[`project-changelog.md`](./project-changelog.md)** — Complete history of all significant changes, features, and fixes. Plan A (Vận hành ACL Refactor) delivery documented with implementation notes and decisions.

### Codebase Overview
- **[`codebase-summary.md`](./codebase-summary.md)** — Directory structure, core systems, data models, testing status, and quick references for common tasks.

---

## By Use Case

### "I need to add a new route with access control"
→ Read [`code-standards.md`](./code-standards.md) — **Route Guards & Access Control** section

### "I need to understand the ACL model"
→ Read [`system-architecture.md`](./system-architecture.md) — **Access Control Architecture** section

### "I need to grant module or project permissions to a user"
→ Read [`system-architecture.md`](./system-architecture.md) — **Admin UI** section (or use `/admin/permissions/modules` and `/admin/permissions/projects`)

### "I need to check what changed in the latest release"
→ Read [`project-changelog.md`](./project-changelog.md) — **[2026-05-10] Plan A** section

### "I need to understand where code lives"
→ Read [`codebase-summary.md`](./codebase-summary.md) — **Directory Structure** section

### "What's the project timeline and what's coming next?"
→ Read [`development-roadmap.md`](./development-roadmap.md) — **Parallel Execution Plan** section

---

## Key Concepts Quick Reference

### Access Control (2-Axis Model)

**Axis 1 — Module Access:**  
Determines if a user can see a module on the sidebar and access routes within it. Enforced via `ModulePermission(userId, moduleKey, level)` or falls back to `AppRole` defaults.

**Axis 2 — Resource Access:**  
Per-module dispatch rules. Example:
- `du-an` module → Use `ProjectPermission` + `ProjectGrantAll` (project-scoped)
- `cong-viec` module → Use `UserDeptAccess` (dept-scoped)
- `hieu-suat` module → Use role-based checks (AppRole + flags)

**Admin Short-Circuit (D1):**  
Users with `role = "admin"` bypass all ACL checks automatically.

### Vận hành Module Structure

The **Vận hành (Operations)** module reorganizes task and coordination management under a unified route structure:

```
/van-hanh
  /cong-viec           ← Tasks (moved from /cong-viec)
  /phieu-phoi-hop      ← Coordination Forms (moved from /phieu-phoi-hop)
  /hieu-suat           ← Performance Dashboard (placeholder; Plan C)
```

Old routes issue 307 redirects during cutover, later upgraded to 308 (permanent).

### Route Guards Pattern

All routes protected via `requireModuleAccess(moduleKey, opts)` in layout.tsx:

```typescript
await requireModuleAccess("van-hanh.cong-viec", { scope: "module" });
```

The `opts` parameter requires explicit scope (no defaults):
- `{ scope: "module" }` — Module-level check only
- `{ kind: "dept", deptId }` — Dept-scoped resource
- `{ kind: "project", projectId }` — Project-scoped resource

---

## Recent Changes (2026-05-10)

**Plan A — Vận hành Module + ACL Refactor delivered:**

✅ New 2-axis access control system with `ModulePermission`, `ProjectPermission`, `ProjectGrantAll` models  
✅ Route guard `requireModuleAccess` protecting all 28 segments  
✅ New Vận hành module with `/van-hanh/*` route hierarchy  
✅ Admin UI for module and project permission grants  
✅ 40/40 ACL resolver tests + 32/32 golden fixtures PASS  
✅ Plan B (Task Swimlane) and Plan C (Performance MVP) unblocked for parallel execution  

📖 See [`project-changelog.md`](./project-changelog.md) for complete delivery notes and implementation decisions.

---

## File Organization

| File | Lines | Purpose |
|------|-------|---------|
| `system-architecture.md` | 176 | ACL model, data models, dependencies |
| `code-standards.md` | 306 | Route guards, module keys, best practices |
| `codebase-summary.md` | 417 | Directory structure, core systems, quick refs |
| `development-roadmap.md` | 261 | Phases, timeline, risk register |
| `project-changelog.md` | 180 | Change history + Plan A delivery details |
| **Total** | **1,340** | **Comprehensive project documentation** |

---

## Building & Deployment

**Before pushing to production:**

1. Read [`code-standards.md`](./code-standards.md) → **Build & Validation** section
2. Verify: `npx tsc --noEmit` passes (type safety)
3. Verify: `next build` completes successfully
4. Verify: All tests pass (`npm run test`)
5. For route changes: Test 307 redirects in staging before prod

**Migration Notes:**

- Run `prisma migrate deploy` to apply new ModulePermission/ProjectPermission models
- Run seed script (Phase 5) to populate default ModulePermission rows per AppRole
- Audit DB for hard-coded URLs in task/coordination form columns; backfill if needed

---

## Getting Help

- **"What's the 2-axis ACL model?"** → [`system-architecture.md`](./system-architecture.md)
- **"How do I add a route?"** → [`code-standards.md`](./code-standards.md) → Route Guards section
- **"What modules exist?"** → [`codebase-summary.md`](./codebase-summary.md) → Core Systems
- **"Where's the code for X?"** → [`codebase-summary.md`](./codebase-summary.md) → Directory Structure
- **"What's the timeline?"** → [`development-roadmap.md`](./development-roadmap.md)
- **"What changed in version X?"** → [`project-changelog.md`](./project-changelog.md)

---

**Last Updated:** 2026-05-10  
**Status:** Documentation reflects codebase state as of Plan A completion (ACL refactor)  
**Next Major Update:** Post-Plan B/C completion (expected 2026-05-31)
