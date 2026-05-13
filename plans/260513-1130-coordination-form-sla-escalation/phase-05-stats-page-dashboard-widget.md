---
phase: 5
title: "Stats page & dashboard widget"
status: pending
priority: P2
effort: "3h"
dependencies: [2]
---

# Phase 5: Stats page & dashboard widget

## Overview

Thống kê các phiếu bị escalate: trang chi tiết `/van-hanh/phieu-phoi-hop/thong-ke-sla` (filter theo TBP/tháng) + widget số đếm trên dashboard `/van-hanh/hieu-suat`.

## Requirements

**Functional:**
- **Stats query function** `getEscalatedForms({ from, to, deptId? })` trả về:
  - List phiếu escalated trong khoảng thời gian
  - Mỗi phiếu kèm: code, creator name, executor dept name, escalatedFromUser name (TBP để quá hạn), escalatedAt, finalStatus (đã được Director duyệt chưa)
  - Group counts theo executor dept

- **Stats page** `/van-hanh/phieu-phoi-hop/thong-ke-sla`:
  - Date range picker (default: tháng hiện tại)
  - Filter department dropdown (executor dept)
  - Table list các phiếu escalated với link sang detail
  - Summary box: tổng số phiếu, breakdown theo TBP

- **Dashboard widget** (trên `/van-hanh/hieu-suat`):
  - Card "Phiếu quá hạn tháng này: N" với click → trang stats prefilled month hiện tại
  - Chỉ visible với role có quyền xem (admin/director)

**Non-functional:**
- Query có index hỗ trợ (`escalatedAt` cần index riêng nếu chưa có)
- Stats page authorization: chỉ admin + director truy cập được

## Architecture

```ts
// lib/coordination-form/sla-stats.ts
import { prisma } from "@/lib/prisma";

export interface EscalatedFormRow {
  id: number;
  code: string;
  creatorName: string;
  executorDeptName: string;
  escalatedFromUserName: string | null;
  escalatedAt: Date;
  finalStatus: string;
  finalActionAt: Date | null;
}

export async function getEscalatedForms(opts: {
  from: Date;
  to: Date;
  executorDeptId?: number;
}): Promise<EscalatedFormRow[]> {
  const where = {
    escalatedAt: { gte: opts.from, lte: opts.to },
    ...(opts.executorDeptId ? { executorDeptId: opts.executorDeptId } : {}),
  };
  const forms = await prisma.coordinationForm.findMany({
    where,
    include: {
      creator: { select: { name: true } },
      executorDept: { select: { name: true } },
      escalatedFromUser: { select: { name: true } },
    },
    orderBy: { escalatedAt: "desc" },
  });
  return forms.map((f) => ({
    id: f.id,
    code: f.code,
    creatorName: f.creator.name,
    executorDeptName: f.executorDept.name,
    escalatedFromUserName: f.escalatedFromUser?.name ?? null,
    escalatedAt: f.escalatedAt!,
    finalStatus: f.status,
    finalActionAt: f.closedAt,
  }));
}

export async function countEscalatedInMonth(year: number, month: number): Promise<number> {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);
  return prisma.coordinationForm.count({
    where: { escalatedAt: { gte: from, lt: to } },
  });
}

export async function groupByExecutorDept(opts: {
  from: Date;
  to: Date;
}): Promise<Array<{ deptId: number; deptName: string; count: number }>> {
  const groups = await prisma.coordinationForm.groupBy({
    by: ["executorDeptId"],
    where: { escalatedAt: { gte: opts.from, lte: opts.to } },
    _count: { _all: true },
  });
  const deptIds = groups.map((g) => g.executorDeptId);
  const depts = await prisma.department.findMany({
    where: { id: { in: deptIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(depts.map((d) => [d.id, d.name]));
  return groups.map((g) => ({
    deptId: g.executorDeptId,
    deptName: nameMap.get(g.executorDeptId) ?? "?",
    count: g._count._all,
  }));
}
```

## Related Code Files

**Create:**
- `lib/coordination-form/sla-stats.ts`
- `app/(app)/van-hanh/phieu-phoi-hop/thong-ke-sla/page.tsx`
- (optional) `components/coordination-form/escalation-stats-widget.tsx` nếu widget có logic phức tạp; nếu không thì inline trong `hieu-suat/page.tsx`

**Modify:**
- `app/(app)/van-hanh/hieu-suat/page.tsx` (thêm widget)
- `prisma/schema.prisma` (CoordinationForm: thêm `@@index([escalatedAt])` nếu query chậm — đo lường trước)

## Implementation Steps

1. **Implement `lib/coordination-form/sla-stats.ts`** với 3 functions ở trên.

2. **Verify Department model có field `name`** (vs `code`) — đọc schema.

3. **Stats page** `app/(app)/van-hanh/phieu-phoi-hop/thong-ke-sla/page.tsx`:
   - Server Component async
   - Auth check: redirect nếu không phải admin/director
   - `searchParams: Promise<{ from?, to?, deptId? }>`
   - Default range: ngày đầu tháng → cuối tháng hiện tại
   - Render:
     - Form filter (date range, dept select)
     - Summary table (groupByExecutorDept)
     - Detail table với link sang form detail
   - Reuse Vietnamese date formatters

4. **Dashboard widget** trong `app/(app)/van-hanh/hieu-suat/page.tsx`:
   - Gọi `countEscalatedInMonth(currentYear, currentMonth)`
   - Render card với count, link tới `/van-hanh/phieu-phoi-hop/thong-ke-sla?from=...&to=...`
   - Visible chỉ khi user là admin hoặc director (check `ctx.isDirector || role === 'admin'`)

5. **Authorization** — Stats page check ở đầu:
   ```ts
   const { userId, role } = await requireSession();
   const ctx = await getUserContext(userId);
   if (role !== "admin" && !ctx?.isDirector) {
     redirect("/van-hanh/phieu-phoi-hop");
   }
   ```

6. **Performance check** — Thêm `@@index([escalatedAt])` nếu query chậm. Có thể skip ban đầu, monitor sau.

7. **Navigation** — KHÔNG thêm sidebar/menu item (per Validation Session 1, Decision #4). Entry point duy nhất là dashboard widget click trên `/van-hanh/hieu-suat`. Lý do: KISS, tránh menu clutter cho stats page tần suất sử dụng thấp.

8. **Verify:** typecheck clean, manual test 3 scenarios:
   - Admin login → thấy widget + truy cập được stats page
   - Director login → tương tự
   - Regular user → widget không hiện, truy cập trực tiếp `/thong-ke-sla` → redirect

## Success Criteria

- [ ] `getEscalatedForms` query trả về data đúng với filter date range và dept
- [ ] Stats page hiển thị filter form hoạt động, table list đúng các phiếu escalated
- [ ] Dashboard widget hiện đúng số đếm tháng hiện tại
- [ ] Click widget → navigate sang stats page với date range prefilled
- [ ] Authorization: regular user không access được stats page
- [ ] `npx tsc --noEmit` clean

## Risk Assessment

- **Risk:** Stats query thiếu index trên `escalatedAt` → slow khi data scale lớn.
  **Mitigation:** Add index `@@index([escalatedAt])` nếu phát hiện slow (> 100ms). Hiện tại data nhỏ, skip premature optimization.

- **Risk:** Widget thêm vào dashboard làm trang chậm (extra query).
  **Mitigation:** `count()` rất nhanh (~5ms), parallel với các query khác qua `Promise.all`.

- **Risk:** Trang stats chỉ accessible qua widget → users không biết tồn tại.
  **Mitigation:** Acceptable per Validation Session 1 — widget hiển thị count nổi bật trên dashboard hiệu suất là context tự nhiên cho admin/director. Sidebar item sẽ clutter menu cho 1 trang ít dùng.

- **Risk:** Department có thể không có field `name` (chỉ có `code`).
  **Mitigation:** Step 2 verify trước; nếu chỉ có `code` thì dùng `code`.
