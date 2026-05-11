---
phase: 1
title: Implementation
status: completed
priority: P2
effort: 3-4h
dependencies: []
---

# Phase 1: Implementation

## Overview
Rewrite `/dashboard` thành Server Component fetch parallel 4 nguồn (task, form, notification, module access), hiển thị 4 KPI thin row + 3 list card (top 5 mỗi list) + empty fallback quick-nav.

## Requirements
- Functional:
  - 4 KPI: số task chờ, task quá hạn, phiếu chờ duyệt, thông báo chưa đọc
  - 3 list section (top 5): Task quá hạn / Phiếu chờ duyệt / Task sắp đến deadline (≤7 ngày)
  - Mỗi card rỗng: empty state nội tuyến + link sang module
  - Cả 3 list rỗng → ẩn list, hiển thị quick-nav grid 6 shortcut user có quyền
  - Mỗi list có link "Xem tất cả →" sang trang module
- Non-functional:
  - Server Component, `Promise.all` 4 query parallel
  - Page load ≤ 800ms env dev
  - `npx tsc --noEmit` clean
  - ACL: dùng service hiện có, không bypass guard

## Architecture

### Data flow
```
Server Component page.tsx
  ↓ Promise.all([
      listTasksForBoard({ assigneeId: me }),         // flatten + filter
      listForms({ status: "submitted" }),             // top 5
      countMyUnread(),                                 // số
      Promise.all(MODULE_SHORTCUTS.map(canAccess))    // 6 checks
    ])
  ↓ derive
      tasksAll = [...byStatus.todo, ...byStatus.doing, ...byStatus.review]  // bỏ done
      overdueTasks = filter(deadline < now).slice(0,5)
      upcomingTasks = filter(deadline ∈ [now, now+7d]).slice(0,5)
      pendingForms = forms.items.slice(0,5)
      allEmpty = overdueTasks=0 && upcomingTasks=0 && pendingForms=0
  ↓ render: KpiRow + (allEmpty ? EmptyFallback : 3 ListCards)
```

### Layout
```
Hello {name}                              {today}
[4 KPI: Task chờ │ Quá hạn │ Phiếu chờ duyệt │ Thông báo]

┌─ Task quá hạn ────────┐  ┌─ Phiếu chờ duyệt ───┐
│ ...top 5...            │  │ ...top 5...           │
│ [Xem tất cả →]         │  │ [Xem tất cả →]        │
└────────────────────────┘  └───────────────────────┘
┌─ Task sắp deadline ────────────────────┐
│ ...top 5...                              │
│ [Xem tất cả →]                           │
└──────────────────────────────────────────┘

Hoặc (allEmpty):
[QuickNavGrid 6 shortcut: Dự án | Vật tư | Sản lượng | Công việc | Phiếu | Thông báo]
```

### Components
- `page.tsx` — Server Component, fetch + orchestration
- `_components/kpi-card.tsx` — `{ label, value, accent?: "danger" }`
- `_components/task-list-card.tsx` — `{ title, tasks, emptyText, viewAllHref, mode: "overdue"|"upcoming" }`
- `_components/form-list-card.tsx` — `{ forms, viewAllHref }`
- `_components/empty-fallback.tsx` — `{ accessibleModules: { key, label, href, icon }[] }`

### Module shortcuts
```ts
const MODULE_SHORTCUTS = [
  { key: "du-an" as const, label: "Dự án", href: "/du-an", icon: "Building2" },
  { key: "vat-tu-ncc" as const, label: "Vật tư", href: "/vat-tu-ncc", icon: "Package" },
  { key: "sl-dt" as const, label: "Sản lượng", href: "/sl-dt", icon: "TrendingUp" },
  { key: "van-hanh.cong-viec" as const, label: "Công việc", href: "/van-hanh/cong-viec", icon: "KanbanSquare" },
  { key: "van-hanh.phieu-phoi-hop" as const, label: "Phiếu phối hợp", href: "/van-hanh/phieu-phoi-hop", icon: "ClipboardList" },
  { key: "thong-bao" as const, label: "Thông báo", href: "/thong-bao", icon: "Bell" },
];
```

## Related Code Files
- **Create:**
  - `app/(app)/dashboard/_components/kpi-card.tsx`
  - `app/(app)/dashboard/_components/task-list-card.tsx`
  - `app/(app)/dashboard/_components/form-list-card.tsx`
  - `app/(app)/dashboard/_components/empty-fallback.tsx`
- **Modify (rewrite):**
  - `app/(app)/dashboard/page.tsx`

## Implementation Steps
1. Tạo 4 component trong `app/(app)/dashboard/_components/`:
   - `kpi-card.tsx` — label trên, value lớn dưới; `accent="danger"` tô đỏ value
   - `task-list-card.tsx` — title + list row (link detail task), empty state nội tuyến, link "Xem tất cả →" footer; `mode="overdue"` hiển thị "Quá X ngày" (đỏ), `mode="upcoming"` hiển thị "Còn Y ngày"
   - `form-list-card.tsx` — tương tự, link sang `/van-hanh/phieu-phoi-hop/<id>`, hiển thị code + content snippet + creator name
   - `empty-fallback.tsx` — Grid 6 shortcut, lucide-react icon dynamic, link sang module
2. Rewrite `app/(app)/dashboard/page.tsx`:
   - `auth.api.getSession({ headers: await headers() })` → redirect `/login` nếu chưa session
   - `Promise.all` 4 query như Data flow
   - Derive overdue/upcoming/pending/allEmpty
   - Compute `accessibleModules` filter `MODULE_SHORTCUTS` theo `canAccess` results
   - Render: header (hello + today) → KPI row (4 cards grid) → (allEmpty ? `<EmptyFallback>` : 3 ListCard grid 2 cols)
3. `npx tsc --noEmit` — verify clean
4. Manual QA 2 account:
   - **Admin (có data):** KPI số đúng, list overdue/upcoming có task, list form chờ duyệt
   - **Viewer mới (rỗng):** 4 KPI = 0, không có list, EmptyFallback grid hiển thị shortcut user có quyền

## Success Criteria
- [ ] 4 component mới tồn tại + render đúng prop
- [ ] `page.tsx` Promise.all 4 query parallel (không tuần tự)
- [ ] KPI hiển thị 4 số chính xác
- [ ] Overdue list highlight đỏ, upcoming hiển thị "Còn N ngày"
- [ ] Phiếu chờ duyệt hiển thị code + content snippet + creator
- [ ] Empty fallback chỉ hiện khi cả 3 list = 0
- [ ] Quick-nav grid chỉ hiện shortcut user có quyền
- [ ] `npx tsc --noEmit` clean
- [ ] Manual QA 2 account pass

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| `listTasksForBoard` trả nhiều task → flatten chậm | Service đã filter dept access; admin nhiều → chấp nhận MVP, đo sau |
| `listForms({status:"submitted"})` không hẳn "tôi cần duyệt" | Document: MVP dùng proxy "form chờ duyệt trong tầm phụ trách". Hậu MVP thêm approver filter |
| `canAccess` 6 lần parallel | Mỗi call cheap (role/dept axis check); chấp nhận |
| `TaskWithRelations` shape lạ | Đọc type từ task-service.ts trước khi viết task-list-card.tsx |
| Date arithmetic timezone | `new Date()` server-side, hiển thị string đơn giản; không cần intl phức tạp |
