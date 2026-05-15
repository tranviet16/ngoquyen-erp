import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/thanh-toan/cascade-suppliers
 * Query params:
 *   ledgerType: "material" | "labor" | "all" (required)
 *   entityId: int > 0 (required)
 *   projectId: int (optional)
 *
 * Returns distinct suppliers that have ledger transactions for the given
 * (entityId, projectId?, ledgerType) triple.
 *
 * Special cases:
 *   ledgerType=labor  → short-circuit [] (labor ledger uses Contractor, not Supplier)
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

  const { searchParams } = req.nextUrl;
  const ledgerType = searchParams.get("ledgerType");
  const entityIdRaw = searchParams.get("entityId");
  const projectIdRaw = searchParams.get("projectId");

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

  // material: distinct suppliers via ledger_transactions join
  const projectIdParam: number | null =
    projectId !== null && Number.isFinite(projectId) ? projectId : null;

  const rows = await prisma.$queryRaw<SupplierRow[]>`
    SELECT DISTINCT s.id, s.name
    FROM ledger_transactions lt
    JOIN suppliers s ON s.id = lt."partyId"
    WHERE lt."ledgerType" = ${ledgerType}
      AND lt."entityId" = ${entityId}
      AND (${projectIdParam}::int IS NULL OR lt."projectId" = ${projectIdParam})
      AND lt."deletedAt" IS NULL
      AND s."deletedAt" IS NULL
    ORDER BY s.name
  `;

  return NextResponse.json({ suppliers: rows });
}
