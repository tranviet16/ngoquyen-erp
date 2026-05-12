# Brainstorm — Dashboard "My work" MVP

**Date:** 2026-05-11
**Status:** Approved

## Problem
`app/(app)/dashboard/page.tsx` hiện tại = static placeholder (3 cards decoration, không link, không số). User mở dashboard không lấy được giá trị nào → "không có tác dụng gì".

## Goal
Biến dashboard thành landing page hữu ích: user vào thấy ngay **việc của mình** cần xử lý hôm nay (task, phiếu phối hợp, thông báo).

## Approaches considered
| # | Approach | Verdict |
|---|----------|---------|
| 1 | **My work** (task + form + notif của user) | ✅ Chọn — coverage 80% user hàng ngày |
| 2 | KPI overview tổng | ❌ Chỉ phục vụ giám đốc, scope rộng, cần thêm aggregation queries |
| 3 | Recent activity feed cross-module | ❌ Phức tạp, cần audit query tổng hợp, noise cao |
| 4 | Quick nav tiles | ❌ Quá nghèo nàn, không giải quyết "không có tác dụng" |

## Final design

### Layout (Server Component, 1 page)
```
Hello {name}                              {today}

[4 KPI thin row]
 Task chờ │ Task quá hạn │ Phiếu chờ duyệt │ Thông báo
   12     │     3 🔴      │       2         │    5

┌─ Task quá hạn (top 5) ───┐  ┌─ Phiếu chờ duyệt (top 5) ┐
│ • Task A   2 ngày trễ    │  │ • PPH-001 ...             │
│ ...                       │  │ ...                        │
│ [Xem tất cả →]           │  │ [Xem tất cả →]            │
└──────────────────────────┘  └────────────────────────────┘

┌─ Task sắp đến deadline (top 5, ≤ 7 ngày) ─┐
│ • Task C   còn 1 ngày                       │
│ [Xem tất cả →]                              │
└─────────────────────────────────────────────┘

[Empty fallback khi cả 3 list rỗng: quick-nav grid module có quyền]
```

### Data sources (reuse, KHÔNG tạo service mới)
| Section | Service | Filter |
|---|---|---|
| Task của tôi | `listTasksForBoard` (lib/task) | assignee=me, status ∈ pending/in-progress |
| Task quá hạn | filter từ trên | `dueDate < now && status != done` |
| Task sắp tới | filter từ trên | `dueDate ∈ [now, now+7d]` |
| Phiếu chờ duyệt | `listForms` (lib/coordination-form) | approver=me, status ∈ submitted/leader_approved |
| Thông báo chưa đọc | `countMyUnread` (lib/notification) | - |

Tất cả service hiện có đã filter ACL/dept → không cần guard riêng.

### Fetch pattern
Server Component dùng `Promise.all` parallel 4 queries. Top 5 mỗi list, sort theo dueDate/submittedAt.

### Empty state strategy
- **Mỗi card rỗng** → empty state riêng nội tuyến (icon + 1 dòng + link sang module)
- **Cả 3 list rỗng** (user mới hoặc viewer chưa dữ liệu) → ẩn 3 list, hiển thị quick-nav grid module user có quyền (dùng `getEffectiveModules(userId)` từ `lib/acl/effective.ts`)

### ACL
- Page guard: chỉ require session (module `dashboard` axis = `open`)
- Service đã filter theo user → không leak dữ liệu user khác

## Out of scope (MVP)
- Charts/graphs
- Auto-refresh (polling/SSE)
- Role-based layout variants
- Recent activity feed cross-module
- Configurable widgets
- Quick action buttons (create task from dashboard)
- KPI tài chính (tổng công nợ, doanh thu)

## Files affected
| Action | File |
|--------|------|
| Modify (rewrite) | `app/(app)/dashboard/page.tsx` |
| Create | `app/(app)/dashboard/_components/kpi-card.tsx` |
| Create | `app/(app)/dashboard/_components/task-list-card.tsx` |
| Create | `app/(app)/dashboard/_components/form-list-card.tsx` |
| Create | `app/(app)/dashboard/_components/empty-fallback.tsx` |
| Possibly modify | `lib/task/task-service.ts` (thêm helper `listMyDashboardTasks` nếu `listTasksForBoard` không khớp signature) |

## Risks
| Risk | Mitigation |
|------|-----------|
| `listTasksForBoard` signature không hợp dashboard | Đọc + đánh giá; nếu cần wrap qua helper mới ngắn gọn |
| 4 query parallel làm trang chậm | Đo trước; nếu > 500ms thì cache hoặc giảm scope |
| Viewer mới không có dữ liệu → trông như lỗi | Empty fallback grid quick-nav giải quyết |
| Service trả về task của user khác do bug ACL | Test với 2 account khác nhau |

## Success criteria
- [ ] User assigned task thấy danh sách task của mình trong dashboard
- [ ] User có phiếu chờ duyệt thấy list phiếu
- [ ] User mới tinh thấy quick-nav grid không thấy lỗi
- [ ] Page load ≤ 800ms ở env dev
- [ ] `npx tsc --noEmit` clean
- [ ] ACL: account A không thấy task của account B

## Effort
~3-4h, 1 phase.
