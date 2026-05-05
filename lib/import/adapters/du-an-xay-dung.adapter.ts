/**
 * Adapter: Quản lý Dự án Xây dựng (mẫu).xlsx
 * Target tables: projects, project_categories, project_estimates, project_transactions
 *
 * Strategy: 1 file = 1 project.
 *   - "Dự Toán" sheet → project_estimates (header row contains "Mã Item")
 *   - "Giao Dịch"  sheet → project_transactions (header row contains "Ngày")
 *   - Project code/name parsed from "Cài Đặt" sheet if present, else fallback default.
 * Idempotency: project matched by code; estimate dedup by (projectId, categoryId, itemCode).
 * Bulk insert via $executeRaw bypasses audit middleware (intentional historical migration).
 */

import * as XLSX from "xlsx";
import {
  parseExcelDate,
  num,
  normHeader,
  findHeaderRow,
  buildRowsFromMatrix,
  findLabeledValue,
} from "./excel-utils";
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

function readMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
}

const TX_TYPE_MAP: Record<string, string> = {
  "giao vat lieu": "lay_hang",
  "lay hang": "lay_hang",
  "nhan cong": "nhan_cong",
  "may moc": "may_moc",
};

export const DuAnXayDungAdapter: ImportAdapter = {
  name: "du-an-xay-dung",
  label: "Quản lý Dự án Xây dựng",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    let rowIdx = 0;

    // Project meta — try Cài Đặt / README sheet, else default.
    let projectCode = "DA001";
    let projectName = "Dự án nhập từ Excel";
    let ownerInvestor: string | undefined;
    let contractValue = 0;

    const settingsSheet = findSheet(wb, "cai dat", "setting", "readme");
    if (settingsSheet) {
      const matrix = readMatrix(wb.Sheets[settingsSheet]);
      projectCode =
        findLabeledValue(matrix, "ma da") ??
        findLabeledValue(matrix, "ma du an") ??
        findLabeledValue(matrix, "code") ??
        projectCode;
      projectName =
        findLabeledValue(matrix, "ten du an") ??
        findLabeledValue(matrix, "du an") ??
        projectName;
      ownerInvestor = findLabeledValue(matrix, "chu dau tu") ?? undefined;
      const cvStr = findLabeledValue(matrix, "gia tri hd") ?? findLabeledValue(matrix, "gia tri hop dong");
      if (cvStr) contractValue = num(cvStr);
    }

    rows.push({
      rowIndex: rowIdx++,
      data: {
        _type: "project",
        code: projectCode,
        name: projectName,
        ownerInvestor,
        contractValue,
      },
    });

    // Estimate sheet — prefer "Dự Toán" (not adjusted) for parse stability.
    const estimateSheetName = wb.SheetNames.find((n) => {
      const norm = normHeader(n);
      return norm.includes("du toan") && !norm.includes("dieu chinh");
    });
    if (estimateSheetName) {
      const matrix = readMatrix(wb.Sheets[estimateSheetName]);
      const headerIdx = findHeaderRow(matrix, ["ma item", "ma vt"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const itemCode = String(r["Mã Item"] ?? r["Mã VT"] ?? "").trim();
          if (!itemCode) continue;
          const categoryCode = String(r["Hạng Mục"] ?? r["Hạng mục"] ?? "HM01").trim();
          if (categoryCode.toLowerCase().startsWith("cộng")) continue;
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "estimate",
              categoryCode,
              categoryName: categoryCode,
              itemCode,
              itemName: String(
                r["Tên Hạng Mục / Vật Tư"] ?? r["Tên VT"] ?? r["Tên Vật Tư"] ?? itemCode,
              ).trim(),
              unit: String(r["ĐVT"] ?? "m3").trim(),
              qty: num(r["Khối Lượng DT"] ?? r["KL"] ?? 0),
              unitPrice: num(r["Đơn Giá (VNĐ)"] ?? r["Đơn Giá"] ?? 0),
            },
          });
        }
      }
    }

    // Transaction sheet — "Giao Dịch"
    const txSheetName = findSheet(wb, "giao dich");
    if (txSheetName) {
      const matrix = readMatrix(wb.Sheets[txSheetName]);
      const headerIdx = findHeaderRow(matrix, ["ngay"]);
      if (headerIdx >= 0) {
        const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
        for (const r of rawRows) {
          const dateVal = parseExcelDate(r["Ngày"] ?? null);
          if (!dateVal) continue;
          const loaiGd = normHeader(r["Loại Giao Dịch"] ?? r["Loại"] ?? "");
          const txType = TX_TYPE_MAP[loaiGd] ?? "lay_hang";
          const itemCode = String(r["Mã Item"] ?? r["Mã VT"] ?? "").trim();
          rows.push({
            rowIndex: rowIdx++,
            data: {
              _type: "transaction",
              date: dateVal,
              transactionType: txType,
              categoryCode: String(r["Hạng Mục"] ?? r["Hạng mục"] ?? "HM01").trim(),
              itemCode,
              itemName: String(r["Tên Hàng Hóa / Dịch Vụ"] ?? r["Tên VT"] ?? itemCode).trim(),
              partyName: String(r["Nhà CC / Nhà Thầu"] ?? r["NCC/Đội"] ?? "").trim() || undefined,
              qty: num(r["Số Lượng"] ?? r["KL"] ?? 0),
              unit: String(r["ĐVT"] ?? "").trim(),
              unitPriceTt: num(r["Đơn Giá Thực Tế (VNĐ)"] ?? r["ĐG TT"] ?? 0),
              unitPriceHd: num(r["Đơn Giá HĐ (VNĐ)"] ?? r["ĐG HĐ"] ?? 0),
              amountTt: num(r["Thanh Toán Thực Tế (VNĐ)"] ?? 0),
              amountHd: num(r["Thanh Toán HĐ (VNĐ)"] ?? 0),
              invoiceNo: String(r["Số HĐ"] ?? "").trim() || undefined,
            },
          });
        }
      }
    }

    return { rows, conflicts: [], meta: { sheetCount: wb.SheetNames.length, projectCode, projectName } };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      if (row.data._type === "estimate" && !row.data.itemCode) {
        errors.push({ rowIndex: row.rowIndex, field: "itemCode", message: "Mã vật tư rỗng" });
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

    const projectRow = data.rows.find((r) => r.data._type === "project");
    if (!projectRow) {
      return {
        rowsTotal: data.rows.length,
        rowsImported: 0,
        rowsSkipped: data.rows.length,
        errors: [{ rowIndex: 0, message: "Không tìm thấy thông tin dự án" }],
      };
    }

    const projectCode = String(projectRow.data.code ?? "DA001");
    let project = await db.project.findFirst({ where: { code: projectCode, deletedAt: null } });
    if (!project) {
      project = await db.project.create({
        data: {
          code: projectCode,
          name: String(projectRow.data.name ?? "Dự án nhập"),
          ownerInvestor: projectRow.data.ownerInvestor as string | undefined,
          contractValue: projectRow.data.contractValue
            ? String(projectRow.data.contractValue)
            : undefined,
        },
      });
      imported++;
    } else {
      skipped++;
    }
    const projectId = project.id;

    const catCache = new Map<string, number>();
    async function getOrCreateCategory(code: string, name: string): Promise<number> {
      if (catCache.has(code)) return catCache.get(code)!;
      const existing = await db.projectCategory.findFirst({
        where: { projectId, code, deletedAt: null },
      });
      if (existing) {
        catCache.set(code, existing.id);
        return existing.id;
      }
      const created = await db.projectCategory.create({
        data: { projectId, code, name, sortOrder: catCache.size },
      });
      catCache.set(code, created.id);
      imported++;
      return created.id;
    }

    for (const row of data.rows.filter((r) => r.data._type === "estimate")) {
      try {
        const catCode = String(row.data.categoryCode ?? "HM01");
        const categoryId = await getOrCreateCategory(catCode, String(row.data.categoryName ?? catCode));
        const itemCode = String(row.data.itemCode ?? "");
        const existing = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM project_estimates
          WHERE "projectId" = ${projectId} AND "categoryId" = ${categoryId}
            AND "itemCode" = ${itemCode} AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        const qty = Number(row.data.qty ?? 0);
        const unitPrice = Number(row.data.unitPrice ?? 0);
        const totalVnd = qty * unitPrice;

        await db.$executeRaw`
          INSERT INTO project_estimates
            ("projectId", "categoryId", "itemCode", "itemName", unit, qty, "unitPrice", "totalVnd", "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${categoryId}, ${itemCode}, ${String(row.data.itemName ?? itemCode)},
             ${String(row.data.unit ?? "")}, ${qty}, ${unitPrice}, ${totalVnd},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    for (const row of data.rows.filter((r) => r.data._type === "transaction")) {
      try {
        const catCode = String(row.data.categoryCode ?? "HM01");
        const categoryId = await getOrCreateCategory(catCode, catCode);
        const date = row.data.date as Date;
        const itemCode = String(row.data.itemCode ?? "");
        const qty = Number(row.data.qty ?? 0);
        const unitPriceTt = Number(row.data.unitPriceTt ?? 0);
        const unitPriceHd = Number(row.data.unitPriceHd ?? 0);
        const amountTt = row.data.amountTt ? Number(row.data.amountTt) : qty * unitPriceTt;
        const amountHd = row.data.amountHd ? Number(row.data.amountHd) : qty * unitPriceHd;

        await db.$executeRaw`
          INSERT INTO project_transactions
            ("projectId", date, "transactionType", "categoryId", "itemCode", "itemName",
             "partyName", qty, unit, "unitPriceTt", "unitPriceHd",
             "amountTt", "amountHd", "invoiceNo", status, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${date}, ${String(row.data.transactionType ?? "lay_hang")}, ${categoryId}, ${itemCode},
             ${String(row.data.itemName ?? itemCode)},
             ${row.data.partyName ? String(row.data.partyName) : null},
             ${qty}, ${String(row.data.unit ?? "")}, ${unitPriceTt}, ${unitPriceHd},
             ${amountTt}, ${amountHd},
             ${row.data.invoiceNo ? String(row.data.invoiceNo) : null},
             'approved', ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
