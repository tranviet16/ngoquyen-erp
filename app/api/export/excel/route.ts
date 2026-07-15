/**
 * POST /api/export/excel
 * Body: { template: string, params: Record<string, unknown> }
 * Returns: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *
 * Supported templates:
 *   - cong-no-monthly: { ledgerType, year, month, entityId }
 *   - doi-chieu: { ledgerType, entityId?, partyId?, projectId? }
 *   - du-toan: { projectId }
 *   - sl-dt: { year, month?, projectId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccess } from "@/lib/acl";
import type { ModuleKey } from "@/lib/acl";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";
import { buildCongNoMonthlyExcel } from "@/lib/export/templates/cong-no-monthly";
import { buildDoiChieuExcel } from "@/lib/export/templates/doi-chieu";
import { buildDuToanExcel } from "@/lib/export/templates/du-toan";
import { buildSlDtExcel } from "@/lib/export/templates/sl-dt";
import type { LedgerType } from "@/lib/ledger/ledger-types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth check
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { template: string; params: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { template, params } = body;
  if (!template || typeof template !== "string") {
    return NextResponse.json({ error: "template is required" }, { status: 400 });
  }
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return NextResponse.json({ error: "params must be an object" }, { status: 400 });
  }

  const moduleByTemplate: Record<string, ModuleKey> = {
    "cong-no-monthly": String(params.ledgerType ?? "material") === "labor" ? "cong-no-nc" : "cong-no-vt",
    "doi-chieu": String(params.ledgerType ?? "material") === "labor" ? "cong-no-nc" : "cong-no-vt",
    "du-toan": "du-an",
    "sl-dt": "sl-dt",
  };
  const moduleKey = moduleByTemplate[template];
  if (!moduleKey) return NextResponse.json({ error: "Unknown template" }, { status: 400 });
  const allowed = await canAccess(session.user.id, moduleKey, { minLevel: "read", scope: "module" });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (template === "cong-no-monthly" || template === "doi-chieu" || template === "sl-dt") {
    const actor = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (!isAdmin(actor?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let buffer: Buffer;
  let filename: string;

  try {
    switch (template) {
      case "cong-no-monthly": {
        const ledgerType = String(params.ledgerType ?? "material") as LedgerType;
        const year = Number(params.year ?? new Date().getFullYear());
        const month = Number(params.month);
        const entityId = Number(params.entityId);
        if (!Number.isFinite(month) || month < 1 || month > 12) {
          return NextResponse.json({ error: "month required (1-12)" }, { status: 400 });
        }
        if (!Number.isFinite(entityId) || entityId <= 0) {
          return NextResponse.json({ error: "entityId required" }, { status: 400 });
        }
        buffer = await buildCongNoMonthlyExcel(ledgerType, year, month, entityId);
        const slug = ledgerType === "material" ? "vt" : "nc";
        filename = `bao-cao-thang-${slug}-${entityId}-${String(month).padStart(2, "0")}-${year}.xlsx`;
        break;
      }
      case "doi-chieu": {
        const ledgerType = String(params.ledgerType ?? "material") as LedgerType;
        buffer = await buildDoiChieuExcel(ledgerType, {
          entityId: params.entityId ? Number(params.entityId) : undefined,
          partyId: params.partyId ? Number(params.partyId) : undefined,
          projectId: params.projectId ? Number(params.projectId) : undefined,
        });
        filename = `doi-chieu-${ledgerType}.xlsx`;
        break;
      }
      case "du-toan": {
        const projectId = Number(params.projectId);
        if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
        const projectAllowed = await canAccess(session.user.id, "du-an", {
          minLevel: "read",
          scope: { kind: "project", projectId },
        });
        if (!projectAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        buffer = await buildDuToanExcel(projectId);
        filename = `du-toan-da${projectId}.xlsx`;
        break;
      }
      case "sl-dt": {
        const year = Number(params.year ?? new Date().getFullYear());
        buffer = await buildSlDtExcel({
          year,
          month: params.month ? Number(params.month) : undefined,
          projectId: params.projectId ? Number(params.projectId) : undefined,
        });
        filename = `sl-dt-${year}.xlsx`;
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown template: ${template}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[export/excel] Error generating workbook:", err);
    return NextResponse.json({ error: "Export failed", detail: String(err) }, { status: 500 });
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
