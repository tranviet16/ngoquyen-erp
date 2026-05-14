---
phase: 3
title: "Trang kế hoạch (lập + duyệt per-item)"
status: pending
priority: P1
effort: "2.5h"
dependencies: [2]
---

# Phase 3: Trang kế hoạch

## Overview
2 trang:
- `/thanh-toan/ke-hoach` — list rounds với filter month/status/category + nút "Tạo đợt mới"
- `/thanh-toan/ke-hoach/[id]` — chi tiết round: KH thêm/sửa items + submit; GĐ duyệt per-item + bulk

## Related Code Files
- Create: `app/(app)/thanh-toan/layout.tsx`
- Create: `app/(app)/thanh-toan/ke-hoach/page.tsx` (server)
- Create: `app/(app)/thanh-toan/ke-hoach/round-list-client.tsx`
- Create: `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx` (server)
- Create: `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx`
- Read for context:
  - [app/(app)/admin/nguoi-dung/user-grants-client.tsx](app/(app)/admin/nguoi-dung/user-grants-client.tsx) — per-row inline edit pattern, useRef pristine baseline
  - [app/(app)/van-hanh/phieu-phoi-hop/[id]/detail-client.tsx](app/(app)/van-hanh/phieu-phoi-hop/[id]/detail-client.tsx) — workflow buttons pattern
  - [components/ui/button.tsx](components/ui/button.tsx), [components/ui/input.tsx](components/ui/input.tsx)

## Implementation Steps

### 1. Layout shell
```tsx
// app/(app)/thanh-toan/layout.tsx
export default function ThanhToanLayout({ children }: { children: React.ReactNode }) {
  return <div className="p-6">{children}</div>;
}
```

### 2. List page (server)
```tsx
// app/(app)/thanh-toan/ke-hoach/page.tsx
import { listRounds } from "@/lib/payment/payment-service";
import { RoundListClient } from "./round-list-client";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; status?: string; category?: string }> }) {
  const sp = await searchParams;
  const month = sp.month ?? new Date().toISOString().slice(0, 7);
  const rounds = await listRounds({ month, status: sp.status as never, category: sp.category as never });
  return <RoundListClient initialRounds={rounds} initialFilter={{ month, status: sp.status, category: sp.category }} />;
}
```

### 3. RoundListClient
- Filters: month input, status select, category select
- Table: # | Tháng | Đợt | Loại | Trạng thái | Người lập | Số dòng | Ngày tạo | Hành động (Xem)
- Top-right: nút "Tạo đợt mới" → mở dialog → form { month, category, note } → `createRoundAction` → router.push tới `/thanh-toan/ke-hoach/{id}`
- Status badge màu: draft=gray, submitted=blue, approved=green, rejected=red, closed=slate

### 4. Detail page (server)
```tsx
// app/(app)/thanh-toan/ke-hoach/[id]/page.tsx
import { getRound } from "@/lib/payment/payment-service";
import { listSuppliers } from "@/lib/supplier-service"; // existing
import { listProjects } from "@/lib/project-service";   // existing
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RoundDetailClient } from "./round-detail-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [round, suppliers, projects, session] = await Promise.all([
    getRound(Number(id)),
    listSuppliers(),
    listProjects(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!round) notFound();
  return (
    <RoundDetailClient
      round={round}
      suppliers={suppliers}
      projects={projects}
      currentUser={{
        id: session!.user.id,
        role: session!.user.role ?? null,
        isDirector: session!.user.isDirector ?? false,
      }}
    />
  );
}
```

### 5. RoundDetailClient — core component
Sections:
1. **Header card**: tháng, đợt, loại, status badge, người lập, người duyệt
2. **Workflow toolbar** (status-aware):
   - `draft` + isCreator/admin: nút "Submit duyệt" (disabled nếu items.length===0)
   - `submitted` + isDirector/admin: nút "Duyệt tất cả = đề xuất" + "Từ chối đợt"
   - `approved` + admin: nút "Đóng đợt"
3. **Items table**: thêm row mới (chỉ ở draft), sửa inline (draft), duyệt per-row (submitted)
   - Cột: STT | NCC (select) | Phạm vi (cty_ql/giao_khoan) | Công trình (select, optional) | Công nợ | Lũy kế | Số đề nghị | Số duyệt | Ghi chú | Hành động
   - Draft mode: input cell + nút "Lưu" per-row + nút "Xoá"
   - Submitted mode: row readonly trừ ô "Số duyệt"; 3 nút "Duyệt = đề xuất" | "Duyệt" (cần value khác) | "Từ chối"
   - Approved/closed: full readonly

Implementation pattern theo `user-grants-client.tsx` — local state per-row + `useRef` pristine baseline + `useTransition`.

Pseudocode `ItemRow`:
```tsx
function ItemRow({ item, round, suppliers, projects, isCreator, isDirector, isAdmin }) {
  const [supplierId, setSupplierId] = useState(item.supplierId);
  const [projectScope, setProjectScope] = useState(item.projectScope);
  const [projectId, setProjectId] = useState(item.projectId);
  const [congNo, setCongNo] = useState(Number(item.congNo));
  const [luyKe, setLuyKe] = useState(Number(item.luyKe));
  const [soDeNghi, setSoDeNghi] = useState(Number(item.soDeNghi));
  const [soDuyetInput, setSoDuyetInput] = useState(item.soDuyet != null ? Number(item.soDuyet) : Number(item.soDeNghi));
  const [pending, startTransition] = useTransition();

  const editable = round.status === "draft" && (isCreator || isAdmin);
  const approvable = round.status === "submitted" && (isDirector || isAdmin) && item.approvedAt === null;

  function save() { startTransition(async () => { ... upsertItemAction(...) ... }); }
  function approve(useRequested: boolean) {
    startTransition(async () => {
      try { await approveItemAction(item.id, round.id, useRequested ? undefined : soDuyetInput); toast.success("Đã duyệt"); }
      catch (e) { toast.error(...); }
    });
  }
  function reject() { ... rejectItemAction ... }
  function remove() { ... deleteItemAction ... }

  // Render: tuỳ status → controls hoặc readonly
}
```

Add new row form (chỉ ở draft):
- Inline form ở cuối bảng giống `user-grants` thêm grant
- Submit → `upsertItemAction(input)` không có `id`

### 6. Workflow buttons handlers
- `handleSubmit` → `submitRoundAction(round.id)` → toast + redirect (status đổi sau revalidate)
- `handleBulkApprove` → `bulkApproveAsRequestedAction(round.id)` → confirm dialog "Duyệt tất cả N dòng theo đề xuất?"
- `handleRejectRound` → prompt reason → `rejectRoundAction(round.id, reason)`
- `handleClose` → confirm → `closeRoundAction(round.id)`

### 7. Utility: format number
```tsx
function formatVnd(n: number | string) {
  return Number(n).toLocaleString("vi-VN");
}
```

### 8. Existing services check
Verify tồn tại:
- `lib/supplier-service.ts` với `listSuppliers()` — nếu không có, dùng `prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } })` inline trong page server component
- `lib/project-service.ts` với `listProjects()` — tương tự

## Success Criteria
- [ ] KH login → vào `/thanh-toan/ke-hoach` → tạo đợt mới → thêm 2 items → Submit → status badge chuyển "Đã gửi"
- [ ] GĐ login → vào round submitted → thấy 3 nút duyệt; click "Duyệt = đề xuất" trên 1 item → row hiển thị "Đã duyệt"
- [ ] Khi all items approved → round auto chuyển `approved`, toolbar đổi sang "Đóng đợt"
- [ ] Draft mode: input enabled; submitted mode: chỉ ô soDuyet enabled cho GĐ
- [ ] router.refresh không clobber in-progress edits (useRef pristine baseline)
- [ ] Non-creator + non-admin submit round → error toast

## Risk Assessment
- **Race router.refresh vs in-progress edit**: dùng `useRef` baseline giống `user-grants-client.tsx` (đã chứng minh works)
- **Number precision**: input dùng `type="number" step="0.01"`; convert sang number ở client, Decimal ở Prisma. Verify SUM aggregate khớp.
- **Suppliers list lớn**: nếu >500 supplier, dùng combobox search thay vì native select. Phase này dùng native cho KISS; combobox để sau nếu UX phàn nàn.
