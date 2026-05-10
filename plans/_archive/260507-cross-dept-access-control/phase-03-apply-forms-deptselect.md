---
phase: 3
title: Apply Forms & DeptSelect
status: completed
priority: P2
effort: 3h
dependencies:
  - 1
---

# Phase 3: Apply Forms & DeptSelect

## Overview

Áp dept-access vào module Phiếu phối hợp (list filter) và tạo component dùng chung `<DeptSelect>` chỉ render phòng user có quyền xem. Refactor mọi dropdown phòng trong app dùng component này.

## Requirements

- Functional:
  - `/phieu-phoi-hop` list: chỉ show phiếu mà `creatorDeptId IN viewable` HOẶC `executorDeptId IN viewable` (HOẶC `creatorId === currentUser`)
  - `<DeptSelect>` server-component: fetch viewable deptIds → render dropdown
  - Mọi dropdown chọn phòng (filter, form input) dùng `<DeptSelect>` để consistent
- Non-functional: cache viewable list ở route level (avoid re-fetch trong cùng render)

## Architecture

```
components/dept-select.tsx (Server Component wrapper)
└─ fetch viewable list → render <DeptSelectClient> (client, controlled)
```

Phiếu phối hợp filter:
```ts
const where: Prisma.CoordinationFormWhereInput = {};
if (accessMap.scope === "scoped") {
  const ids = Array.from(accessMap.grants.keys());
  where.OR = [
    { creatorDeptId: { in: ids } },
    { executorDeptId: { in: ids } },
    { creatorId: ctx.userId },
  ];
}
```

## Related Code Files

- Create: `components/dept-select.tsx` + `dept-select-client.tsx`
- Modify: `lib/coordination-form/coordination-form-service.ts` (filter list)
- Modify: `app/(app)/phieu-phoi-hop/page.tsx` (truyền viewable + filter)
- Modify: `app/(app)/phieu-phoi-hop/list-client.tsx` (dùng DeptSelect cho filter dropdown nếu có)
- Modify: `app/(app)/phieu-phoi-hop/tao-moi/create-form-client.tsx` (executor dept select dùng DeptSelect — NHƯNG executor có thể là phòng KHÔNG viewable: cần consider — xem Risk)
- Modify: `app/(app)/cong-viec/kanban-client.tsx` (filter dept dropdown dùng DeptSelect)
- Modify: `app/(app)/admin/phong-ban/page.tsx` (admin always sees all → không cần thay đổi, nhưng standardize component)

## Implementation Steps

1. Tạo `components/dept-select.tsx`:
   ```tsx
   export async function DeptSelect({ name, value, onChange, includeAll }: Props) {
     const session = await auth();
     const ids = await listViewableDeptIds(session.user.id);
     const depts = ids === "all"
       ? await prisma.department.findMany({ where: { isActive: true } })
       : await prisma.department.findMany({ where: { id: { in: ids }, isActive: true } });
     return <DeptSelectClient depts={depts} {...rest} />;
   }
   ```
2. Tạo `dept-select-client.tsx` — controlled `<select>` với option "Tất cả" optional
3. Update `coordination-form-service.listForms` filter theo accessMap
4. Update `app/(app)/phieu-phoi-hop/page.tsx` truyền xuống list
5. Replace dept dropdown trong `kanban-client.tsx` bằng `<DeptSelect>`
6. **Tạo phiếu phối hợp**: executor dept dropdown — user phải gửi sang phòng nào? Quyết định:
   - Cho phép chọn TẤT CẢ phòng active (vì gửi phiếu là yêu cầu công việc, không phải xem dữ liệu)
   - Dùng prop `<DeptSelect mode="all-active">` để bypass viewable filter trong trường hợp này
7. Manual test: login non-admin user → phiếu phối hợp list chỉ show phiếu liên quan; tạo phiếu mới → executor dropdown vẫn show all phòng

## Success Criteria

- [ ] User chỉ thấy phiếu liên quan đến phòng viewable
- [ ] DeptSelect chỉ render viewable phòng (mặc định)
- [ ] Tạo phiếu phối hợp vẫn chọn được mọi phòng active (executor)
- [ ] Type check pass

## Risk Assessment

- Bypass filter trong tạo phiếu: cần tài liệu rõ trong component prop để tránh nhầm lẫn (`mode="all-active"`)
- Coordination form service có 5+ functions cần audit — chỉ apply filter ở `listForms` (read), `getFormById` (gate ≥ "read" trên creator/executor dept), KHÔNG đụng `submit/approve/reject` (giữ rule approver hiện tại)
