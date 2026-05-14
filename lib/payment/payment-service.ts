import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";

export type PaymentCategory = "vat_tu" | "nhan_cong" | "dich_vu" | "khac";
export type ProjectScope = "cty_ql" | "giao_khoan";
export type RoundStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "closed";

export interface CreateRoundInput {
  month: string;
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

interface Actor {
  id: string;
  role: string | null;
  isDirector: boolean;
  isLeader: boolean;
}

async function getActor(): Promise<Actor> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Chưa đăng nhập");
  // isDirector/isLeader không nằm trong session — lookup từ DB
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isDirector: true, isLeader: true, role: true },
  });
  if (!dbUser) throw new Error("User không tồn tại");
  return {
    id: session.user.id,
    role: dbUser.role ?? session.user.role ?? null,
    isDirector: dbUser.isDirector,
    isLeader: dbUser.isLeader,
  };
}

function canCreate(role: string | null) {
  return role === "admin" || role === "ketoan" || role === "canbo_vt";
}
function canApprove(actor: Actor) {
  return isAdmin(actor.role) || actor.isDirector;
}

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

export async function getRound(id: number) {
  await getActor();
  return prisma.paymentRound.findFirst({
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

export async function createRound(input: CreateRoundInput) {
  const actor = await getActor();
  if (!canCreate(actor.role)) throw new Error("Không có quyền lập đợt");

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

export async function upsertItem(input: UpsertItemInput) {
  const actor = await getActor();
  const round = await prisma.paymentRound.findUnique({
    where: { id: input.roundId },
    select: { status: true, createdById: true },
  });
  if (!round) throw new Error("Không tìm thấy đợt");
  if (round.status !== "draft")
    throw new Error("Chỉ sửa được khi đợt ở trạng thái nháp");
  if (round.createdById !== actor.id && !isAdmin(actor.role))
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
    return prisma.paymentRoundItem.update({
      where: { id: input.id },
      data,
    });
  }
  return prisma.paymentRoundItem.create({ data });
}

export async function deleteItem(itemId: number) {
  const actor = await getActor();
  const item = await prisma.paymentRoundItem.findUnique({
    where: { id: itemId },
    include: { round: { select: { status: true, createdById: true } } },
  });
  if (!item) throw new Error("Không tìm thấy dòng");
  if (item.round.status !== "draft")
    throw new Error("Chỉ xoá được khi nháp");
  if (item.round.createdById !== actor.id && !isAdmin(actor.role))
    throw new Error("Không có quyền");
  await prisma.paymentRoundItem.delete({ where: { id: itemId } });
}

export async function submitRound(roundId: number) {
  const actor = await getActor();
  const round = await prisma.paymentRound.findUnique({
    where: { id: roundId },
    select: { status: true, createdById: true },
  });
  if (!round) throw new Error("Không tìm thấy đợt");
  if (round.status !== "draft")
    throw new Error("Chỉ submit được từ trạng thái nháp");
  if (round.createdById !== actor.id && !isAdmin(actor.role))
    throw new Error("Không có quyền submit");
  const count = await prisma.paymentRoundItem.count({ where: { roundId } });
  if (count === 0) throw new Error("Đợt phải có ít nhất 1 dòng");

  await prisma.paymentRound.update({
    where: { id: roundId },
    data: { status: "submitted", submittedAt: new Date() },
  });
}

export async function approveItem(input: {
  itemId: number;
  soDuyet?: number;
}) {
  const actor = await getActor();
  if (!canApprove(actor)) throw new Error("Chỉ Giám đốc/admin được duyệt");

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

  await maybeAutoApproveRound(item.round.id, actor);
}

export async function rejectItem(itemId: number) {
  const actor = await getActor();
  if (!canApprove(actor)) throw new Error("Chỉ Giám đốc/admin được từ chối");

  const item = await prisma.paymentRoundItem.findUnique({
    where: { id: itemId },
    include: { round: { select: { id: true, status: true } } },
  });
  if (!item) throw new Error("Không tìm thấy dòng");
  if (item.round.status !== "submitted")
    throw new Error("Đợt phải ở trạng thái đã gửi");

  await prisma.paymentRoundItem.update({
    where: { id: itemId },
    data: { soDuyet: 0, approvedAt: new Date(), approvedById: actor.id },
  });

  await maybeAutoApproveRound(item.round.id, actor);
}

export async function bulkApproveAsRequested(roundId: number) {
  const actor = await getActor();
  if (!canApprove(actor)) throw new Error("Chỉ Giám đốc/admin được duyệt");

  const round = await prisma.paymentRound.findUnique({
    where: { id: roundId },
    select: { status: true },
  });
  if (round?.status !== "submitted")
    throw new Error("Đợt phải ở trạng thái đã gửi");

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
  await maybeAutoApproveRound(roundId, actor);
}

async function maybeAutoApproveRound(roundId: number, actor: Actor) {
  const [total, approved] = await Promise.all([
    prisma.paymentRoundItem.count({ where: { roundId } }),
    prisma.paymentRoundItem.count({
      where: { roundId, approvedAt: { not: null } },
    }),
  ]);
  if (total > 0 && total === approved) {
    await prisma.paymentRound.update({
      where: { id: roundId },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
      },
    });
  }
}

export async function rejectRound(roundId: number, reason: string) {
  const actor = await getActor();
  if (!canApprove(actor))
    throw new Error("Chỉ Giám đốc/admin được từ chối");
  const round = await prisma.paymentRound.findUnique({
    where: { id: roundId },
    select: { status: true },
  });
  if (round?.status !== "submitted")
    throw new Error("Đợt phải ở trạng thái đã gửi");

  await prisma.paymentRound.update({
    where: { id: roundId },
    data: { status: "rejected", note: reason },
  });
}

export async function closeRound(roundId: number) {
  const actor = await getActor();
  if (!isAdmin(actor.role)) throw new Error("Chỉ admin được đóng đợt");
  const round = await prisma.paymentRound.findUnique({
    where: { id: roundId },
    select: { status: true },
  });
  if (round?.status !== "approved")
    throw new Error("Chỉ đóng được đợt đã duyệt");
  await prisma.paymentRound.update({
    where: { id: roundId },
    data: { status: "closed" },
  });
}

export interface AggregateRow {
  supplierId: number;
  supplierName: string;
  projectScope: ProjectScope;
  soDeNghi: number;
  soDuyet: number;
}

export async function aggregateMonth(month: string): Promise<AggregateRow[]> {
  await getActor();
  const rows = await prisma.$queryRaw<
    Array<{
      supplier_id: number;
      supplier_name: string;
      project_scope: string;
      so_de_nghi: string;
      so_duyet: string;
    }>
  >`
    SELECT
      i."supplierId"      AS supplier_id,
      s.name              AS supplier_name,
      i."projectScope"    AS project_scope,
      COALESCE(SUM(i."soDeNghi"), 0) AS so_de_nghi,
      COALESCE(SUM(i."soDuyet"), 0)  AS so_duyet
    FROM payment_round_items i
    JOIN payment_rounds r ON r.id = i."roundId"
    JOIN suppliers s ON s.id = i."supplierId"
    WHERE r."month" = ${month}
      AND r.status IN ('approved', 'closed')
      AND r."deletedAt" IS NULL
    GROUP BY i."supplierId", s.name, i."projectScope"
    ORDER BY s.name;
  `;
  return rows.map((r) => ({
    supplierId: Number(r.supplier_id),
    supplierName: r.supplier_name,
    projectScope: r.project_scope as ProjectScope,
    soDeNghi: Number(r.so_de_nghi),
    soDuyet: Number(r.so_duyet),
  }));
}
