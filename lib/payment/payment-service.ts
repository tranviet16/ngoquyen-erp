import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";
import { getOutstandingDebt, getCumulativePaid } from "@/lib/ledger/balance-service";
import type { LedgerType } from "@/lib/ledger/ledger-types";

export type PaymentCategory = "vat_tu" | "nhan_cong" | "dich_vu" | "khac";
export type RoundStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "closed";

const VALID_CATEGORIES: PaymentCategory[] = ["vat_tu", "nhan_cong", "dich_vu", "khac"];

/**
 * Map PaymentCategory → LedgerType for balance auto-fill.
 * dich_vu and khac have no ledger backing — SKIP auto-fill (default to 0).
 */
const CATEGORY_LEDGER_TYPE: Partial<Record<PaymentCategory, LedgerType>> = {
  vat_tu: "material",
  nhan_cong: "labor",
  // dich_vu: no ledger backing — skip balance auto-fill
  // khac: no ledger backing — skip balance auto-fill
};

export interface CreateRoundInput {
  month: string;
  note?: string;
}

export interface UpsertItemInput {
  id?: number;
  roundId: number;
  supplierId: number;
  entityId: number;
  projectId: number | null;
  category: PaymentCategory;
  /** Optional on create: null/undefined → auto-fill from balance-service. */
  congNo?: number | null;
  /** Optional on create: null/undefined → auto-fill from balance-service. */
  luyKe?: number | null;
  soDeNghi: number;
  note?: string;
  /** Admin-only: skip auto-fill and use raw congNo/luyKe values as-is. */
  override?: boolean;
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
}) {
  await getActor();
  return prisma.paymentRound.findMany({
    where: {
      deletedAt: null,
      month: filter.month,
      status: filter.status,
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
          entity: { select: { id: true, name: true } },
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

  // Sequence = last sequence in the same month (across ALL categories) + 1
  const last = await prisma.paymentRound.findFirst({
    where: { month: input.month, deletedAt: null },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;

  return prisma.paymentRound.create({
    data: {
      month: input.month,
      sequence,
      status: "draft",
      createdById: actor.id,
      note: input.note,
    },
  });
}

/**
 * Auto-fill congNo + luyKe from balance-service for categories with ledger backing.
 * dich_vu and khac have no ledger rows — they default to 0.
 * entityId is required to prevent cross-entity balance bleed (bug fix).
 */
async function autoFillBalances(
  category: PaymentCategory,
  entityId: number,
  supplierId: number,
  projectId: number | null
): Promise<{ congNo: number; luyKe: number }> {
  const ledgerType = CATEGORY_LEDGER_TYPE[category];
  if (!ledgerType) {
    // dich_vu / khac: no ledger backing, default to 0
    return { congNo: 0, luyKe: 0 };
  }

  const [outstanding, paid] = await Promise.all([
    getOutstandingDebt({ ledgerType, entityId, partyId: supplierId, projectId }),
    getCumulativePaid({ ledgerType, entityId, partyId: supplierId, projectId }),
  ]);

  // Convert Prisma.Decimal → number at the DB write boundary
  return {
    congNo: outstanding.toNumber(),
    luyKe: paid.toNumber(),
  };
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

  // ── UPDATE path ───────────────────────────────────────────────────────────
  // Patch only the fields the caller sent. Do NOT re-pull balances.
  if (input.id) {
    if (input.override && !isAdmin(actor.role))
      throw new Error("Chỉ admin được dùng override");

    // Build a sparse update object — only include defined fields.
    // Category is mutable while the round is in 'draft' (enforced above via status check).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      soDeNghi: input.soDeNghi,
    };
    if (input.supplierId !== undefined) updateData.supplierId = input.supplierId;
    if (input.entityId !== undefined) updateData.entityId = input.entityId;
    if (input.projectId !== undefined) updateData.projectId = input.projectId;
    if (input.note !== undefined) updateData.note = input.note;
    if (input.congNo != null) updateData.congNo = input.congNo;
    if (input.luyKe != null) updateData.luyKe = input.luyKe;
    if (input.category !== undefined) {
      if (!VALID_CATEGORIES.includes(input.category)) {
        throw new Error(
          `category không hợp lệ: "${input.category}". Phải là một trong: ${VALID_CATEGORIES.join(", ")}`
        );
      }
      updateData.category = input.category;
    }

    return prisma.paymentRoundItem.update({
      where: { id: input.id },
      data: updateData,
    });
  }

  // ── CREATE path ───────────────────────────────────────────────────────────
  if (!VALID_CATEGORIES.includes(input.category)) {
    throw new Error(
      `category không hợp lệ: "${input.category}". Phải là một trong: ${VALID_CATEGORIES.join(", ")}`
    );
  }

  if (input.override) {
    // Admin override: use raw values without touching balance-service
    if (!isAdmin(actor.role)) throw new Error("Chỉ admin được dùng override");
    return prisma.paymentRoundItem.create({
      data: {
        roundId: input.roundId,
        entityId: input.entityId,
        supplierId: input.supplierId,
        projectId: input.projectId,
        category: input.category,
        congNo: input.congNo ?? 0,
        luyKe: input.luyKe ?? 0,
        soDeNghi: input.soDeNghi,
        note: input.note,
      },
    });
  }

  let congNo: number;
  let luyKe: number;
  let balancesRefreshedAt: Date | null = null;

  if (input.congNo == null || input.luyKe == null) {
    // Auto-fill from balance-service (snapshot frozen at creation time)
    const filled = await autoFillBalances(
      input.category,
      input.entityId,
      input.supplierId,
      input.projectId
    );
    congNo = filled.congNo;
    luyKe = filled.luyKe;
    balancesRefreshedAt = new Date();
  } else {
    // Caller supplied explicit values — trust them
    congNo = input.congNo;
    luyKe = input.luyKe;
  }

  return prisma.paymentRoundItem.create({
    data: {
      roundId: input.roundId,
      entityId: input.entityId,
      supplierId: input.supplierId,
      projectId: input.projectId,
      category: input.category,
      congNo,
      luyKe,
      soDeNghi: input.soDeNghi,
      note: input.note,
      balancesRefreshedAt,
    },
  });
}

/**
 * Re-pull balances from balance-service for a single item.
 * Only allowed when the parent round is in 'draft' status.
 * Caller must be the round creator or an admin.
 */
export async function refreshItemBalances(itemId: number) {
  const actor = await getActor();

  const item = await prisma.paymentRoundItem.findUnique({
    where: { id: itemId },
    include: {
      round: { select: { status: true, createdById: true } },
    },
  });
  if (!item) throw new Error("Không tìm thấy dòng");

  if (item.round.status !== "draft") {
    throw new Error(
      `Chỉ có thể làm mới số dư khi đợt ở trạng thái nháp (hiện tại: ${item.round.status})`
    );
  }
  if (item.round.createdById !== actor.id && !isAdmin(actor.role)) {
    throw new Error("Chỉ người lập đợt hoặc admin được làm mới số dư");
  }

  const category = item.category as PaymentCategory;
  const filled = await autoFillBalances(category, item.entityId, item.supplierId, item.projectId);

  return prisma.paymentRoundItem.update({
    where: { id: itemId },
    data: {
      congNo: filled.congNo,
      luyKe: filled.luyKe,
      balancesRefreshedAt: new Date(),
    },
  });
}

export async function listItemIdsForRound(roundId: number): Promise<number[]> {
  await getActor();
  const rows = await prisma.paymentRoundItem.findMany({
    where: { roundId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => r.id);
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

/**
 * Soft-delete a payment round (sets deletedAt). Allowed for the round creator
 * or an admin, and only while the round is not yet approved/closed —
 * approved/closed rounds carry settled figures and must stay auditable.
 */
export async function deleteRound(roundId: number) {
  const actor = await getActor();
  const round = await prisma.paymentRound.findFirst({
    where: { id: roundId, deletedAt: null },
    select: { status: true, createdById: true },
  });
  if (!round) throw new Error("Không tìm thấy đợt");
  if (round.status === "approved" || round.status === "closed")
    throw new Error("Không xoá được đợt đã duyệt hoặc đã đóng");
  if (round.createdById !== actor.id && !isAdmin(actor.role))
    throw new Error("Chỉ người lập đợt hoặc admin được xoá");
  await prisma.paymentRound.update({
    where: { id: roundId },
    data: { deletedAt: new Date() },
  });
}

export interface AggregateRow {
  supplierId: number;
  supplierName: string;
  category: PaymentCategory;
  entityId: number;
  entityName: string;
  soDeNghi: number;
  soDuyet: number;
}

export async function aggregateMonth(month: string): Promise<AggregateRow[]> {
  await getActor();
  const rows = await prisma.$queryRaw<
    Array<{
      supplier_id: number;
      supplier_name: string;
      category: string;
      entity_id: number;
      entity_name: string;
      so_de_nghi: string;
      so_duyet: string;
    }>
  >`
    SELECT
      i."supplierId"      AS supplier_id,
      s.name              AS supplier_name,
      i.category          AS category,
      i."entityId"        AS entity_id,
      e.name              AS entity_name,
      COALESCE(SUM(i."soDeNghi"), 0) AS so_de_nghi,
      COALESCE(SUM(i."soDuyet"), 0)  AS so_duyet
    FROM payment_round_items i
    JOIN payment_rounds r ON r.id = i."roundId"
    JOIN suppliers s ON s.id = i."supplierId"
    JOIN entities  e ON e.id = i."entityId"
    WHERE r."month" = ${month}
      AND r.status IN ('approved', 'closed')
      AND r."deletedAt" IS NULL
    GROUP BY i."supplierId", s.name, i.category, i."entityId", e.name
    ORDER BY s.name, i.category, e.name;
  `;
  return rows.map((r) => ({
    supplierId: Number(r.supplier_id),
    supplierName: r.supplier_name,
    category: r.category as PaymentCategory,
    entityId: Number(r.entity_id),
    entityName: r.entity_name,
    soDeNghi: Number(r.so_de_nghi),
    soDuyet: Number(r.so_duyet),
  }));
}
