/**
 * Adapter: Gạch Nam Hương 2025.xlsx
 * Target table: supplier_delivery_daily (supplierId resolved via "Nam Hương" lookup)
 *
 * Sheet structure: single sheet
 *   Columns: Ngày | Mã VT | Tên VT | ĐVT | KL | CB Vật tư | Chỉ huy CT | Ghi chú
 * Idempotency key: (supplierId, date, itemId, qty)
 * Bulk insert via $executeRaw — bypasses audit (intentional historical migration).
 */

import * as XLSX from "xlsx";
import { resolveSupplier, resolveItem } from "../conflict-resolver";
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

const DEFAULT_SUPPLIER_NAME = "Nam Hương";

export const GachNamHuongAdapter: ImportAdapter = {
  name: "gach-nam-huong",
  label: "Gạch Nam Hương 2025",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return { rows: [], conflicts: [], meta: { sheetName: "" } };

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    });

    const rows: ParsedRow[] = [];
    const itemNames = new Set<string>();

    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      const itemName = String(r["Tên VT"] ?? r["Ten VT"] ?? r["Item"] ?? r["Mã VT"] ?? "").trim();
      if (!itemName) continue;
      itemNames.add(itemName);
      rows.push({
        rowIndex: i,
        data: {
          date: r["Ngày"] ?? r["Ngay"] ?? r["Date"] ?? null,
          itemName,
          unit: String(r["ĐVT"] ?? r["DVT"] ?? r["Unit"] ?? "").trim() || "kg",
          qty: num(r["KL"] ?? r["SL"] ?? r["Qty"]),
          cbVatTu: String(r["CB Vật tư"] ?? r["CB VT"] ?? "").trim() || undefined,
          chiHuyCt: String(r["Chỉ huy CT"] ?? r["CHCT"] ?? "").trim() || undefined,
          note: String(r["Ghi chú"] ?? r["Note"] ?? "").trim() || undefined,
        },
      });
    }

    const conflicts: ConflictItem[] = [await resolveSupplier(DEFAULT_SUPPLIER_NAME)];
    for (const name of itemNames) conflicts.push(await resolveItem(name));

    return { rows, conflicts, meta: { sheetName, defaultSupplier: DEFAULT_SUPPLIER_NAME } };
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

  async apply(data, mapping, tx): Promise<ImportSummary> {
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
            ("supplierId", date, "itemId", qty, unit, "cbVatTu", "chiHuyCt", note, "createdAt", "updatedAt")
          VALUES
            (${supplierId}, ${date}, ${itemId}, ${qty},
             ${String(row.data.unit ?? "kg")},
             ${row.data.cbVatTu ? String(row.data.cbVatTu) : null},
             ${row.data.chiHuyCt ? String(row.data.chiHuyCt) : null},
             ${row.data.note ? String(row.data.note) : null},
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
