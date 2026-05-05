/**
 * Adapter: Gạch Nam Hương 2025.xlsx
 * Target table: supplier_delivery_daily
 *
 * SOP convention: 1 file = 1 supplier = 1 material.
 * Sheet "Vật tư ngày" has a 6-row title block, then header row "STT | Ngày/tháng/năm | Khối lượng | ĐVT | ...".
 * Material name lives in title row "Tên vật tư: <name>".
 * Idempotency key: (supplierId, date, itemId, qty).
 * Bulk insert via $executeRaw — bypasses audit (intentional historical migration).
 */

import * as XLSX from "xlsx";
import { resolveSupplier, resolveItem } from "../conflict-resolver";
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
  ConflictItem,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";

const DEFAULT_SUPPLIER_NAME = "Nam Hương";

function pickSheet(wb: XLSX.WorkBook): string | null {
  const target = wb.SheetNames.find((n) => normHeader(n).includes("vat tu ngay"));
  if (target) return target;
  return wb.SheetNames.find((n) => normHeader(n).includes("ngay")) ?? null;
}

export const GachNamHuongAdapter: ImportAdapter = {
  name: "gach-nam-huong",
  label: "Gạch Nam Hương 2025",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = pickSheet(wb);
    if (!sheetName) return { rows: [], conflicts: [], meta: { sheetName: "" } };
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const headerIdx = findHeaderRow(matrix, ["stt", "khoi luong", "ngay/thang"]);
    if (headerIdx < 0) {
      return { rows: [], conflicts: [], meta: { sheetName, error: "Không tìm thấy header" } };
    }

    const itemName =
      findLabeledValue(matrix, "tên vật tư") ??
      findLabeledValue(matrix, "ten vat tu") ??
      "";
    if (!itemName) {
      return {
        rows: [],
        conflicts: [],
        meta: { sheetName, error: "Không tìm thấy 'Tên vật tư:' trong file" },
      };
    }

    const { rows: rawRows } = buildRowsFromMatrix(matrix, headerIdx);
    const rows: ParsedRow[] = [];
    const itemNames = new Set<string>([itemName]);

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      // skip totals/footer rows: STT must be numeric or null-data row already filtered.
      const stt = r["STT"];
      const date = r["Ngày/tháng/năm"] ?? r["Ngày"] ?? null;
      const qty = r["Khối lượng"] ?? r["Khối\n lượng"] ?? r["Khối\r\n lượng"] ?? r["KL"];
      if (date == null && (qty == null || qty === "")) continue;
      if (typeof stt === "string" && !/^\d/.test(stt.trim())) continue;
      rows.push({
        rowIndex: headerIdx + 1 + i,
        data: {
          date,
          itemName,
          unit: String(r["ĐVT"] ?? r["DVT"] ?? "").trim() || "viên",
          qty: num(qty),
          cbVatTu: String(r["Cán bộ vật tư"] ?? r["CB Vật tư"] ?? "").trim() || undefined,
          chiHuyCt:
            String(r["Chỉ huy công trường"] ?? r["Chỉ huy \r\ncông trường"] ?? r["Chỉ huy CT"] ?? "")
              .trim() || undefined,
          keToan:
            String(r["Kế toán phụ trách"] ?? r["Kế toán\r\n phụ trách"] ?? "").trim() || undefined,
          note: String(r["Ghi chú"] ?? r["Note"] ?? "").trim() || undefined,
        },
      });
    }

    const conflicts: ConflictItem[] = [await resolveSupplier(DEFAULT_SUPPLIER_NAME)];
    for (const name of itemNames) conflicts.push(await resolveItem(name));

    return { rows, conflicts, meta: { sheetName, defaultSupplier: DEFAULT_SUPPLIER_NAME, itemName } };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      if (!parseExcelDate(row.data.date)) {
        errors.push({ rowIndex: row.rowIndex, field: "date", message: "Ngày không hợp lệ" });
      }
      if (Number(row.data.qty) <= 0) {
        errors.push({ rowIndex: row.rowIndex, field: "qty", message: "Khối lượng phải > 0" });
      }
      if (!row.data.itemName) {
        errors.push({ rowIndex: row.rowIndex, field: "itemName", message: "Thiếu tên vật tư" });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, mapping, tx, importRunId): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    const supplierId = mapping[`supplier:${DEFAULT_SUPPLIER_NAME}`];
    if (!supplierId) {
      return {
        rowsTotal: data.rows.length,
        rowsImported: 0,
        rowsSkipped: data.rows.length,
        errors: [{ rowIndex: -1, message: `Chưa map nhà cung cấp "${DEFAULT_SUPPLIER_NAME}"` }],
      };
    }
    type Tx = typeof import("@/lib/prisma")["prisma"];
    const db = tx as Tx;

    for (const row of data.rows) {
      try {
        const itemName = String(row.data.itemName ?? "");
        const itemId = mapping[`item:${itemName}`];
        if (!itemId) {
          skipped++;
          continue;
        }
        const date = parseExcelDate(row.data.date);
        if (!date) {
          errors.push({ rowIndex: row.rowIndex, message: "Ngày không hợp lệ, bỏ qua" });
          skipped++;
          continue;
        }
        const qty = Number(row.data.qty ?? 0);

        const existing = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM supplier_delivery_daily
          WHERE "supplierId" = ${supplierId}
            AND date::date = ${date}::date
            AND "itemId" = ${itemId}
            AND qty = ${qty}
            AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await db.$executeRaw`
          INSERT INTO supplier_delivery_daily
            ("supplierId", date, "itemId", qty, unit, "cbVatTu", "chiHuyCt", note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${supplierId}, ${date}, ${itemId}, ${qty},
             ${String(row.data.unit ?? "viên")},
             ${row.data.cbVatTu ? String(row.data.cbVatTu) : null},
             ${row.data.chiHuyCt ? String(row.data.chiHuyCt) : null},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null},
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
