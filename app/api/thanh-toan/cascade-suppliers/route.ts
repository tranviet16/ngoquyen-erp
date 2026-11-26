import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccess } from "@/lib/acl";
import { parseSupplierKind } from "@/lib/master-data/supplier-kind";

/**
 * GET /api/thanh-toan/cascade-suppliers
 * Query params:
 *   ledgerType: "material" | "labor" | "all" (required)
 *   entityId: int > 0 (required)
 *   projectId: int (optional)
 *   supplierKind: "vat_tu" | "nhan_cong" (optional) — chỉ NCC loại này (ledgerType=material).
 *     Dòng thanh toán vat_tu gửi "vat_tu", dòng nhan_cong gửi "nhan_cong"; không gửi = mọi loại.
 *
 * Returns distinct suppliers that have material debt for the given (entityId, projectId?) pair:
 * a ledger transaction OR an opening balance (NCC chỉ có số dư đầu kỳ vẫn còn nợ để trả).
 *
 * Special cases:
 *   ledgerType=labor  → short-circuit [] (labor ledger uses Contractor, not Supplier); giữ cho
 *                       người gọi cũ — dòng nhan_cong giờ gọi ledgerType=material + supplierKind
 *   ledgerType=all    → all active suppliers (dich_vu / khac fallback)
 *
 * Auth: session-only gate (401 if absent).
 */

interface SupplierRow {
  id: number;
  name: string;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });
  if (!actor?.isActive) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const ledgerType = searchParams.get("ledgerType");
  const entityIdRaw = searchParams.get("entityId");
  const projectIdRaw = searchParams.get("projectId");
  const supplierKindRaw = searchParams.get("supplierKind");
  const departmentIdRaw = searchParams.get("departmentId");

  if (actor.role !== "admin") {
    const departmentId = departmentIdRaw ? Number(departmentIdRaw) : NaN;
    const allowed = Number.isInteger(departmentId) && departmentId > 0 && await canAccess(
      session.user.id,
      "thanh-toan.ke-hoach",
      { minLevel: "create", scope: { kind: "dept", deptId: departmentId } },
    );
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate ledgerType
  if (!ledgerType || !["material", "labor", "all"].includes(ledgerType)) {
    return NextResponse.json(
      { error: "Invalid ledgerType. Must be 'material', 'labor', or 'all'." },
      { status: 400 }
    );
  }

  // Validate entityId
  const entityId = entityIdRaw ? parseInt(entityIdRaw, 10) : NaN;
  if (!Number.isFinite(entityId) || entityId <= 0) {
    return NextResponse.json(
      { error: "entityId must be a positive integer." },
      { status: 400 }
    );
  }

  // supplierKind is optional; a value that is present must be a known kind.
  const supplierKind = parseSupplierKind(supplierKindRaw);
  if (supplierKindRaw && !supplierKind) {
    return NextResponse.json(
      { error: "supplierKind must be 'vat_tu' or 'nhan_cong'." },
      { status: 400 }
    );
  }

  // projectId is optional
  const projectId =
    projectIdRaw && projectIdRaw !== ""
      ? parseInt(projectIdRaw, 10)
      : null;

  // Short-circuit: labor ledger uses Contractor, not Supplier
  if (ledgerType === "labor") {
    return NextResponse.json(
      { suppliers: [] },
      { headers: { "X-Empty-Reason": "labor-uses-contractor" } }
    );
  }

  // Fallback: dich_vu / khac → return all active suppliers
  if (ledgerType === "all") {
    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ suppliers });
  }

  // material: suppliers with a ledger transaction or an opening balance at the pair
  const projectIdParam: number | null =
    projectId !== null && Number.isFinite(projectId) ? projectId : null;

  const rows = await prisma.$queryRaw<SupplierRow[]>`
    SELECT s.id, s.name
    FROM suppliers s
    WHERE s."deletedAt" IS NULL
      AND (${supplierKind}::text IS NULL OR s."kind" = ${supplierKind}::text)
      AND s.id IN (
        SELECT lt."partyId"
        FROM ledger_transactions lt
        WHERE lt."ledgerType" = ${ledgerType}
          AND lt."entityId" = ${entityId}
          AND (${projectIdParam}::int IS NULL OR lt."projectId" = ${projectIdParam})
          AND lt."deletedAt" IS NULL
        UNION
        SELECT ob."partyId"
        FROM ledger_opening_balances ob
        WHERE ob."ledgerType" = ${ledgerType}
          AND ob."entityId" = ${entityId}
          AND (${projectIdParam}::int IS NULL OR ob."projectId" = ${projectIdParam})
      )
    ORDER BY s.name
  `;

  return NextResponse.json({ suppliers: rows });
}
