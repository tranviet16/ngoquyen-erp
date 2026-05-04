/**
 * Adapter: Quản lý dự án xây dựng (mẫu).xlsx
 * Target tables: projects, project_categories, project_estimates,
 *                project_schedules, project_transactions, project_contracts,
 *                project_acceptances, project_change_orders, project_settings
 *
 * Strategy: Creates/upserts 1 Project per file + categories + rows from each sheet.
 * Idempotency: match project by code; skip estimate rows where (projectId, itemCode, categoryId) exists.
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
  if (typeof val === "number") {
    return new Date((val - 25569) * 86400 * 1000);
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

function toNum(val: unknown): number {
  return parseFloat(String(val ?? "0").replace(/[^0-9.-]/g, "")) || 0;
}

export const DuAnXayDungAdapter: ImportAdapter = {
  name: "du-an-xay-dung",
  label: "Quản lý Dự án Xây dựng",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    let rowIdx = 0;

    // Sheet 1: Project metadata (row 2 = headers if present)
    const metaSheet = wb.Sheets[wb.SheetNames[0]];
    const metaRows = metaSheet
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(metaSheet, { defval: null, raw: false })
      : [];

    // Extract project info from first data row
    const projectInfo = metaRows[0] ?? {};
    rows.push({
      rowIndex: rowIdx++,
      data: {
        _type: "project",
        code: String(projectInfo["Mã DA"] ?? projectInfo["Code"] ?? "DA001").trim(),
        name: String(projectInfo["Tên dự án"] ?? projectInfo["Name"] ?? "Dự án nhập").trim(),
        ownerInvestor: String(projectInfo["Chủ đầu tư"] ?? "").trim() || undefined,
        contractValue: toNum(projectInfo["Giá trị HĐ"] ?? projectInfo["Contract"] ?? 0),
        startDate: parseExcelDate(projectInfo["Ngày bắt đầu"] ?? projectInfo["Start"]),
        endDate: parseExcelDate(projectInfo["Ngày kết thúc"] ?? projectInfo["End"]),
      },
    });

    // Sheet: Dự toán (estimates)
    for (const sheetName of wb.SheetNames) {
      if (!sheetName.toLowerCase().includes("toán") && !sheetName.toLowerCase().includes("toan") && !sheetName.toLowerCase().includes("estimate")) continue;
      const sheet = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
      for (const r of raw) {
        const itemCode = String(r["Mã VT"] ?? r["Code"] ?? "").trim();
        if (!itemCode) continue;
        rows.push({
          rowIndex: rowIdx++,
          data: {
            _type: "estimate",
            categoryCode: String(r["Hạng mục"] ?? r["Cat"] ?? "HM01").trim(),
            categoryName: String(r["Tên hạng mục"] ?? r["Category"] ?? "Hạng mục 1").trim(),
            itemCode,
            itemName: String(r["Tên VT"] ?? r["Item"] ?? itemCode).trim(),
            unit: String(r["ĐVT"] ?? r["Unit"] ?? "m3").trim(),
            qty: toNum(r["KL"] ?? r["Qty"] ?? 0),
            unitPrice: toNum(r["Đơn giá"] ?? r["Price"] ?? 0),
          },
        });
      }
    }

    // Sheet: Giao dịch (transactions)
    for (const sheetName of wb.SheetNames) {
      if (!sheetName.toLowerCase().includes("giao") && !sheetName.toLowerCase().includes("tran")) continue;
      const sheet = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
      for (const r of raw) {
        const dateVal = parseExcelDate(r["Ngày"] ?? r["Date"]);
        if (!dateVal) continue;
        rows.push({
          rowIndex: rowIdx++,
          data: {
            _type: "transaction",
            date: dateVal,
            transactionType: String(r["Loại"] ?? "lay_hang").toLowerCase().includes("nhan") ? "nhan_cong" : "lay_hang",
            categoryCode: String(r["Hạng mục"] ?? "HM01").trim(),
            itemCode: String(r["Mã VT"] ?? "").trim(),
            itemName: String(r["Tên VT"] ?? "").trim(),
            partyName: String(r["NCC/Đội"] ?? "").trim() || undefined,
            qty: toNum(r["KL"] ?? 0),
            unit: String(r["ĐVT"] ?? "").trim(),
            unitPriceTt: toNum(r["ĐG TT"] ?? 0),
            unitPriceHd: toNum(r["ĐG HĐ"] ?? 0),
          },
        });
      }
    }

    return { rows, conflicts: [], meta: { sheetCount: wb.SheetNames.length } };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      if (row.data._type === "estimate") {
        if (!row.data.itemCode) {
          errors.push({ rowIndex: row.rowIndex, field: "itemCode", message: "Mã vật tư không được rỗng" });
        }
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, _mapping, tx): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    const prismaRef = tx as typeof import("@/lib/prisma")["prisma"];

    // Find/create project
    const projectRow = data.rows.find((r) => r.data._type === "project");
    if (!projectRow) {
      return { rowsTotal: data.rows.length, rowsImported: 0, rowsSkipped: data.rows.length, errors: [{ rowIndex: 0, message: "Không tìm thấy thông tin dự án" }] };
    }

    const projectCode = String(projectRow.data.code ?? "DA001");
    let project = await prismaRef.project.findFirst({ where: { code: projectCode, deletedAt: null } });
    if (!project) {
      project = await prismaRef.project.create({
        data: {
          code: projectCode,
          name: String(projectRow.data.name ?? "Dự án nhập"),
          ownerInvestor: projectRow.data.ownerInvestor as string | undefined,
          contractValue: projectRow.data.contractValue ? String(projectRow.data.contractValue) : undefined,
          startDate: projectRow.data.startDate as Date | undefined,
          endDate: projectRow.data.endDate as Date | undefined,
        },
      });
      imported++;
    } else {
      skipped++;
    }

    const projectId = project.id;

    // Category upsert cache
    const catCache = new Map<string, number>();
    async function getOrCreateCategory(code: string, name: string): Promise<number> {
      if (catCache.has(code)) return catCache.get(code)!;
      const existing = await prismaRef.projectCategory.findFirst({
        where: { projectId, code, deletedAt: null },
      });
      if (existing) {
        catCache.set(code, existing.id);
        return existing.id;
      }
      const created = await prismaRef.projectCategory.create({
        data: { projectId, code, name, sortOrder: catCache.size },
      });
      catCache.set(code, created.id);
      imported++;
      return created.id;
    }

    // Process estimates
    for (const row of data.rows.filter((r) => r.data._type === "estimate")) {
      try {
        const catCode = String(row.data.categoryCode ?? "HM01");
        const catName = String(row.data.categoryName ?? catCode);
        const categoryId = await getOrCreateCategory(catCode, catName);
        const itemCode = String(row.data.itemCode ?? "");

        // Idempotency: skip if (projectId, categoryId, itemCode) exists
        const existing = await prismaRef.$queryRaw<{ id: number }[]>`
          SELECT id FROM project_estimates
          WHERE "projectId" = ${projectId} AND "categoryId" = ${categoryId}
            AND "itemCode" = ${itemCode} AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) { skipped++; continue; }

        const qty = Number(row.data.qty ?? 0);
        const unitPrice = Number(row.data.unitPrice ?? 0);
        const totalVnd = qty * unitPrice;

        // Bulk insert bypasses audit middleware — intentional for historical migration
        await prismaRef.$executeRaw`
          INSERT INTO project_estimates ("projectId", "categoryId", "itemCode", "itemName", unit, qty, "unitPrice", "totalVnd", "createdAt", "updatedAt")
          VALUES (${projectId}, ${categoryId}, ${itemCode}, ${String(row.data.itemName ?? itemCode)},
                  ${String(row.data.unit ?? "")}, ${qty}, ${unitPrice}, ${totalVnd}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    // Process transactions
    for (const row of data.rows.filter((r) => r.data._type === "transaction")) {
      try {
        const catCode = String(row.data.categoryCode ?? "HM01");
        const categoryId = await getOrCreateCategory(catCode, catCode);
        const date = row.data.date as Date;
        const itemCode = String(row.data.itemCode ?? "");
        const qty = Number(row.data.qty ?? 0);
        const txType = String(row.data.transactionType ?? "lay_hang");
        const unitPriceTt = Number(row.data.unitPriceTt ?? 0);
        const unitPriceHd = Number(row.data.unitPriceHd ?? 0);

        await prismaRef.$executeRaw`
          INSERT INTO project_transactions
            ("projectId", date, "transactionType", "categoryId", "itemCode", "itemName",
             "partyName", qty, unit, "unitPriceTt", "unitPriceHd",
             "amountTt", "amountHd", status, "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${date}, ${txType}, ${categoryId}, ${itemCode},
             ${String(row.data.itemName ?? itemCode)}, ${String(row.data.partyName ?? "")},
             ${qty}, ${String(row.data.unit ?? "")}, ${unitPriceTt}, ${unitPriceHd},
             ${qty * unitPriceTt}, ${qty * unitPriceHd}, 'approved', NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
