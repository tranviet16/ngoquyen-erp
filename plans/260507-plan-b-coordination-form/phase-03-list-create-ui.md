---
phase: 3
title: "List + Create UI"
status: pending
priority: P1
effort: "2-3h"
dependencies: [2]
---

# Phase 3: List + Create UI

## Overview
Build `/phieu-phoi-hop` (list page) và `/phieu-phoi-hop/tao-moi` (create draft form). List có filter theo status/scope (mine/all-visible). Create form có dept selector, content textarea, priority radio, deadline picker.

## Requirements

- Functional: list paginated 20/page, filter status + scope; create form validate Zod client + server
- Non-functional: SSR list (Next.js 16 RSC); client form dùng `useTransition` + `sonner` toast pattern (giống `department-client.tsx`)

## Architecture

Pattern (kế thừa từ `app/(app)/admin/phong-ban/`):
- `page.tsx` (Server) — fetch session, fetch data, redirect nếu chưa login
- `*-client.tsx` (Client) — interactive table/form, `useTransition` for mutations
- `actions.ts` (Server Actions) — wrap service functions, `revalidatePath` sau mutation

Server-side filtering: `?status=pending_leader&scope=mine&page=2` → service `listForms({status, mine: true, page: 2})`.

## Related Code Files

- Create: `app/(app)/phieu-phoi-hop/page.tsx` (list, ~80 lines)
- Create: `app/(app)/phieu-phoi-hop/list-client.tsx` (~150 lines)
- Create: `app/(app)/phieu-phoi-hop/actions.ts` (server actions, ~80 lines)
- Create: `app/(app)/phieu-phoi-hop/tao-moi/page.tsx` (~30 lines)
- Create: `app/(app)/phieu-phoi-hop/tao-moi/create-form-client.tsx` (~150 lines)
- Modify: `components/layout/app-sidebar.tsx` (add nav link)

## List page (`page.tsx`)

```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { listForms } from "@/lib/coordination-form/coordination-form-service";
import { listDepartments } from "@/lib/department-service";
import { ListClient } from "./list-client";

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; scope?: string; page?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const data = await listForms({
    status: sp.status as any,
    mine: sp.scope === "mine",
    page,
  });
  const depts = await listDepartments();
  return <ListClient data={data} departments={depts} initialFilter={{ status: sp.status, scope: sp.scope ?? "all", page }} />;
}
```

## List client highlights

- Top bar: filter pills (`Tất cả | Của tôi | Chờ duyệt L | Chờ duyệt GĐ | Đã duyệt | Từ chối | Sửa lại`) → push searchParams qua `router.replace`
- Table cols: Mã | Phòng tạo | Phòng thực hiện | Nội dung (truncate) | Mức ưu tiên | Trạng thái (badge màu) | Ngày tạo | Hành động
- Action cell: `Xem` link → `/phieu-phoi-hop/[id]`
- Status badge color map:
  ```ts
  const STATUS_BADGE: Record<FormStatus, string> = {
    draft: "bg-gray-100 text-gray-700",
    pending_leader: "bg-blue-100 text-blue-700",
    pending_director: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    revising: "bg-orange-100 text-orange-700",
    cancelled: "bg-gray-100 text-gray-500 line-through",
  };
  ```
- Pagination: simple `Trước | Trang X/Y | Sau` ở footer

## Create form client

Fields:
- `executorDeptId` — `<select>` của departments (loại trừ phòng creator nếu có flag `excludeOwn=true` ở v1: ALLOW self → comment trong code)
- `content` — `<textarea>` 6 rows, ký tự còn lại counter (max 2000)
- `priority` — radio group `Cao | Trung bình | Thấp`
- `deadline` — `<input type="date">` optional

Submit handler:
```tsx
startTransition(async () => {
  try {
    const form = await createDraftAction({ executorDeptId, content, priority, deadline });
    toast.success(`Đã tạo nháp ${form.code}`);
    router.push(`/phieu-phoi-hop/${form.id}`);
  } catch (e) { toast.error(e.message); }
});
```

## Server actions (`actions.ts`)

```ts
"use server";

import { revalidatePath } from "next/cache";
import * as svc from "@/lib/coordination-form/coordination-form-service";
import { createDraftSchema } from "@/lib/coordination-form/schemas";

export async function createDraftAction(input: unknown) {
  const data = createDraftSchema.parse(input);
  const form = await svc.createDraft(data);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function submitFormAction(id: number) {
  const form = await svc.submitForm(id);
  revalidatePath("/phieu-phoi-hop");
  revalidatePath(`/phieu-phoi-hop/${id}`);
  return form;
}

export async function cancelFormAction(id: number) {
  const form = await svc.cancelForm(id);
  revalidatePath("/phieu-phoi-hop");
  revalidatePath(`/phieu-phoi-hop/${id}`);
  return form;
}

export async function updateDraftAction(id: number, input: unknown) {
  const data = createDraftSchema.partial().parse(input);
  const form = await svc.updateDraft(id, data);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  return form;
}
```

## Sidebar nav link

```tsx
// components/layout/app-sidebar.tsx — add to NAV_ITEMS
{ label: "Phieu phoi hop", href: "/phieu-phoi-hop", icon: ClipboardList },
```

## Implementation Steps

1. Create `app/(app)/phieu-phoi-hop/actions.ts`
2. Create `app/(app)/phieu-phoi-hop/page.tsx` + `list-client.tsx`
3. Create `app/(app)/phieu-phoi-hop/tao-moi/page.tsx` + `create-form-client.tsx`
4. Add sidebar link
5. Verify routes load: `/phieu-phoi-hop`, `/phieu-phoi-hop/tao-moi`
6. `npx tsc --noEmit` pass

## Success Criteria

- [ ] List render với filter + pagination
- [ ] Tạo nháp thành công → redirect `/phieu-phoi-hop/[id]` (Phase 4 sẽ build)
- [ ] Filter URL-driven (shareable)
- [ ] Empty state khi không có phiếu
- [ ] `npx tsc --noEmit` pass

## Risk Assessment

- **Phòng selector quá nhiều dept** → v1 dept ít (~5-10), select đủ. Nếu sau này >30 → thay combobox.
- **Content 2000 chars có XSS?** → render bằng `{form.content}` (React escape mặc định) — OK.
- **Concurrent draft tạo cùng code** → service có retry P2002. UI không cần xử lý đặc biệt.
