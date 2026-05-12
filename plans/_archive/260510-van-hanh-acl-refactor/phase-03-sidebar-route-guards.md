---
phase: 3
title: "Sidebar & Route Guards"
status: completed
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 3: Sidebar & Route Guards

## Overview

Convert sidebar to server component that filters items by `canAccess`. Add per-route layout guards using `assertAccess`. Move `/cong-viec` and `/phieu-phoi-hop` under `/van-hanh/` with redirects.

## Requirements

**Functional:**
- Sidebar renders only items where `canAccess(userId, item.moduleKey, { minLevel: "read" })` is true.
- Each protected route segment has layout that calls `assertAccess` on entry.
- Old paths `/cong-viec/*` and `/phieu-phoi-hop/*` 301-redirect to `/van-hanh/cong-viec/*` and `/van-hanh/phieu-phoi-hop/*`.
- Sidebar group "Cộng tác" renamed to "Vận hành".
- New nav item `/van-hanh/hieu-suat` (placeholder page until Plan C — shows "Coming soon").

**Non-functional:**
- Sidebar: server component, no client filter (security in depth).
- Route guards: at layout level, not page-level (cheaper, blocks earlier).
- Redirects: handled by `next.config.ts` redirects array (not middleware) for cacheability.

## Architecture

### Sidebar (`components/layout/app-sidebar.tsx`)

Refactor from client to **server** component:

```tsx
// app-sidebar.tsx (server)
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccess } from "@/lib/acl";
import type { ModuleKey } from "@/lib/acl/modules";
import { AppSidebarClient } from "./app-sidebar-client";

type NavItem = { label: string; href: string; icon: string; moduleKey: ModuleKey };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Tổng quan",
    items: [
      { label: "Bảng điều khiển", href: "/dashboard", icon: "LayoutDashboard", moduleKey: "dashboard" },
      { label: "Dữ liệu nền tảng", href: "/master-data", icon: "Database", moduleKey: "master-data" },
    ],
  },
  // ... du-an, vat-tu-ncc, sl-dt, cong-no-*, tai-chinh
  {
    label: "Vận hành",
    items: [
      { label: "Bảng công việc", href: "/van-hanh/cong-viec", icon: "KanbanSquare", moduleKey: "van-hanh.cong-viec" },
      { label: "Phiếu phối hợp", href: "/van-hanh/phieu-phoi-hop", icon: "ClipboardList", moduleKey: "van-hanh.phieu-phoi-hop" },
      { label: "Hiệu suất", href: "/van-hanh/hieu-suat", icon: "TrendingUp", moduleKey: "van-hanh.hieu-suat" },
      { label: "Thông báo", href: "/thong-bao", icon: "Bell", moduleKey: "thong-bao" },
    ],
  },
  // ... admin
];

export async function AppSidebar() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const userId = session?.user?.id;
  if (!userId) return null;

  const filteredGroups = await Promise.all(
    NAV_GROUPS.map(async (g) => {
      const items = await Promise.all(
        g.items.map(async (i) => (await canAccess(userId, i.moduleKey, { minLevel: "read" })) ? i : null)
      );
      return { label: g.label, items: items.filter((x): x is NavItem => x !== null) };
    })
  );
  const visible = filteredGroups.filter((g) => g.items.length > 0);
  return <AppSidebarClient groups={visible} />;
}
```

`AppSidebarClient` (existing render logic, now takes `groups` prop, resolves icon names to Lucide components via map).

### Route guards

Create `lib/acl/guards.ts`:
```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccess } from "./effective";
import type { ModuleKey, AccessLevel } from "./modules";

export async function requireModuleAccess(
  moduleKey: ModuleKey,
  minLevel: AccessLevel = "read",
  opts?: { deptId?: number; projectId?: number },
) {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const ok = await canAccess(userId, moduleKey, { minLevel, ...opts });
  if (!ok) redirect("/forbidden");
  return { userId, role: session.user.role };
}
```

### Per-route layout examples

```tsx
// app/(app)/du-an/layout.tsx
import { requireModuleAccess } from "@/lib/acl/guards";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("du-an", "read");
  return <>{children}</>;
}

// app/(app)/du-an/[id]/layout.tsx
import { requireModuleAccess } from "@/lib/acl/guards";
export default async function Layout({ params, children }: { params: { id: string }, children: React.ReactNode }) {
  await requireModuleAccess("du-an", "read", { projectId: Number(params.id) });
  return <>{children}</>;
}
```

### Redirects (`next.config.ts`)

```ts
async redirects() {
  return [
    { source: "/cong-viec", destination: "/van-hanh/cong-viec", permanent: true },
    { source: "/cong-viec/:path*", destination: "/van-hanh/cong-viec/:path*", permanent: true },
    { source: "/phieu-phoi-hop", destination: "/van-hanh/phieu-phoi-hop", permanent: true },
    { source: "/phieu-phoi-hop/:path*", destination: "/van-hanh/phieu-phoi-hop/:path*", permanent: true },
  ];
}
```

### Forbidden page

`app/forbidden/page.tsx` — simple "Bạn không có quyền truy cập" với link về dashboard.

## Related Code Files

**Verified existing layouts (modify):**
- `app/(app)/layout.tsx` — root, already does session check; leave as-is.
- `app/(app)/du-an/[id]/layout.tsx` — exists; ADD project-scope guard.
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx` — exists; verify dept-scope passes through.

**Create (do not exist):**
- `lib/acl/guards.ts` — `requireModuleAccess` helper.
- `components/layout/app-sidebar-client.tsx` — extract client render of sidebar.
- `app/forbidden/page.tsx` — friendly forbidden page.
- `app/(app)/van-hanh/layout.tsx` — group container.
- `app/(app)/van-hanh/hieu-suat/page.tsx` — placeholder (Plan C).
- `app/(app)/du-an/layout.tsx` — module-level guard (list page).
- `app/(app)/cong-no-vt/layout.tsx` — guard.
- `app/(app)/cong-no-nc/layout.tsx` — guard.
- `app/(app)/vat-tu-ncc/layout.tsx` — guard.
- `app/(app)/sl-dt/layout.tsx` — admin-only guard.
- `app/(app)/master-data/layout.tsx` — admin-only guard.
- `app/(app)/tai-chinh/layout.tsx` — admin-only guard.
- `app/(app)/dashboard/layout.tsx` — module guard (open).
- `app/(app)/thong-bao/layout.tsx` — module guard (open).
- `app/(app)/admin/import/layout.tsx` — admin-only guard.
- `app/(app)/admin/phong-ban/layout.tsx` — admin-only guard.
- `app/(app)/admin/nguoi-dung/layout.tsx` — admin-only guard.
- `app/(app)/admin/permissions/layout.tsx` — admin-only guard (Phase 4).

**Modify:**
- `components/layout/app-sidebar.tsx` — convert client → server, filter NAV_GROUPS.
- `next.config.ts` — add redirects (`permanent: false` initially).
- Service files with hard-coded URL strings: `lib/task/task-service.ts`, `lib/task/comment-service.ts`, `lib/coordination-form/coordination-form-service.ts`, `lib/notification/notification-service.ts`. Audit any string template containing `/cong-viec` or `/phieu-phoi-hop`.

**Move (preserve git history):**
- `app/(app)/cong-viec/*` → `app/(app)/van-hanh/cong-viec/*`.
- `app/(app)/phieu-phoi-hop/*` → `app/(app)/van-hanh/phieu-phoi-hop/*`.

## Implementation Steps

1. Create `lib/acl/guards.ts` per architecture block. Signature uses tagged scope per Phase 2:
   ```ts
   await requireModuleAccess("du-an", { minLevel: "read", scope: "module" });
   await requireModuleAccess("du-an", { minLevel: "edit", scope: { kind: "project", projectId } });
   ```
2. Create `app/forbidden/page.tsx` with simple message ("Bạn không có quyền truy cập" + link về dashboard).
3. Refactor `components/layout/app-sidebar.tsx`:
   - Convert to async server component.
   - Extract render JSX to new `app-sidebar-client.tsx` (client) — takes `groups` prop, looks up icons via map.
   - Server component filters NAV_GROUPS via `canAccess(..., { minLevel: "read", scope: "module" })`.
4. **Create directory parents first, then `git mv`** (Windows PowerShell + parens require quoting):
   ```powershell
   New-Item -ItemType Directory -Force -Path "app/(app)/van-hanh"
   git mv "app/(app)/cong-viec" "app/(app)/van-hanh/cong-viec"
   git mv "app/(app)/phieu-phoi-hop" "app/(app)/van-hanh/phieu-phoi-hop"
   ```
   Verify with `git status` — should show R (rename) entries, not D+A.
5. Create `app/(app)/van-hanh/layout.tsx` (no guard at group level — each child enforces own moduleKey).
6. Create `app/(app)/van-hanh/hieu-suat/page.tsx` placeholder:
   ```tsx
   export default async function Page() {
     await requireModuleAccess("van-hanh.hieu-suat", { minLevel: "read", scope: { kind: "role", roleScope: "self" } });
     return <div className="p-8 text-muted-foreground">Module Hiệu suất sẽ ra mắt sớm.</div>;
   }
   ```
7. **Create per-route layouts** for each "Create" item in "Related Code Files". Pattern:
   ```tsx
   // app/(app)/cong-no-vt/layout.tsx
   import { requireModuleAccess } from "@/lib/acl/guards";
   export default async function Layout({ children }: { children: React.ReactNode }) {
     await requireModuleAccess("cong-no-vt", { minLevel: "read", scope: "module" });
     return <>{children}</>;
   }
   ```
   For dept-scoped pages, child page-level guard uses `{ scope: { kind: "dept", deptId } }` after reading deptId from data.
   For `app/(app)/du-an/[id]/layout.tsx` (existing), ADD project guard:
   ```tsx
   await requireModuleAccess("du-an", { minLevel: "read", scope: { kind: "project", projectId: Number(params.id) } });
   ```
8. Add redirects to `next.config.ts` with `permanent: false` (307, easier rollback). Order matters — Next.js matches first; put literal `/cong-viec` before `/cong-viec/:path*`:
   ```ts
   async redirects() {
     return [
       { source: "/cong-viec", destination: "/van-hanh/cong-viec", permanent: false },
       { source: "/cong-viec/:path*", destination: "/van-hanh/cong-viec/:path*", permanent: false },
       { source: "/phieu-phoi-hop", destination: "/van-hanh/phieu-phoi-hop", permanent: false },
       { source: "/phieu-phoi-hop/:path*", destination: "/van-hanh/phieu-phoi-hop/:path*", permanent: false },
     ];
   }
   ```
   Flip to `permanent: true` after 1 week stable in prod.
9. **Internal link audit (broader than just .tsx):**
   ```powershell
   # All TS/TSX references
   rg "['\"`(]/cong-viec" --type=ts --type=tsx
   rg "['\"`(]/phieu-phoi-hop" --type=ts --type=tsx
   # Service files with URL string templates
   rg -e "/cong-viec" -e "/phieu-phoi-hop" lib/task lib/coordination-form lib/notification
   # Telegram/email notification templates (if any)
   rg -e "/cong-viec" -e "/phieu-phoi-hop" --type=md --type=html
   ```
   Update every match. Document any DB-stored URLs for Phase 5 backfill.
10. **Sidebar query-count verification.** Add temporary `console.time`/Prisma log dump on dev, render dashboard as: (a) admin (b) canbo_vt (c) viewer. Expected ≤3 Prisma queries to render NAV (user fetch + module map + dept/project map). If higher → fix `cache()` usage in helpers before merging.
11. Test manually: log in as admin → see all nav items; log in as `viewer` → see only Dashboard + Notification; log in as `canbo_vt` → see vat-tu-ncc + cong-no-vt + van-hanh + dashboard + notification.
12. Test redirect: navigate to `/cong-viec` → 307 to `/van-hanh/cong-viec`; same for sub-paths.
13. `npx tsc --noEmit` + `next build` to confirm no broken imports.

## Success Criteria

- [x] Sidebar items match user's `canAccess` resolution (verified for admin, viewer, canbo_vt).
- [x] Direct URL access to forbidden route → redirect to `/forbidden`.
- [x] Old `/cong-viec` URL redirects to `/van-hanh/cong-viec` with 307.
- [x] All internal references updated: `<Link>`, `router.push`, service URL templates, notification message bodies.
- [x] No client-side bundle leak: `viewer` opening devtools cannot find admin nav data.
- [x] Sidebar render uses ≤3 Prisma queries (verified via dev log).
- [x] `git status` shows route moves as RENAME (R), not delete+add.
- [x] `next build` succeeds; `npx tsc --noEmit` passes.

## Risk Assessment

- **Risk:** Notifications table stores task URLs like `/cong-viec/123`. After move, links 404 if redirect not in place.
  **Mitigation:** Redirects in `next.config.ts` cover this. Verify by clicking old notification.
- **Risk:** Server component sidebar fetches per request → +1 round-trip on every page.
  **Mitigation:** `cache()` memoizes; sidebar data piggybacks on existing session check. Net: +1 query, ~5ms.
- **Risk:** Forgetting to add guard to a route → security hole.
  **Mitigation:** Phase 5 includes audit script that grep-checks every `app/(app)/*/layout.tsx` calls `requireModuleAccess`. CI guard.
- **Risk:** `git mv` breaks Windows case-insensitive checkout.
  **Mitigation:** Run on clean working tree; verify with `git status` before commit.
