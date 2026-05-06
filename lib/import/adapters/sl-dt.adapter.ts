/**
 * Adapter: SL - DT 2025.xlsx → sl_dt_lots + sl_dt_monthly_inputs +
 *  sl_dt_progress_statuses + sl_dt_payment_plans + sl_dt_milestone_scores.
 *
 * Phase 3 rewrite — independent SL-DT module. Only INPUTS are imported;
 * compute cols (H,I,J,K of sản lượng; H,L,M,N,O,P,Q of doanh thu; L,O of
 * chỉ tiêu) are derived at read-time by the report service.
 *
 * Idempotent: re-import overwrites monthly_inputs / progress_statuses /
 * payment_plans by their unique keys; lots are upserted by `code`.
 */

import * as XLSX from "xlsx";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";
import {
  classifySheet,
  normalizeLotCode,
  parseCauHinh,
  parseChiTieu,
  parseDoanhThu,
  parseMonthSheetName,
  parseSanLuong,
  parseTienDoNopTien,
  parseTienDoXd,
  readMatrix,
} from "./sl-dt-sheet-parsers";

export const SlDtAdapter: ImportAdapter = {
  name: "sl-dt",
  label: "SL - DT 2025",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    const meta: Record<string, number> = {
      san_luong: 0, doanh_thu: 0, chi_tieu: 0, tien_do_xd: 0,
      tien_do_nop_tien: 0, cau_hinh: 0,
    };

    for (const sheetName of wb.SheetNames) {
      const cat = classifySheet(sheetName);
      if (!cat) continue;
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const matrix = readMatrix(sheet);
      let parsed: { kind: string; data: Record<string, unknown> }[] = [];
      if (cat === "cau_hinh") {
        parsed = parseCauHinh(matrix);
      } else if (cat === "tien_do_nop_tien") {
        parsed = parseTienDoNopTien(matrix);
      } else if (cat === "tien_do_xd") {
        const ym = parseMonthSheetName(sheetName);
        if (!ym) continue;
        parsed = parseTienDoXd(matrix, ym.year, ym.month);
      } else {
        const ym = parseMonthSheetName(sheetName);
        if (!ym) continue;
        if (cat === "san_luong") parsed = parseSanLuong(matrix, ym.year, ym.month);
        else if (cat === "doanh_thu") parsed = parseDoanhThu(matrix, ym.year, ym.month);
        else if (cat === "chi_tieu") parsed = parseChiTieu(matrix, ym.year, ym.month);
      }
      meta[cat] += 1;
      for (const p of parsed) {
        rows.push({ rowIndex: rows.length, data: { ...p.data, kind: p.kind } });
      }
    }

    return { rows, conflicts: [], meta };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      const k = row.data.kind;
      if (k === "monthly_input_sl" || k === "monthly_input_dt" || k === "progress_status" || k === "tien_do_xd") {
        const y = Number(row.data.year);
        const m = Number(row.data.month);
        if (y < 2000 || y > 2100) errors.push({ rowIndex: row.rowIndex, field: "year", message: "Năm không hợp lệ" });
        if (m < 1 || m > 12) errors.push({ rowIndex: row.rowIndex, field: "month", message: "Tháng phải 1–12" });
      }
      if (k === "milestone_score") {
        if (!row.data.milestoneText) errors.push({ rowIndex: row.rowIndex, field: "milestoneText", message: "Thiếu mốc" });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, _mapping, tx, importRunId): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    type Tx = typeof import("@/lib/prisma")["prisma"];
    const db = tx as Tx;

    // 1. Milestone scores (CauHinh)
    for (const row of data.rows.filter((r) => r.data.kind === "milestone_score")) {
      try {
        const text = String(row.data.milestoneText);
        const score = Number(row.data.score);
        const order = Number(row.data.sortOrder);
        await db.$executeRaw`
          INSERT INTO sl_dt_milestone_scores ("milestoneText", score, "sortOrder", "createdAt", "updatedAt")
          VALUES (${text}, ${score}, ${order}, NOW(), NOW())
          ON CONFLICT ("milestoneText") DO UPDATE
            SET score = EXCLUDED.score, "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = NOW()
        `;
        imported++;
      } catch (e) { errors.push({ rowIndex: row.rowIndex, message: String(e) }); }
    }

    // 2. Lot meta — collapse by lotName, prefer sản_luong source for hierarchy/estimate
    const lotMetaByName = new Map<string, Record<string, unknown>>();
    for (const row of data.rows.filter((r) => r.data.kind === "lot_meta")) {
      const name = normalizeLotCode(row.data.lotName);
      if (!name) continue;
      const cur = lotMetaByName.get(name) ?? {};
      // sản_luong wins for phaseCode/groupCode/sortOrder/estimateValue
      if (row.data.source === "san_luong") {
        cur.phaseCode = row.data.phaseCode;
        cur.groupCode = row.data.groupCode;
        cur.sortOrder = row.data.sortOrder;
        cur.estimateValue = row.data.estimateValue;
      }
      // doanh_thu provides contractValue
      if (row.data.source === "doanh_thu" && row.data.contractValue != null) {
        cur.contractValue = row.data.contractValue;
      }
      lotMetaByName.set(name, cur);
    }

    const lotIdByName = new Map<string, number>();
    for (const [name, m] of lotMetaByName) {
      try {
        const phaseCode = String(m.phaseCode ?? "?");
        const groupCode = String(m.groupCode ?? "?");
        const sortOrder = Number(m.sortOrder ?? 0);
        const estimateValue = Number(m.estimateValue ?? 0);
        const contractValue = m.contractValue != null ? Number(m.contractValue) : null;
        const result = await db.$queryRaw<{ id: number }[]>`
          INSERT INTO sl_dt_lots (code, "lotName", "phaseCode", "groupCode", "sortOrder", "estimateValue", "contractValue", "createdAt", "updatedAt")
          VALUES (${name}, ${name}, ${phaseCode}, ${groupCode}, ${sortOrder}, ${estimateValue}, ${contractValue}, NOW(), NOW())
          ON CONFLICT (code) DO UPDATE
            SET "phaseCode" = EXCLUDED."phaseCode",
                "groupCode" = EXCLUDED."groupCode",
                "sortOrder" = EXCLUDED."sortOrder",
                "estimateValue" = EXCLUDED."estimateValue",
                "contractValue" = COALESCE(EXCLUDED."contractValue", sl_dt_lots."contractValue"),
                "updatedAt" = NOW()
          RETURNING id
        `;
        lotIdByName.set(name, result[0].id);
        imported++;
      } catch (e) { errors.push({ rowIndex: 0, message: `lot ${name}: ${e}` }); }
    }

    const resolveLotId = (lotName: unknown): number | null => {
      const k = normalizeLotCode(lotName);
      return lotIdByName.get(k) ?? null;
    };

    // 3. Payment plans
    for (const row of data.rows.filter((r) => r.data.kind === "payment_plan")) {
      try {
        const lotId = resolveLotId(row.data.lotName);
        if (!lotId) { skipped++; continue; }
        await db.$executeRaw`
          INSERT INTO sl_dt_payment_plans ("lotId", "dot1Amount", "dot1Milestone", "dot2Amount", "dot2Milestone", "dot3Amount", "dot3Milestone", "dot4Amount", "dot4Milestone", "createdAt", "updatedAt")
          VALUES (${lotId},
            ${Number(row.data.dot1Amount ?? 0)}, ${row.data.dot1Milestone as string | null},
            ${Number(row.data.dot2Amount ?? 0)}, ${row.data.dot2Milestone as string | null},
            ${Number(row.data.dot3Amount ?? 0)}, ${row.data.dot3Milestone as string | null},
            ${Number(row.data.dot4Amount ?? 0)}, ${row.data.dot4Milestone as string | null},
            NOW(), NOW())
          ON CONFLICT ("lotId") DO UPDATE
            SET "dot1Amount" = EXCLUDED."dot1Amount", "dot1Milestone" = EXCLUDED."dot1Milestone",
                "dot2Amount" = EXCLUDED."dot2Amount", "dot2Milestone" = EXCLUDED."dot2Milestone",
                "dot3Amount" = EXCLUDED."dot3Amount", "dot3Milestone" = EXCLUDED."dot3Milestone",
                "dot4Amount" = EXCLUDED."dot4Amount", "dot4Milestone" = EXCLUDED."dot4Milestone",
                "updatedAt" = NOW()
        `;
        imported++;
      } catch (e) { errors.push({ rowIndex: row.rowIndex, message: String(e) }); }
    }

    // 4. Monthly inputs — merge SL + DT by (lotId, year, month)
    type MonthlyKey = string;
    const inputs = new Map<MonthlyKey, Record<string, number | null>>();
    const ym = (lotId: number, y: number, m: number): MonthlyKey => `${lotId}|${y}|${m}`;
    for (const row of data.rows) {
      if (row.data.kind !== "monthly_input_sl" && row.data.kind !== "monthly_input_dt") continue;
      const lotId = resolveLotId(row.data.lotName);
      if (!lotId) { skipped++; continue; }
      const y = Number(row.data.year), mo = Number(row.data.month);
      const key = ym(lotId, y, mo);
      const cur = inputs.get(key) ?? { lotId, year: y, month: mo };
      if (row.data.kind === "monthly_input_sl") {
        cur.slKeHoachKy = Number(row.data.slKeHoachKy ?? 0);
        cur.slThucKyTho = Number(row.data.slThucKyTho ?? 0);
        cur.slLuyKeTho = Number(row.data.slLuyKeTho ?? 0);
        cur.slTrat = Number(row.data.slTrat ?? 0);
      } else {
        cur.dtKeHoachKy = Number(row.data.dtKeHoachKy ?? 0);
        cur.dtThoKy = Number(row.data.dtThoKy ?? 0);
        cur.dtThoLuyKe = Number(row.data.dtThoLuyKe ?? 0);
        cur.qtTratChua = Number(row.data.qtTratChua ?? 0);
        cur.dtTratKy = Number(row.data.dtTratKy ?? 0);
        cur.dtTratLuyKe = Number(row.data.dtTratLuyKe ?? 0);
      }
      inputs.set(key, cur);
    }
    for (const cur of inputs.values()) {
      try {
        await db.$executeRaw`
          INSERT INTO sl_dt_monthly_inputs ("lotId", year, month,
            "slKeHoachKy", "slThucKyTho", "slLuyKeTho", "slTrat",
            "dtKeHoachKy", "dtThoKy", "dtThoLuyKe", "qtTratChua", "dtTratKy", "dtTratLuyKe",
            "createdAt", "updatedAt")
          VALUES (${cur.lotId}, ${cur.year}, ${cur.month},
            ${cur.slKeHoachKy ?? 0}, ${cur.slThucKyTho ?? 0}, ${cur.slLuyKeTho ?? 0}, ${cur.slTrat ?? 0},
            ${cur.dtKeHoachKy ?? 0}, ${cur.dtThoKy ?? 0}, ${cur.dtThoLuyKe ?? 0},
            ${cur.qtTratChua ?? 0}, ${cur.dtTratKy ?? 0}, ${cur.dtTratLuyKe ?? 0},
            NOW(), NOW())
          ON CONFLICT ("lotId", year, month) DO UPDATE
            SET "slKeHoachKy" = EXCLUDED."slKeHoachKy", "slThucKyTho" = EXCLUDED."slThucKyTho",
                "slLuyKeTho" = EXCLUDED."slLuyKeTho", "slTrat" = EXCLUDED."slTrat",
                "dtKeHoachKy" = EXCLUDED."dtKeHoachKy", "dtThoKy" = EXCLUDED."dtThoKy",
                "dtThoLuyKe" = EXCLUDED."dtThoLuyKe", "qtTratChua" = EXCLUDED."qtTratChua",
                "dtTratKy" = EXCLUDED."dtTratKy", "dtTratLuyKe" = EXCLUDED."dtTratLuyKe",
                "updatedAt" = NOW()
        `;
        imported++;
      } catch (e) { errors.push({ rowIndex: 0, message: `monthly_input ${cur.lotId}/${cur.year}/${cur.month}: ${e}` }); }
    }

    // 5. Progress status — merge chỉ_tiêu + tien_do_xd by (lotId, year, month)
    const statuses = new Map<MonthlyKey, Record<string, unknown>>();
    for (const row of data.rows) {
      if (row.data.kind !== "progress_status" && row.data.kind !== "tien_do_xd") continue;
      const lotId = resolveLotId(row.data.lotName);
      if (!lotId) { skipped++; continue; }
      const y = Number(row.data.year), mo = Number(row.data.month);
      const key = ym(lotId, y, mo);
      const cur = statuses.get(key) ?? { lotId, year: y, month: mo };
      for (const k of ["milestoneText", "settlementStatus", "khungBtct", "xayTuong", "tratNgoai", "xayTho", "tratHoanThien", "hoSoQuyetToan"] as const) {
        if (row.data[k] != null) cur[k] = row.data[k];
      }
      statuses.set(key, cur);
    }
    for (const cur of statuses.values()) {
      try {
        await db.$executeRaw`
          INSERT INTO sl_dt_progress_statuses ("lotId", year, month,
            "milestoneText", "settlementStatus",
            "khungBtct", "xayTuong", "tratNgoai", "xayTho", "tratHoanThien", "hoSoQuyetToan",
            "createdAt", "updatedAt")
          VALUES (${cur.lotId as number}, ${cur.year as number}, ${cur.month as number},
            ${(cur.milestoneText as string) ?? null}, ${(cur.settlementStatus as string) ?? null},
            ${(cur.khungBtct as string) ?? null}, ${(cur.xayTuong as string) ?? null},
            ${(cur.tratNgoai as string) ?? null}, ${(cur.xayTho as string) ?? null},
            ${(cur.tratHoanThien as string) ?? null}, ${(cur.hoSoQuyetToan as string) ?? null},
            NOW(), NOW())
          ON CONFLICT ("lotId", year, month) DO UPDATE
            SET "milestoneText" = COALESCE(EXCLUDED."milestoneText", sl_dt_progress_statuses."milestoneText"),
                "settlementStatus" = COALESCE(EXCLUDED."settlementStatus", sl_dt_progress_statuses."settlementStatus"),
                "khungBtct" = COALESCE(EXCLUDED."khungBtct", sl_dt_progress_statuses."khungBtct"),
                "xayTuong" = COALESCE(EXCLUDED."xayTuong", sl_dt_progress_statuses."xayTuong"),
                "tratNgoai" = COALESCE(EXCLUDED."tratNgoai", sl_dt_progress_statuses."tratNgoai"),
                "xayTho" = COALESCE(EXCLUDED."xayTho", sl_dt_progress_statuses."xayTho"),
                "tratHoanThien" = COALESCE(EXCLUDED."tratHoanThien", sl_dt_progress_statuses."tratHoanThien"),
                "hoSoQuyetToan" = COALESCE(EXCLUDED."hoSoQuyetToan", sl_dt_progress_statuses."hoSoQuyetToan"),
                "updatedAt" = NOW()
        `;
        imported++;
      } catch (e) { errors.push({ rowIndex: 0, message: `progress ${(cur.lotId as number)}/${cur.year}/${cur.month}: ${e}` }); }
    }

    void importRunId; // SL-DT idempotent upserts — no per-run rollback (overwrites latest)
    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
