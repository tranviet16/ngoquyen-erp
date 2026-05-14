---
phase: 2
title: "Service + RBAC + workflow"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Service + RBAC + workflow

## Overview
Service layer `lib/payment/payment-service.ts` + server actions `app/(app)/thanh-toan/actions.ts`. Bao gồm CRUD round/items, workflow transitions, per-item approve, RBAC guards.

## Related Code Files
- Create: `lib/payment/payment-service.ts`
- Create: `app/(app)/thanh-toan/actions.ts`
- Read for context:
  - [lib/coordination-form/coordination-form-service.ts](lib/coordination-form/coordination-form-service.ts) — workflow pattern reference
  - [lib/admin/user-grants-service.ts](lib/admin/user-grants-service.ts) — admin guard pattern (`assertAdmin`)
  - [lib/auth.ts](lib/auth.ts) — session shape
  - [lib/rbac.ts](lib/rbac.ts) — `isAdmin`, `ALL_ROLES`
  - [lib/prisma.ts](lib/prisma.ts) lines 174-193 — audit middleware (xác nhận `update` được auto-log, KHÔNG bypass)

## Implementation Steps

### 1. Session helper
```ts
// lib/payment/payment-service.ts (top)
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";

async function getActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Chưa đăng nhập");
  return session.user;
}

function canCreate(role: string | null) {
  return role === "admin" || role === "ketoan" || role === "canbo_vt";
}
function canApprove(user: { role?: string | null; isDirector: boolean }) {
  return isAdmin(user.role ?? null) || user.isDirector;
}
```

### 2. Types
```ts
export type PaymentCategory = "vat_tu" | "nhan_cong" | "dich_vu" | "khac";
export type ProjectScope = "cty_ql" | "giao_khoan";
export type RoundStatus = "draft" | "submitted" | "approved" | "rejected" | "closed";

export interface CreateRoundInput {
  month: string; // "YYYY-MM"
  category: PaymentCategory;
  note?: string;
}

export interface UpsertItemInput {
  id?: number;
  roundId: number;
  supplierId: number;
  projectScope: ProjectScope;
  projectId: number | null;
  congNo: number;
  luyKe: number;
  soDeNghi: number;
  note?: string;
}
```

### 3. Service functions

```ts
// listRounds(filter) — list theo month/status/category
export async function listRounds(filter: {
  month?: string;
  status?: RoundStatus;
  category?: PaymentCategory;
}) {
  await getActor();
  return prisma.paymentRound.findMany({
    where: {
      deletedAt: null,
      month: filter.month,
      status: filter.status,
      category: filter.category,
    },
    include: {
      _count: { select: { items: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ month: "desc" }, { sequence: "desc" }],
  });
}

// getRound(id) — full detail với items
export async function getRound(id: number) {
  await getActor();
  return prisma.paymentRound.findUnique({
    where: { id, deletedAt: null },
    include: {
      items: {
        include: {
          supplier: { select: { id: true, name: true } },
          project: { select: { id: true, code: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: { id: "asc" },
      },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
}

// createRound — auto next sequence
export async function createRound(input: CreateRoundInput) {
  const actor = await getActor();
  if (!canCreate(actor.role ?? null)) throw new Error("Không có quyền lập đợt");

  const last = await prisma.paymentRound.findFirst({
    where: { month: input.month, category: input.category, deletedAt: null },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;

  return prisma.paymentRound.create({
    data: {
      month: input.month,
      sequence,
      category: input.category,
      status: "draft",
      createdById: actor.id,
      note: input.note,
    },
  });
}

// upsertItem — chỉ khi round status=draft
export async function upsertItem(input: UpsertItemInput) {
  const actor = await getActor();
  const round = await prisma.paymentRound.findUnique({
    where: { id: input.roundId },
    select: { status: true, createdById: true },
  });
  if (!round) throw new Error("Không tìm thấy đợt");
  if (round.status !== "draft") throw new Error("Chỉ sửa được khi đợt ở trạng thái nháp");
  if (round.createdById !== actor.id && !isAdmin(actor.role ?? null))
    throw new Error("Chỉ người lập đợt được sửa items");

  const data = {
    roundId: input.roundId,
    supplierId: input.supplierId,
    projectScope: input.projectScope,
    projectId: input.projectId,
    congNo: input.congNo,
    luyKe: input.luyKe,
    soDeNghi: input.soDeNghi,
    note: input.note,
  };

  if (input.id) {
    return prisma.paymentRoundItem.update({ where: { id: input.id }, data });
  }
  return prisma.paymentRoundItem.create({ data });
}

// deleteItem — chỉ khi draft
export async function deleteItem(itemId: number) {
  const actor = await getActor();
  const item = await prisma.paymentRoundItem.findUnique({
    where: { id: itemId },
    include: { round: { select: { status: true, createdById: true } } },
  });
  if (!item) throw new Error("Không tìm thấy dòng");
  if (item.round.status !== "draft") throw new Error("Chỉ xoá được khi nháp");
  if (item.round.createdById !== actor.id && !isAdmin(actor.role ?? null))
    throw new Error("Không có quyền");
  await prisma.paymentRoundItem.delete({ where: { id: itemId } });
}

// submitRound — draft → submitted
export async function submitRound(roundId: number) {
  const actor = await getActor();
  const round = await prisma.paymentRound.findUnique({
    where: { id: roundId },
    select: { status: true, createdById: true, items: { select: { id: true } } } as any,
  });
  if (!round) throw new Error("Không tìm thấy đợt");
  if (round.status !== "draft") throw new Error("Chỉ submit được từ trạng thái nháp");
  if (round.createdById !== actor.id && !isAdmin(actor.role ?? null))
    throw new Error("Không có quyền submit");
  const count = await prisma.paymentRoundItem.count({ where: { roundId } });
  if (count === 0) throw new Error("Đợt phải có ít nhất 1 dòng");

  await prisma.paymentRound.update({
    where: { id: roundId },
    data: { status: "submitted", submittedAt: new Date() },
  });
}

// approveItem — soDuyet either explicit hoặc = soDeNghi (quick)
export async function approveItem(input: {
  itemId: number;
  soDuyet?: number; // undefined → use soDeNghi
}) {
  const actor = await getActor();
  if (!canApprove({ role: actor.role ?? null, isDirector: actor.isDirector ?? false }))
    throw new Error("Chỉ GĐ/admin được duyệt");

  const item = await prisma.paymentRoundItem.findUnique({
    where: { id: input.itemId },
    include: { round: { select: { id: true, status: true } } },
  });
  if (!item) throw new Error("Không tìm thấy dòng");
  if (item.round.status !== "submitted")
    throw new Error("Đợt phải ở trạng thái đã gửi mới được duyệt");

  const soDuyet = input.soDuyet ?? Number(item.soDeNghi);

  await prisma.paymentRoundItem.update({
    where: { id: input.itemId },
    data: { soDuyet, approvedAt: new Date(), approvedById: actor.id },
  });

  await maybeAutoApproveRound(item.round.id);
}

// rejectItem — soDuyet=0, vẫn đánh dấu approved (để round có thể chốt)
export async function rejectItem(itemId: number) {
  const actor = await getActor();
  if (!canApprove({ role: actor.role ?? null, isDirector: actor.isDirector ?? false }))
    throw new Error("Chỉ GĐ/admin được từ chối");

  const item = await prisma.paymentRoundItem.findUnique({
    where: { id: itemId },
    include: { round: { select: { id: true, status: true } } },
  });
  if (!item) throw new Error("Không tìm thấy dòng");
  if (item.round.status !== "submitted") throw new Error("Đợt phải ở trạng thái đã gửi");

  await prisma.paymentRoundItem.update({
    where: { id: itemId },
    data: { soDuyet: 0, approvedAt: new Date(), approvedById: actor.id },
  });

  await maybeAutoApproveRound(item.round.id);
}

// bulkApproveAsRequested — duyệt all items = soDeNghi
export async function bulkApproveAsRequested(roundId: number) {
  const actor = await getActor();
  if (!canApprove({ role: actor.role ?? null, isDirector: actor.isDirector ?? false }))
    throw new Error("Chỉ GĐ/admin được duyệt");

  const round = await prisma.paymentRound.findUnique({
    where: { id: roundId },
    select: { status: true },
  });
  if (round?.status !== "submitted") throw new Error("Đợt phải ở trạng thái đã gửi");

  const items = await prisma.paymentRoundItem.findMany({
    where: { roundId, approvedAt: null },
    select: { id: true, soDeNghi: true },
  });
  const now = new Date();
  for (const it of items) {
    await prisma.paymentRoundItem.update({
      where: { id: it.id },
      data: { soDuyet: it.soDeNghi, approvedAt: now, approvedById: actor.id },
    });
  }
  await maybeAutoApproveRound(roundId);
}

// maybeAutoApproveRound — nếu all items approved → set round=approved
async function maybeAutoApproveRound(roundId: number) {
  const [total, approved] = await Promise.all([
    prisma.paymentRoundItem.count({ where: { roundId } }),
    prisma.paymentRoundItem.count({ where: { roundId, approvedAt: { not: null } } }),
  ]);
  if (total > 0 && total === approved) {
    const actor = await getActor();
    await prisma.paymentRound.update({
      where: { id: roundId },
      data: { status: "approved", approvedAt: new Date(), approvedById: actor.id },
    });
  }
}

// rejectRound — toàn round bị reject (đẩy về draft cho KH sửa)
export async function rejectRound(roundId: number, reason: string) {
  const actor = await getActor();
  if (!canApprove({ role: actor.role ?? null, isDirector: actor.isDirector ?? false }))
    throw new Error("Chỉ GĐ/admin được từ chối");
  const round = await prisma.paymentRound.findUnique({
    where: { id: roundId },
    select: { status: true },
  });
  if (round?.status !== "submitted") throw new Error("Đợt phải ở trạng thái đã gửi");

  await prisma.paymentRound.update({
    where: { id: roundId },
    data: { status: "rejected", note: reason },
  });
}

// closeRound — admin only
export async function closeRound(roundId: number) {
  const actor = await getActor();
  if (!isAdmin(actor.role ?? null)) throw new Error("Chỉ admin được đóng đợt");
  const round = await prisma.paymentRound.findUnique({
    where: { id: roundId },
    select: { status: true },
  });
  if (round?.status !== "approved") throw new Error("Chỉ đóng được đợt đã duyệt");
  await prisma.paymentRound.update({
    where: { id: roundId },
    data: { status: "closed" },
  });
}

// aggregateMonth — for /tong-hop
export async function aggregateMonth(month: string) {
  await getActor();
  const rows = await prisma.$queryRaw<Array<{
    supplier_id: number;
    supplier_name: string;
    project_scope: string;
    so_de_nghi: string;
    so_duyet: string;
  }>>`
    SELECT
      i.supplier_id,
      s.name AS supplier_name,
      i.project_scope,
      COALESCE(SUM(i.so_de_nghi), 0) AS so_de_nghi,
      COALESCE(SUM(i.so_duyet), 0)   AS so_duyet
    FROM payment_round_items i
    JOIN payment_rounds r ON r.id = i.round_id
    JOIN suppliers s ON s.id = i.supplier_id
    WHERE r."month" = ${month}
      AND r.status IN ('approved', 'closed')
      AND r."deletedAt" IS NULL
    GROUP BY i.supplier_id, s.name, i.project_scope
    ORDER BY s.name;
  `;
  return rows.map(r => ({
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    projectScope: r.project_scope as ProjectScope,
    soDeNghi: Number(r.so_de_nghi),
    soDuyet: Number(r.so_duyet),
  }));
}
```

### 4. Server actions
```ts
// app/(app)/thanh-toan/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import * as svc from "@/lib/payment/payment-service";

export async function createRoundAction(input: svc.CreateRoundInput) {
  const r = await svc.createRound(input);
  revalidatePath("/thanh-toan/ke-hoach");
  return { id: r.id };
}
export async function upsertItemAction(input: svc.UpsertItemInput) {
  await svc.upsertItem(input);
  revalidatePath(`/thanh-toan/ke-hoach/${input.roundId}`);
}
export async function deleteItemAction(itemId: number, roundId: number) {
  await svc.deleteItem(itemId);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
}
export async function submitRoundAction(roundId: number) {
  await svc.submitRound(roundId);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
  revalidatePath("/thanh-toan/ke-hoach");
}
export async function approveItemAction(itemId: number, roundId: number, soDuyet?: number) {
  await svc.approveItem({ itemId, soDuyet });
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
}
export async function rejectItemAction(itemId: number, roundId: number) {
  await svc.rejectItem(itemId);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
}
export async function bulkApproveAsRequestedAction(roundId: number) {
  await svc.bulkApproveAsRequested(roundId);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
}
export async function rejectRoundAction(roundId: number, reason: string) {
  await svc.rejectRound(roundId, reason);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
}
export async function closeRoundAction(roundId: number) {
  await svc.closeRound(roundId);
  revalidatePath(`/thanh-toan/ke-hoach/${roundId}`);
}
```

## Success Criteria
- [ ] Type-check pass
- [ ] Audit middleware tự log tất cả `paymentRound`/`paymentRoundItem` update (verify bằng query `audit_logs` sau 1 update)
- [ ] Guards trả error message tiếng Việt rõ ràng
- [ ] `aggregateMonth` chỉ count rounds `approved` hoặc `closed`

## Risk Assessment
- **`session.user.isDirector` truthy?** Verify ở `lib/auth.ts` config `additionalFields.isDirector` được returned trong session. Nếu không, lookup từ DB trong `canApprove`.
- **`maybeAutoApproveRound` race**: 2 GĐ duyệt 2 items đồng thời → cả 2 cùng check `total === approved`. Acceptable — `update` idempotent, audit log ghi 2 lần status không thay đổi.
- **Raw SQL injection**: `${month}` dùng tagged template — Prisma parameterize tự động, OK.
