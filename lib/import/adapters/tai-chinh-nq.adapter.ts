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
import {
  parseExcelDate,
  parseVndNumber,
  normHeader,
  findHeaderRow,
} from "./excel-utils";
import { suggestJournalLabel } from "@/lib/tai-chinh/journal-auto-label";
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

function resolveJournalSourceAccounts(
  sourceName: string | undefined,
  entryType: string,
  entryTypeLabel: string,
) {
  if (!sourceName) return { fromAccount: undefined, toAccount: undefined };
  const label = normHeader(entryTypeLabel);
  if (entryType === "thu") return { fromAccount: undefined, toAccount: sourceName };
  if (entryType === "chi") return { fromAccount: sourceName, toAccount: undefined };
  if (entryType === "chuyen_khoan" && label.includes("den")) {
    return { fromAccount: undefined, toAccount: sourceName };
  }
  return { fromAccount: sourceName, toAccount: undefined };
}

function journalTransferMergeKey(row: ParsedRow) {
  if (row.data._type !== "journal" || row.data.entryType !== "chuyen_khoan") return null;
  const date = row.data.date instanceof Date
    ? row.data.date.toISOString().slice(0, 10)
    : String(row.data.date ?? "");
  return [
    date,
    String(row.data.amountVnd ?? ""),
    String(row.data.description ?? "").trim(),
  ].join("|");
}

function canMergeTransferRows(left: ParsedRow, right: ParsedRow) {
  const leftHasFrom = !!left.data.fromAccount;
  const leftHasTo = !!left.data.toAccount;
  const rightHasFrom = !!right.data.fromAccount;
  const rightHasTo = !!right.data.toAccount;
  return (leftHasFrom && !leftHasTo && !rightHasFrom && rightHasTo) ||
    (!leftHasFrom && leftHasTo && rightHasFrom && !rightHasTo);
}

function mergeJournalTransferRows(rows: ParsedRow[]) {
  const merged: ParsedRow[] = [];
  for (const row of rows) {
    const key = journalTransferMergeKey(row);
    if (!key) {
      merged.push(row);
      continue;
    }

    const matchIndex = merged.findIndex((existing) =>
      journalTransferMergeKey(existing) === key && canMergeTransferRows(existing, row),
    );
    if (matchIndex < 0) {
      merged.push(row);
      continue;
    }

    const existing = merged[matchIndex];
    merged[matchIndex] = {
      rowIndex: Math.min(existing.rowIndex, row.rowIndex),
      data: {
        ...existing.data,
        fromAccount: existing.data.fromAccount ?? row.data.fromAccount,
        toAccount: existing.data.toAccount ?? row.data.toAccount,
      },
    };
  }
  return merged;
}

/**
 * Count-based idempotency checker.
 *
 * A row is "already imported" only if its key already had >= N matching rows
 * in the DB *before this run started*. The Nth occurrence of a key within the
 * file is skipped only when N pre-existing DB rows cover it.
 *
 * This preserves legitimate within-file duplicates — e.g. two genuine journal
 * entries on the same date, same amount, same description — which a plain
 * "exists → skip" check would silently collapse into one (data loss), while
 * still making a full re-import of the same file fully idempotent.
 */
function makeDedupChecker() {
  const dbCountBefore = new Map<string, number>();
  const seenInRun = new Map<string, number>();
  return async function isAlreadyImported(
    key: string,
    countExisting: () => Promise<number>,
  ): Promise<boolean> {
    let before = dbCountBefore.get(key);
    if (before === undefined) {
      before = await countExisting();
      dbCountBefore.set(key, before);
    }
    const occ = seenInRun.get(key) ?? 0;
    seenInRun.set(key, occ + 1);
    return occ < before;
  };
}

export const TaiChinhNqAdapter: ImportAdapter = {
  name: "tai-chinh-nq",
  label: "Tài chính NQ 2025",
  supportsRollback: true,

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
        const amount = parseVndNumber(r["Số tiền"] ?? r["Amount"] ?? 0);
        if (amount === 0) continue;
        const description = String(r["Nội dung"] ?? r["Desc"] ?? "").trim();
        if (!description) continue;
        const workbookCategory = String(r["Loại cụ thể"] ?? r["Danh mục"] ?? "").trim();
        const suggestion = suggestJournalLabel({
          description,
          entryTypeLabel: loai,
          categoryName: workbookCategory,
        });
        const categoryName =
          suggestion?.categoryName && suggestion.categoryName !== "—"
            ? suggestion.categoryName
            : undefined;
        const sourceName = String(r["Nguồn"] ?? r["Tài khoản"] ?? "").trim() || undefined;
        const accountFields = resolveJournalSourceAccounts(
          sourceName,
          suggestion?.entryType ?? "chi",
          loai,
        );
        rows.push({
          rowIndex: rowIdx++,
          data: {
            _type: "journal",
            date,
            entryType: suggestion?.entryType ?? "chi",
            costBehavior: suggestion?.costBehavior ?? "variable",
            amountVnd: amount,
            ...accountFields,
            categoryName,
            description,
            contractCode: String(r["Mã hợp đồng"] ?? "").trim() || undefined,
            note: undefined,
          },
        });
      }
    }

    // ── Loan payments: "Thanh toán vay" sheet ──
    const loanPaySheet = findSheet(wb, "thanh toan vay", "loan payment");
    if (loanPaySheet && wb.Sheets[loanPaySheet]) {
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[loanPaySheet], {
        defval: null,
        raw: false,
      });
      for (const r of raw) {
        const code = String(r["Mã hợp đồng"] ?? r["Mã HĐ"] ?? "").trim();
        const dueDate = parseExcelDate(r["Ngày đáo hạn"] ?? r["Kỳ hạn"] ?? r["Ngày"]);
        if (!code || !dueDate) continue;
        rows.push({
          rowIndex: rowIdx++,
          data: {
            _type: "loan-payment",
            contractCode: code,
            dueDate,
            principalDue: parseVndNumber(r["Gốc phải trả"] ?? r["Gốc"] ?? 0),
            interestDue: parseVndNumber(r["Lãi phải trả"] ?? r["Lãi"] ?? 0),
            paidDate: parseExcelDate(r["Ngày trả"] ?? null),
            principalPaid: parseVndNumber(r["Gốc đã trả"] ?? 0),
            interestPaid: parseVndNumber(r["Lãi đã trả"] ?? 0),
            note: String(r["Ghi chú"] ?? "").trim() || undefined,
          },
        });
      }
    }

    // ── Expense classifications: "Phân loại chi phí" (header ~ row 13) ──
    const expClassSheet = findSheet(wb, "phan loai chi phi");
    if (expClassSheet && wb.Sheets[expClassSheet]) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[expClassSheet], {
        header: 1,
        defval: null,
        raw: false,
      });
      const headerIdx = findHeaderRow(matrix, ["stt"]);
      if (headerIdx >= 0) {
        for (let i = headerIdx + 1; i < matrix.length; i++) {
          const r = matrix[i] || [];
          const stt = r[0];
          if (!(typeof stt === "number" || (typeof stt === "string" && /^\d+$/.test(stt.trim()))))
            continue;
          const date = parseExcelDate(r[1]);
          const categoryName = String(r[2] ?? "").trim();
          const description = String(r[3] ?? "").trim();
          const amount = parseVndNumber(r[4]);
          const source = String(r[5] ?? "").trim();
          const contractCode = String(r[6] ?? "").trim();
          const projectName = String(r[7] ?? "").trim();
          if (!date || amount === 0 || !categoryName) continue;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "expense-classification",
              date,
              categoryName,
              amountVnd: amount,
              description: description || undefined,
              projectName: projectName || undefined,
              note:
                [source && `Nguồn: ${source}`, contractCode && `HĐ: ${contractCode}`]
                  .filter(Boolean)
                  .join(" | ") || undefined,
            },
          });
        }
      }
    }

    // ── Payable / Receivable adjustments ──
    // "Phải trả" — header row contains STT + Danh Mục; cols: 0:STT, 1:Danh Mục,
    //   Thực tế: 2:đầu kỳ, 3:phải trả phát sinh, 4:đã trả, 5:cuối kỳ
    //   Hợp đồng: 6:đầu kỳ, 7:phải trả phát sinh, 8:đã trả, 9:cuối kỳ
    const payableSheet = findSheet(wb, "phai tra");
    if (payableSheet && wb.Sheets[payableSheet]) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[payableSheet], {
        header: 1,
        defval: null,
        raw: false,
      });
      const headerIdx = findHeaderRow(matrix, ["stt"]);
      if (headerIdx >= 0) {
        let partyType: "supplier" | "contractor" | "other" = "supplier";
        for (let i = headerIdx + 3; i < matrix.length; i++) {
          const r = matrix[i] || [];
          const stt = String(r[0] ?? "").trim();
          const name = String(r[1] ?? "").trim();
          if (!name) continue;
          // Section heads: STT is roman numeral (I, II, III...) → updates partyType
          if (/^[IVX]+$/i.test(stt)) {
            const norm = normHeader(name);
            partyType = norm.includes("nha thau")
              ? "contractor"
              : norm.includes("nha cung")
                ? "supplier"
                : "other";
            continue;
          }
          if (!/^\d+$/.test(stt)) continue;
          const balance = parseVndNumber(r[5]); // cuối kỳ (Thực tế)
          if (balance === 0) continue;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "payable-adjustment",
              date: new Date(),
              partyType,
              partyName: name,
              type: "payable",
              amountVnd: balance,
              note: `Đầu kỳ: ${parseVndNumber(r[2])} | PS: ${parseVndNumber(r[3])} | Đã trả: ${parseVndNumber(r[4])}`,
            },
          });
        }
      }
    }

    // "Phải thu" — header row contains STT + Danh mục
    //   cols: 0:STT, 1:Danh mục (Lô), 2:Giá trị dự toán, 3:Sản lượng lũy kế,
    //         4:Doanh thu lũy kế, 5:Công nợ
    const receivableSheet = findSheet(wb, "phai thu");
    if (receivableSheet && wb.Sheets[receivableSheet]) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[receivableSheet], {
        header: 1,
        defval: null,
        raw: false,
      });
      const headerIdx = findHeaderRow(matrix, ["stt"]);
      if (headerIdx >= 0) {
        for (let i = headerIdx + 1; i < matrix.length; i++) {
          const r = matrix[i] || [];
          const stt = String(r[0] ?? "").trim();
          const name = String(r[1] ?? "").trim();
          if (!name || !/^\d+$/.test(stt)) continue;
          const balance = parseVndNumber(r[5]);
          if (balance === 0) continue;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "receivable-adjustment",
              date: new Date(),
              partyType: "other",
              partyName: name,
              type: "receivable",
              amountVnd: balance,
              note: `SL lũy kế: ${parseVndNumber(r[3])} | DT lũy kế: ${parseVndNumber(r[4])}`,
            },
          });
        }
      }
    }

    return {
      rows: mergeJournalTransferRows(rows),
      conflicts: [],
      meta: {
        sheetCount: wb.SheetNames.length,
        loanSheet,
        journalSheet,
        loanPaySheet,
        expClassSheet,
        payableSheet,
        receivableSheet,
      },
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

    // Idempotency: skip a row only when a matching DB record already existed
    // before this run — never collapse legitimate within-file duplicates.
    const dkey = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""));
    const loanDedup = makeDedupChecker();
    const journalDedup = makeDedupChecker();
    const loanPaymentDedup = makeDedupChecker();
    const expenseClassDedup = makeDedupChecker();
    const payRecvDedup = makeDedupChecker();

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

    const accountCache = new Map<string, number>();
    async function getOrCreateCashAccount(name: string | null | undefined): Promise<number | null> {
      const trimmed = String(name ?? "").trim();
      if (!trimmed) return null;
      const key = normHeader(trimmed);
      if (accountCache.has(key)) return accountCache.get(key)!;

      const existing = await db.cashAccount.findFirst({
        where: { name: trimmed },
        select: { id: true, deletedAt: true },
      });
      if (existing) {
        if (existing.deletedAt) {
          await db.cashAccount.update({ where: { id: existing.id }, data: { deletedAt: null } });
        }
        accountCache.set(key, existing.id);
        return existing.id;
      }

      const created = await db.cashAccount.create({
        data: { name: trimmed, openingBalanceVnd: 0, displayOrder: 0 },
        select: { id: true },
      });
      accountCache.set(key, created.id);
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
        const alreadyImported = await loanDedup(
          `${lenderName}|${dkey(startDate)}|${principalVnd}`,
          async () => {
            const r = await db.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM loan_contracts
              WHERE "lenderName" = ${lenderName}
                AND "startDate"::date = ${startDate}::date
                AND "principalVnd" = ${principalVnd}
                AND "deletedAt" IS NULL
            `;
            return r[0]?.n ?? 0;
          },
        );
        if (alreadyImported) {
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
        const costBehavior = String(row.data.costBehavior ?? (entryType === "chuyen_khoan" ? "transfer" : "variable"));
        const description = String(row.data.description ?? "");
        const fromAccount = row.data.fromAccount ? String(row.data.fromAccount) : null;
        const toAccount = row.data.toAccount ? String(row.data.toAccount) : null;
        const fromAccountId = await getOrCreateCashAccount(fromAccount);
        const toAccountId = await getOrCreateCashAccount(toAccount);

        let expenseCategoryId: number | null = null;
        if (row.data.categoryName) {
          expenseCategoryId = await getOrCreateCategory(String(row.data.categoryName));
        }
        const alreadyImported = await journalDedup(
          `${dkey(date)}|${entryType}|${amountVnd}|${description}`,
          async () => {
            const r = await db.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM journal_entries
              WHERE date::date = ${date}::date
                AND "entryType" = ${entryType}
                AND "amountVnd" = ${amountVnd}
                AND description = ${description}
                AND "deletedAt" IS NULL
            `;
            return r[0]?.n ?? 0;
          },
        );
        if (alreadyImported) {
          skipped++;
          continue;
        }
        await db.$executeRaw`
          INSERT INTO journal_entries
            (date, "entryType", "amountVnd", "fromAccount", "toAccount",
             "fromAccountId", "toAccountId", "costBehavior", "expenseCategoryId",
             description, note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${date}, ${entryType}, ${amountVnd},
             ${fromAccount}, ${toAccount},
             ${fromAccountId}, ${toAccountId}, ${costBehavior}, ${expenseCategoryId}, ${description},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // Loan payments
    for (const row of data.rows.filter((r) => r.data._type === "loan-payment")) {
      try {
        const code = String(row.data.contractCode ?? "");
        const dueDate = row.data.dueDate as Date;
        const contract = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM loan_contracts
          WHERE note ILIKE ${"%" + code + "%"} AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (contract.length === 0) {
          skipped++;
          continue;
        }
        const principalDue = Number(row.data.principalDue ?? 0);
        const interestDue = Number(row.data.interestDue ?? 0);
        const alreadyImported = await loanPaymentDedup(
          `${contract[0].id}|${dkey(dueDate)}`,
          async () => {
            const r = await db.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM loan_payments
              WHERE "loanContractId" = ${contract[0].id}
                AND "dueDate"::date = ${dueDate}::date
                AND "deletedAt" IS NULL
            `;
            return r[0]?.n ?? 0;
          },
        );
        if (alreadyImported) {
          skipped++;
          continue;
        }
        const paidDate = row.data.paidDate as Date | null;
        const status = paidDate ? "paid" : "pending";
        await db.$executeRaw`
          INSERT INTO loan_payments
            ("loanContractId", "dueDate", "principalDue", "interestDue",
             "paidDate", "principalPaid", "interestPaid", status, note,
             "importRunId", "createdAt", "updatedAt")
          VALUES
            (${contract[0].id}, ${dueDate}, ${principalDue}, ${interestDue},
             ${paidDate}, ${Number(row.data.principalPaid ?? 0)}, ${Number(row.data.interestPaid ?? 0)},
             ${status}, ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // Expense classifications
    for (const row of data.rows.filter((r) => r.data._type === "expense-classification")) {
      try {
        const date = row.data.date as Date;
        const categoryName = String(row.data.categoryName ?? "");
        const amountVnd = Number(row.data.amountVnd ?? 0);
        const description = row.data.description ? String(row.data.description) : null;
        const projectName = row.data.projectName ? String(row.data.projectName) : null;
        let projectId: number | null = null;
        if (projectName) {
          const p = await db.project.findFirst({
            where: { name: projectName, deletedAt: null },
            select: { id: true },
          });
          projectId = p?.id ?? null;
        }
        const alreadyImported = await expenseClassDedup(
          `${dkey(date)}|${categoryName}|${amountVnd}`,
          async () => {
            const r = await db.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM expense_classifications
              WHERE date::date = ${date}::date
                AND "categoryName" = ${categoryName}
                AND "amountVnd" = ${amountVnd}
                AND "deletedAt" IS NULL
            `;
            return r[0]?.n ?? 0;
          },
        );
        if (alreadyImported) {
          skipped++;
          continue;
        }
        await db.$executeRaw`
          INSERT INTO expense_classifications
            (date, "categoryName", "amountVnd", description, "projectId", note,
             "importRunId", "createdAt", "updatedAt")
          VALUES
            (${date}, ${categoryName}, ${amountVnd}, ${description}, ${projectId},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // Payable / Receivable adjustments
    for (const row of data.rows.filter(
      (r) => r.data._type === "payable-adjustment" || r.data._type === "receivable-adjustment",
    )) {
      try {
        const date = row.data.date as Date;
        const partyType = String(row.data.partyType ?? "other");
        const partyName = String(row.data.partyName ?? "");
        const type = String(row.data.type ?? "payable");
        const amountVnd = Number(row.data.amountVnd ?? 0);
        const alreadyImported = await payRecvDedup(
          `${partyName}|${type}|${amountVnd}`,
          async () => {
            const r = await db.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM payable_receivable_adjustments
              WHERE "partyName" = ${partyName}
                AND type = ${type}
                AND "amountVnd" = ${amountVnd}
                AND "deletedAt" IS NULL
            `;
            return r[0]?.n ?? 0;
          },
        );
        if (alreadyImported) {
          skipped++;
          continue;
        }
        await db.$executeRaw`
          INSERT INTO payable_receivable_adjustments
            (date, "partyType", "partyName", "projectId", type, "amountVnd",
             "dueDate", status, note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${date}, ${partyType}, ${partyName}, NULL, ${type}, ${amountVnd},
             NULL, 'pending', ${row.data.note ? String(row.data.note) : null},
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
