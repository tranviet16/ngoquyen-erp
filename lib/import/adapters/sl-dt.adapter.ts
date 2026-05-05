/**
 * Adapter: SL - DT 2025.xlsx → sl_dt_targets + payment_schedules
 *
 * Sheet 1 "Chỉ tiêu":   Project | Year | Month | SL Target | DT Target | Note
 *   → INSERT INTO sl_dt_targets, idempotent on (projectId, year, month)
 * Sheet 2 "Tiến độ nộp tiền": Project | Đợt | Ngày KH | Số tiền KH | Ngày TH | Số tiền TH | Note
 *   → INSERT INTO payment_schedules, idempotent on (projectId, batch)
 */

import * as XLSX from "xlsx";
import { resolveProject } from "../conflict-resolver";
import { parseExcelDate, num } from "./excel-utils";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ConflictItem,
  ResolvedMapping,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";

const SHEET_TARGETS = "Chỉ tiêu";
const SHEET_PAYMENTS = "Tiến độ nộp tiền";

function findSheet(wb: XLSX.WorkBook, hint: string): string | null {
  const lower = hint.toLowerCase();
  return wb.SheetNames.find((n) => n.toLowerCase().includes(lower.split(" ")[0])) ?? null;
}

export const SlDtAdapter: ImportAdapter = {
  name: "sl-dt",
  label: "SL - DT 2025",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    const projectNames = new Set<string>();

    const targetsSheet = findSheet(wb, SHEET_TARGETS) ?? wb.SheetNames[0];
    const paymentsSheet = findSheet(wb, SHEET_PAYMENTS) ?? wb.SheetNames[1] ?? null;

    if (targetsSheet && wb.Sheets[targetsSheet]) {
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[targetsSheet], {
        defval: null,
        raw: false,
      });
      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        const projectName = String(r["Dự án"] ?? r["Project"] ?? r["Du an"] ?? "").trim();
        if (!projectName) continue;
        projectNames.add(projectName);
        rows.push({
          rowIndex: rows.length,
          data: {
            kind: "target",
            projectName,
            year: parseInt(String(r["Năm"] ?? r["Year"] ?? "0"), 10) || 0,
            month: parseInt(String(r["Tháng"] ?? r["Month"] ?? "0"), 10) || 0,
            slTarget: num(r["SL"] ?? r["SL Target"] ?? r["Sản lượng"]),
            dtTarget: num(r["DT"] ?? r["DT Target"] ?? r["Doanh thu"]),
            note: String(r["Ghi chú"] ?? r["Note"] ?? "").trim() || undefined,
          },
        });
      }
    }

    if (paymentsSheet && wb.Sheets[paymentsSheet]) {
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[paymentsSheet], {
        defval: null,
        raw: false,
      });
      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        const projectName = String(r["Dự án"] ?? r["Project"] ?? r["Du an"] ?? "").trim();
        if (!projectName) continue;
        projectNames.add(projectName);
        rows.push({
          rowIndex: rows.length,
          data: {
            kind: "payment",
            projectName,
            batch: String(r["Đợt"] ?? r["Batch"] ?? "").trim(),
            planDate: r["Ngày KH"] ?? r["Ngày kế hoạch"] ?? r["PlanDate"] ?? null,
            planAmount: num(r["Số tiền KH"] ?? r["Tiền KH"] ?? r["PlanAmount"]),
            actualDate: r["Ngày TH"] ?? r["Ngày thực hiện"] ?? r["ActualDate"] ?? null,
            actualAmount: num(r["Số tiền TH"] ?? r["Tiền TH"] ?? r["ActualAmount"]),
            note: String(r["Ghi chú"] ?? r["Note"] ?? "").trim() || undefined,
          },
        });
      }
    }

    const conflicts: ConflictItem[] = [];
    for (const name of projectNames) conflicts.push(await resolveProject(name));
    return { rows, conflicts, meta: { targetsSheet, paymentsSheet } };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      if (row.data.kind === "target") {
        const y = Number(row.data.year);
        const m = Number(row.data.month);
        if (y < 2000 || y > 2100) errors.push({ rowIndex: row.rowIndex, field: "year", message: "Năm không hợp lệ" });
        if (m < 1 || m > 12) errors.push({ rowIndex: row.rowIndex, field: "month", message: "Tháng phải 1–12" });
      } else if (row.data.kind === "payment") {
        if (!row.data.batch) errors.push({ rowIndex: row.rowIndex, field: "batch", message: "Thiếu Đợt" });
        if (!parseExcelDate(row.data.planDate)) errors.push({ rowIndex: row.rowIndex, field: "planDate", message: "Ngày KH không hợp lệ" });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, mapping, tx, _importRunId): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    type Tx = typeof import("@/lib/prisma")["prisma"];
    const db = tx as Tx;

    for (const row of data.rows) {
      try {
        const projectName = String(row.data.projectName ?? "");
        const projectId = mapping[`project:${projectName}`];
        if (!projectId) {
          skipped++;
          continue;
        }

        if (row.data.kind === "target") {
          const year = Number(row.data.year);
          const month = Number(row.data.month);
          const existing = await db.$queryRaw<{ id: number }[]>`
            SELECT id FROM sl_dt_targets
            WHERE "projectId" = ${projectId} AND year = ${year} AND month = ${month}
            LIMIT 1
          `;
          if (existing.length > 0) {
            skipped++;
            continue;
          }
          await db.$executeRaw`
            INSERT INTO sl_dt_targets
              ("projectId", year, month, "slTarget", "dtTarget", note, "createdAt", "updatedAt")
            VALUES
              (${projectId}, ${year}, ${month},
               ${Number(row.data.slTarget ?? 0)}, ${Number(row.data.dtTarget ?? 0)},
               ${row.data.note ? String(row.data.note) : null},
               NOW(), NOW())
          `;
          imported++;
          continue;
        }

        // payment schedule
        const batch = String(row.data.batch ?? "");
        const planDate = parseExcelDate(row.data.planDate);
        if (!planDate) {
          errors.push({ rowIndex: row.rowIndex, message: "Ngày KH không hợp lệ, bỏ qua" });
          skipped++;
          continue;
        }
        const existing = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM payment_schedules
          WHERE "projectId" = ${projectId} AND batch = ${batch} AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        const actualDate = parseExcelDate(row.data.actualDate);
        const actualAmount = Number(row.data.actualAmount ?? 0);
        const status = actualDate && actualAmount > 0 ? "paid" : "pending";

        await db.$executeRaw`
          INSERT INTO payment_schedules
            ("projectId", batch, "planDate", "planAmount", "actualDate", "actualAmount",
             status, note, "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${batch}, ${planDate}, ${Number(row.data.planAmount ?? 0)},
             ${actualDate}, ${actualAmount > 0 ? actualAmount : null},
             ${status}, ${row.data.note ? String(row.data.note) : null},
             NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
