import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlDtReportRow {
  projectId: number;
  year: number;
  month: number;
  slTarget: Prisma.Decimal;
  dtTarget: Prisma.Decimal;
  slActual: Prisma.Decimal;
  dtActual: Prisma.Decimal;
  slPct: number | null; // % hoàn thành SL (null if target=0)
  dtPct: number | null; // % hoàn thành DT
  slDiff: Prisma.Decimal; // actual - target
  dtDiff: Prisma.Decimal;
}

export interface PaymentScheduleSummary {
  id: number;
  projectId: number;
  batch: string;
  planDate: Date;
  planAmount: Prisma.Decimal;
  actualDate: Date | null;
  actualAmount: Prisma.Decimal | null;
  status: string;
  note: string | null;
  isOverdue: boolean;
}

// ─── Actual view row ──────────────────────────────────────────────────────────

interface ActualViewRow {
  project_id: number;
  year: number;
  month: number;
  sl_actual: Prisma.Decimal;
  dt_actual: Prisma.Decimal;
}

// ─── Report: target vs actual ─────────────────────────────────────────────────

export async function getSlDtReport(filter: {
  year?: number;
  month?: number;
  projectId?: number;
}): Promise<SlDtReportRow[]> {
  const yearCond = filter.year
    ? Prisma.sql`AND t."year" = ${filter.year}`
    : Prisma.empty;
  const monthCond = filter.month
    ? Prisma.sql`AND t."month" = ${filter.month}`
    : Prisma.empty;
  const projectCond = filter.projectId
    ? Prisma.sql`AND t."projectId" = ${filter.projectId}`
    : Prisma.empty;

  // Join targets with actual view
  const rows = await prisma.$queryRaw<
    {
      project_id: number;
      year: number;
      month: number;
      sl_target: Prisma.Decimal;
      dt_target: Prisma.Decimal;
      sl_actual: Prisma.Decimal;
      dt_actual: Prisma.Decimal;
    }[]
  >`
    SELECT
      t."projectId"  AS project_id,
      t."year"       AS year,
      t."month"      AS month,
      t."slTarget"   AS sl_target,
      t."dtTarget"   AS dt_target,
      COALESCE(v.sl_actual, 0) AS sl_actual,
      COALESCE(v.dt_actual, 0) AS dt_actual
    FROM sl_dt_targets t
    LEFT JOIN vw_sl_dt_actual v
      ON v.project_id = t."projectId"
      AND v.year  = t."year"
      AND v.month = t."month"
    WHERE 1=1
      ${yearCond}
      ${monthCond}
      ${projectCond}
    ORDER BY t."projectId", t."year", t."month"
  `;

  return rows.map((r) => {
    const slTarget = new Prisma.Decimal(r.sl_target);
    const dtTarget = new Prisma.Decimal(r.dt_target);
    const slActual = new Prisma.Decimal(r.sl_actual);
    const dtActual = new Prisma.Decimal(r.dt_actual);
    const slPct = slTarget.isZero()
      ? null
      : slActual.div(slTarget).toNumber();
    const dtPct = dtTarget.isZero()
      ? null
      : dtActual.div(dtTarget).toNumber();
    return {
      projectId: Number(r.project_id),
      year: Number(r.year),
      month: Number(r.month),
      slTarget,
      dtTarget,
      slActual,
      dtActual,
      slPct,
      dtPct,
      slDiff: slActual.minus(slTarget),
      dtDiff: dtActual.minus(dtTarget),
    };
  });
}

// ─── Summary: aggregate per project across months ─────────────────────────────

export interface SlDtSummaryRow {
  projectId: number;
  slTarget: Prisma.Decimal;
  dtTarget: Prisma.Decimal;
  slActual: Prisma.Decimal;
  dtActual: Prisma.Decimal;
  slPct: number | null;
  dtPct: number | null;
}

export async function getSlDtSummary(year: number): Promise<SlDtSummaryRow[]> {
  const rows = await prisma.$queryRaw<
    {
      project_id: number;
      sl_target: Prisma.Decimal;
      dt_target: Prisma.Decimal;
      sl_actual: Prisma.Decimal;
      dt_actual: Prisma.Decimal;
    }[]
  >`
    SELECT
      t."projectId"            AS project_id,
      SUM(t."slTarget")        AS sl_target,
      SUM(t."dtTarget")        AS dt_target,
      COALESCE(SUM(v.sl_actual), 0) AS sl_actual,
      COALESCE(SUM(v.dt_actual), 0) AS dt_actual
    FROM sl_dt_targets t
    LEFT JOIN vw_sl_dt_actual v
      ON v.project_id = t."projectId"
      AND v.year  = t."year"
      AND v.month = t."month"
    WHERE t."year" = ${year}
    GROUP BY t."projectId"
    ORDER BY t."projectId"
  `;

  return rows.map((r) => {
    const slTarget = new Prisma.Decimal(r.sl_target);
    const dtTarget = new Prisma.Decimal(r.dt_target);
    const slActual = new Prisma.Decimal(r.sl_actual);
    const dtActual = new Prisma.Decimal(r.dt_actual);
    return {
      projectId: Number(r.project_id),
      slTarget,
      dtTarget,
      slActual,
      dtActual,
      slPct: slTarget.isZero() ? null : slActual.div(slTarget).toNumber(),
      dtPct: dtTarget.isZero() ? null : dtActual.div(dtTarget).toNumber(),
    };
  });
}

// ─── Tiến độ XD: % hoàn thành per project per month ─────────────────────────

export interface TienDoXdRow {
  projectId: number;
  year: number;
  month: number;
  avgPctComplete: number; // average pctComplete across tasks in the month
}

export async function getTienDoXd(filter: {
  year: number;
  projectId?: number;
}): Promise<TienDoXdRow[]> {
  const projectCond = filter.projectId
    ? Prisma.sql`AND "projectId" = ${filter.projectId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      project_id: number;
      year: number;
      month: number;
      avg_pct: number;
    }[]
  >`
    SELECT
      "projectId"                                   AS project_id,
      EXTRACT(YEAR  FROM "planEnd")::int            AS year,
      EXTRACT(MONTH FROM "planEnd")::int            AS month,
      AVG("pctComplete")                            AS avg_pct
    FROM project_schedules
    WHERE "deletedAt" IS NULL
      AND EXTRACT(YEAR FROM "planEnd") = ${filter.year}
      ${projectCond}
    GROUP BY "projectId",
             EXTRACT(YEAR  FROM "planEnd"),
             EXTRACT(MONTH FROM "planEnd")
    ORDER BY project_id, year, month
  `;

  return rows.map((r) => ({
    projectId: Number(r.project_id),
    year: Number(r.year),
    month: Number(r.month),
    avgPctComplete: Number(r.avg_pct),
  }));
}

// ─── Payment schedule with overdue detection ──────────────────────────────────

export async function getPaymentScheduleSummary(
  projectId?: number
): Promise<PaymentScheduleSummary[]> {
  const records = await prisma.paymentSchedule.findMany({
    where: { deletedAt: null, ...(projectId ? { projectId } : {}) },
    orderBy: [{ projectId: "asc" }, { planDate: "asc" }],
  });

  const now = new Date();
  return records.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    batch: r.batch,
    planDate: r.planDate,
    planAmount: r.planAmount,
    actualDate: r.actualDate,
    actualAmount: r.actualAmount,
    status: r.status,
    note: r.note,
    isOverdue: r.status !== "paid" && r.planDate < now,
  }));
}

// ─── Actuals only (for bao-cao pages) ────────────────────────────────────────

export async function getSlDtActuals(filter: {
  year?: number;
  projectId?: number;
}): Promise<ActualViewRow[]> {
  const yearCond = filter.year
    ? Prisma.sql`AND year = ${filter.year}`
    : Prisma.empty;
  const projectCond = filter.projectId
    ? Prisma.sql`AND project_id = ${filter.projectId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<ActualViewRow[]>`
    SELECT project_id, year, month, sl_actual, dt_actual
    FROM vw_sl_dt_actual
    WHERE 1=1
      ${yearCond}
      ${projectCond}
    ORDER BY project_id, year, month
  `;

  return rows.map((r) => ({
    project_id: Number(r.project_id),
    year: Number(r.year),
    month: Number(r.month),
    sl_actual: new Prisma.Decimal(r.sl_actual),
    dt_actual: new Prisma.Decimal(r.dt_actual),
  }));
}
