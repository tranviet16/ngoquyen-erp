import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccess } from "@/lib/acl";
import type { ModuleKey } from "@/lib/acl";

/**
 * GET /api/cong-no/cascade-projects
 * Query params:
 *   ledgerType: "material" | "labor"
 *   entityIds: comma-separated ints (optional — omit for all projects)
 *
 * Returns distinct projects that appear in ledger_transactions or
 * ledger_opening_balances for the given ledgerType + entityIds.
 *
 * Auth: valid session required (401 if absent).
 *       Module access required: any of cong-no-vt, cong-no-nc,
 *       or thanh-toan.ke-hoach (403 if all denied).
 */

interface ProjectIdRow {
  project_id: number | null;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const ledgerType = searchParams.get("ledgerType");
  const entityIdsRaw = searchParams.get("entityIds");

  if (!ledgerType || (ledgerType !== "material" && ledgerType !== "labor")) {
    return NextResponse.json(
      { error: "Invalid ledgerType. Must be 'material' or 'labor'." },
      { status: 400 }
    );
  }

  // ACL: accept any of the three modules — cong-no users OR payment plan users
  const accessOpts = { minLevel: "read" as const, scope: "module" as const };
  const [allowedDebt, allowedLabor, allowedPayment] = await Promise.all([
    canAccess(session.user.id, "cong-no-vt" as ModuleKey, accessOpts),
    canAccess(session.user.id, "cong-no-nc" as ModuleKey, accessOpts),
    canAccess(session.user.id, "thanh-toan.ke-hoach" as ModuleKey, accessOpts),
  ]);
  if (!allowedDebt && !allowedLabor && !allowedPayment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entityIds: number[] =
    entityIdsRaw
      ?.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0) ?? [];

  const entityIdsArr = entityIds.length > 0 ? entityIds : null;

  // Distinct projectIds from both transactions and opening balances
  const projectIdRows = await prisma.$queryRaw<ProjectIdRow[]>`
    SELECT DISTINCT "projectId" AS project_id
    FROM ledger_transactions
    WHERE "ledgerType" = ${ledgerType}
      AND "deletedAt" IS NULL
      AND "projectId" IS NOT NULL
      AND (${entityIdsArr}::int[] IS NULL OR "entityId" = ANY(${entityIdsArr}::int[]))

    UNION

    SELECT DISTINCT "projectId" AS project_id
    FROM ledger_opening_balances
    WHERE "ledgerType" = ${ledgerType}
      AND "projectId" IS NOT NULL
      AND (${entityIdsArr}::int[] IS NULL OR "entityId" = ANY(${entityIdsArr}::int[]))
  `;

  const ids = projectIdRows
    .map((r) => r.project_id)
    .filter((id): id is number => id != null);

  if (ids.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ projects });
}
