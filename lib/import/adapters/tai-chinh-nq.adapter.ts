/**
 * Adapter: Hệ thống quản lý tài chính NQ.xlsx
 * Target tables:
 *   - loan_contracts (sheet "Hợp đồng vay" — header row 0)
 *   - journal_entries (sheet "Sổ nhật ký giao dịch" — header row 0)
 *   - expense_categories (auto-create from "Loại cụ thể" column on demand)
 *
 * Loan rows: skip when "Mã hợp đồng" is empty (template rows). Idempotency via
 * (lenderName, startDate, principalVnd).
 *
 * Journal rows: VND amounts arrive as "100,000,000 ₫" — strip non-digits.
 * Date format DD/MM/YYYY (Vietnamese). entryType derived from "Loại" prefix.
 *
 * importRunId persisted to both tables for full rollback.
 */

import * as XLSX from "xlsx";
import { parseExcelDate, parseVndNumber, normHeader } from "./excel-utils";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";

function findSheet(wb: XLSX.WorkBook, ...hints: string[]): string | null {
  const want = hints.map((h) => normHeader(h));
  for (const n of wb.SheetNames) {
    const norm = normHeader(n);
    for (const w of want) if (norm.includes(w)) return n;
  }
  return null;
}

export const TaiChinhNqAdapter: ImportAdapter = {
  name: "tai-chinh-nq",
  label: "Tài chính NQ 2025",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    let rowIdx = 0;

    // Loan contracts
    // Prefer "Hợp đồng vay" over "Thanh toán vay"; only fall back to bare "vay" if neither exists.
    const loanSheet =
      findSheet(wb, "hop dong vay") ?? findSheet(wb, "loan") ?? findSheet(wb, "vay");
    if (loanSheet && wb.Sheets[loanSheet]) {
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[loanSheet], {
        defval: null,
        raw: false,
      });
      for (const r of raw) {
        const code = String(r["Mã hợp đồng"] ?? "").trim();
        const lenderName = String(r["Tên đối tác"] ?? r["Đối tác"] ?? "").trim();
        if (!code && !lenderName) continue;
        if (!lenderName) continue;
        rows.push({
          rowIndex: rowIdx++,
          data: {
            _type: "loan",
            contractCode: code || undefined,
            lenderName,
            principalVnd: parseVndNumber(r["Số tiền gốc ban đầu"] ?? r["Số tiền"] ?? 0),
            interestRatePct: parseVndNumber(r["Lãi suất"] ?? 0) / 100,
            startDate: parseExcelDate(r["Ngày bắt đầu"]),
            endDate: parseExcelDate(r["Ngày đáo hạn"] ?? r["Ngày kết thúc"]),
            paymentSchedule: String(r["Kỳ hạn thanh toán"] ?? r["Kỳ hạn"] ?? "monthly")
              .toLowerCase()
              .includes("qu")
              ? "quarterly"
              : "monthly",
            note: String(r["Phương thức tính"] ?? r["Ghi chú"] ?? "").trim() || undefined,
          },
        });
      }
    }

    // Journal entries
    const journalSheet = findSheet(wb, "so nhat ky", "nhat ky", "journal");
    if (journalSheet && wb.Sheets[journalSheet]) {
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[journalSheet], {
        defval: null,
        raw: false,
      });
      for (const r of raw) {
        const date = parseExcelDate(r["Ngày"] ?? r["Date"]);
        if (!date) continue;
        const loai = String(r["Loại"] ?? "").trim();
        const entryType = loai.toLowerCase().startsWith("thu")
          ? "thu"
          : loai.toLowerCase().startsWith("chuy")
            ? "chuyen_khoan"
            : "chi";
        const amount = parseVndNumber(r["Số tiền"] ?? r["Amount"] ?? 0);
        if (amount === 0) continue;
        const description = String(r["Nội dung"] ?? r["Desc"] ?? "").trim();
        if (!description) continue;
        const categoryName = String(r["Loại cụ thể"] ?? r["Danh mục"] ?? "").trim() || undefined;
        rows.push({
          rowIndex: rowIdx++,
          data: {
            _type: "journal",
            date,
            entryType,
            amountVnd: amount,
            fromAccount: String(r["Nguồn"] ?? r["Tài khoản"] ?? "").trim() || undefined,
            toAccount: undefined,
            categoryName,
            description,
            contractCode: String(r["Mã hợp đồng"] ?? "").trim() || undefined,
            note: undefined,
          },
        });
      }
    }

    return {
      rows,
      conflicts: [],
      meta: { sheetCount: wb.SheetNames.length, loanSheet, journalSheet },
    };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      if (row.data._type === "loan" && !row.data.lenderName) {
        errors.push({
          rowIndex: row.rowIndex,
          field: "lenderName",
          message: "Tên đối tác không được rỗng",
        });
      }
      if (row.data._type === "journal" && !row.data.description) {
        errors.push({
          rowIndex: row.rowIndex,
          field: "description",
          message: "Nội dung không được rỗng",
        });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, _mapping, tx, importRunId): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    const db = tx as typeof import("@/lib/prisma")["prisma"];

    const catCache = new Map<string, number>();
    async function getOrCreateCategory(name: string): Promise<number> {
      const code = name.slice(0, 30).replace(/\s+/g, "_").toUpperCase();
      if (catCache.has(code)) return catCache.get(code)!;
      const existing = await db.expenseCategory.findFirst({ where: { code, deletedAt: null } });
      if (existing) {
        catCache.set(code, existing.id);
        return existing.id;
      }
      const created = await db.expenseCategory.create({ data: { code, name, level: 0 } });
      catCache.set(code, created.id);
      imported++;
      return created.id;
    }

    // Loan contracts
    for (const row of data.rows.filter((r) => r.data._type === "loan")) {
      try {
        const lenderName = String(row.data.lenderName ?? "");
        const principalVnd = Number(row.data.principalVnd ?? 0);
        const startDate = row.data.startDate as Date | null;
        if (!startDate) {
          skipped++;
          continue;
        }
        const existing = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM loan_contracts
          WHERE "lenderName" = ${lenderName}
            AND "startDate"::date = ${startDate}::date
            AND "principalVnd" = ${principalVnd}
            AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        const endDate =
          (row.data.endDate as Date | null) ??
          new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
        const rate = Number(row.data.interestRatePct ?? 0);
        const schedule = String(row.data.paymentSchedule ?? "monthly");
        await db.$executeRaw`
          INSERT INTO loan_contracts
            ("lenderName", "principalVnd", "interestRatePct", "startDate", "endDate",
             "paymentSchedule", status, note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${lenderName}, ${principalVnd}, ${rate}, ${startDate}, ${endDate},
             ${schedule}, 'active', ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // Journal entries
    for (const row of data.rows.filter((r) => r.data._type === "journal")) {
      try {
        const date = row.data.date as Date;
        const amountVnd = Number(row.data.amountVnd ?? 0);
        const entryType = String(row.data.entryType ?? "chi");
        const description = String(row.data.description ?? "");

        let expenseCategoryId: number | null = null;
        if (row.data.categoryName) {
          expenseCategoryId = await getOrCreateCategory(String(row.data.categoryName));
        }
        const existing = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM journal_entries
          WHERE date::date = ${date}::date
            AND "entryType" = ${entryType}
            AND "amountVnd" = ${amountVnd}
            AND description = ${description}
            AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        await db.$executeRaw`
          INSERT INTO journal_entries
            (date, "entryType", "amountVnd", "fromAccount", "toAccount",
             "expenseCategoryId", description, note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${date}, ${entryType}, ${amountVnd},
             ${row.data.fromAccount ? String(row.data.fromAccount) : null},
             ${row.data.toAccount ? String(row.data.toAccount) : null},
             ${expenseCategoryId}, ${description},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
