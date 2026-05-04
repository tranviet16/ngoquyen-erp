/**
 * Adapter: Hệ thống quản lý tài chính NQ.xlsx
 * Target tables:
 *   - loan_contracts + loan_payments (sheet "Vay")
 *   - journal_entries (sheet "Nhật ký")
 *   - expense_categories (auto-create from category names)
 *
 * Idempotency: skip loan contracts matching (lenderName, startDate, principalVnd).
 * Bulk insert via prisma.$executeRaw — bypasses audit middleware (intentional, historical migration).
 */

import * as XLSX from "xlsx";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ValidationResult,
  ResolvedMapping,
  ImportSummary,
} from "./adapter-types";

function parseExcelDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === "number") return new Date((val - 25569) * 86400 * 1000);
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

function toNum(val: unknown): number {
  return parseFloat(String(val ?? "0").replace(/[^0-9.-]/g, "")) || 0;
}

export const TaiChinhNqAdapter: ImportAdapter = {
  name: "tai-chinh-nq",
  label: "Tài chính NQ 2025",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    let rowIdx = 0;

    for (const sheetName of wb.SheetNames) {
      const lower = sheetName.toLowerCase();
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });

      if (lower.includes("vay") || lower.includes("loan")) {
        for (const r of raw) {
          const lenderName = String(r["Chủ nợ"] ?? r["Bên vay"] ?? r["Lender"] ?? "").trim();
          if (!lenderName) continue;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "loan",
              lenderName,
              principalVnd: toNum(r["Số tiền"] ?? r["Principal"] ?? 0),
              interestRatePct: toNum(r["Lãi suất"] ?? r["Rate"] ?? 0) / 100,
              startDate: parseExcelDate(r["Ngày bắt đầu"] ?? r["Start"]),
              endDate: parseExcelDate(r["Ngày kết thúc"] ?? r["End"]),
              paymentSchedule: String(r["Kỳ hạn"] ?? "monthly").toLowerCase().includes("qu") ? "quarterly" : "monthly",
              note: String(r["Ghi chú"] ?? "").trim() || undefined,
            },
          });
        }
      } else if (lower.includes("nhat") || lower.includes("nhật") || lower.includes("journal")) {
        for (const r of raw) {
          const date = parseExcelDate(r["Ngày"] ?? r["Date"]);
          if (!date) continue;
          const entryType = (() => {
            const t = String(r["Loại"] ?? r["Type"] ?? "chi").toLowerCase();
            if (t.includes("thu")) return "thu";
            if (t.includes("chuy")) return "chuyen_khoan";
            return "chi";
          })();
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "journal",
              date,
              entryType,
              amountVnd: toNum(r["Số tiền"] ?? r["Amount"] ?? 0),
              fromAccount: String(r["Tài khoản nợ"] ?? r["From"] ?? "").trim() || undefined,
              toAccount: String(r["Tài khoản có"] ?? r["To"] ?? "").trim() || undefined,
              categoryName: String(r["Danh mục"] ?? r["Category"] ?? "").trim() || undefined,
              description: String(r["Nội dung"] ?? r["Desc"] ?? "Chi phí nhập").trim(),
              note: String(r["Ghi chú"] ?? "").trim() || undefined,
            },
          });
        }
      } else if (lower.includes("danh") || lower.includes("category") || lower.includes("phan")) {
        for (const r of raw) {
          const code = String(r["Mã"] ?? r["Code"] ?? "").trim();
          const name = String(r["Tên"] ?? r["Name"] ?? "").trim();
          if (!code || !name) continue;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "expense_category",
              code,
              name,
              parentCode: String(r["Mã cha"] ?? "").trim() || undefined,
            },
          });
        }
      }
    }

    return { rows, conflicts: [], meta: { sheetCount: wb.SheetNames.length } };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      if (row.data._type === "loan" && !row.data.lenderName) {
        errors.push({ rowIndex: row.rowIndex, field: "lenderName", message: "Tên chủ nợ không được rỗng" });
      }
      if (row.data._type === "journal" && !row.data.description) {
        errors.push({ rowIndex: row.rowIndex, field: "description", message: "Nội dung không được rỗng" });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, _mapping, tx): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    const prismaRef = tx as typeof import("@/lib/prisma")["prisma"];

    // Expense categories cache
    const catCache = new Map<string, number>();
    async function getOrCreateCategory(code: string, name: string): Promise<number> {
      if (catCache.has(code)) return catCache.get(code)!;
      const existing = await prismaRef.expenseCategory.findFirst({ where: { code, deletedAt: null } });
      if (existing) { catCache.set(code, existing.id); return existing.id; }
      const created = await prismaRef.expenseCategory.create({ data: { code, name, level: 0 } });
      catCache.set(code, created.id);
      imported++;
      return created.id;
    }

    // Expense category rows first
    for (const row of data.rows.filter((r) => r.data._type === "expense_category")) {
      try {
        await getOrCreateCategory(String(row.data.code), String(row.data.name));
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // Loan contracts
    for (const row of data.rows.filter((r) => r.data._type === "loan")) {
      try {
        const lenderName = String(row.data.lenderName ?? "");
        const principalVnd = Number(row.data.principalVnd ?? 0);
        const startDate = row.data.startDate as Date | null;
        if (!startDate) { skipped++; continue; }

        // Idempotency
        const existing = await prismaRef.$queryRaw<{ id: number }[]>`
          SELECT id FROM loan_contracts
          WHERE "lenderName" = ${lenderName}
            AND "startDate"::date = ${startDate}::date
            AND "principalVnd" = ${principalVnd}
          LIMIT 1
        `;
        if (existing.length > 0) { skipped++; continue; }

        const endDate = (row.data.endDate as Date | null) ?? new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
        const rate = Number(row.data.interestRatePct ?? 0);
        const schedule = String(row.data.paymentSchedule ?? "monthly");

        await prismaRef.$executeRaw`
          INSERT INTO loan_contracts
            ("lenderName", "principalVnd", "interestRatePct", "startDate", "endDate",
             "paymentSchedule", status, note, "createdAt", "updatedAt")
          VALUES
            (${lenderName}, ${principalVnd}, ${rate}, ${startDate}, ${endDate},
             ${schedule}, 'active', ${String(row.data.note ?? "")}, NOW(), NOW())
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
          const catCode = String(row.data.categoryName).slice(0, 20).replace(/\s+/g, "_");
          expenseCategoryId = await getOrCreateCategory(catCode, String(row.data.categoryName));
        }

        // Idempotency: skip exact duplicate
        const existing = await prismaRef.$queryRaw<{ id: number }[]>`
          SELECT id FROM journal_entries
          WHERE date::date = ${date}::date
            AND "entryType" = ${entryType}
            AND "amountVnd" = ${amountVnd}
            AND description = ${description}
            AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) { skipped++; continue; }

        await prismaRef.$executeRaw`
          INSERT INTO journal_entries
            (date, "entryType", "amountVnd", "fromAccount", "toAccount",
             "expenseCategoryId", description, note, "createdAt", "updatedAt")
          VALUES
            (${date}, ${entryType}, ${amountVnd},
             ${String(row.data.fromAccount ?? "")}, ${String(row.data.toAccount ?? "")},
             ${expenseCategoryId}, ${description}, ${String(row.data.note ?? "")},
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
