/**
 * Adapter: Công nợ Vật tư 2025.xlsx
 * Target tables:
 *   - ledger_opening_balances (opening balances per supplier)
 *   - ledger_transactions (lay_hang + thanh_toan rows)
 *
 * Idempotency: skip if (date, entityId, partyId, transactionType, totalTt) tuple exists.
 * Bulk insert via prisma.$executeRaw — bypasses audit middleware (intentional, historical migration).
 */

import * as XLSX from "xlsx";
import { z } from "zod";
import { resolveSupplier, resolveEntity } from "../conflict-resolver";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ConflictItem,
  ResolvedMapping,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";

const RowSchema = z.object({
  date: z.string().or(z.number()),
  supplierName: z.string().min(1),
  transactionType: z.enum(["lay_hang", "thanh_toan", "dieu_chinh"]),
  amountTt: z.number(),
  amountHd: z.number().optional().default(0),
  invoiceNo: z.string().optional(),
  content: z.string().optional(),
  entityName: z.string().optional(),
});

function parseExcelDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === "number") {
    // Excel serial date
    return XLSX.SSF.parse_date_code
      ? new Date(Math.round((val - 25569) * 86400 * 1000))
      : new Date((val - 25569) * 86400 * 1000);
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

export const CongNoVatTuAdapter: ImportAdapter = {
  name: "cong-no-vat-tu",
  label: "Công nợ Vật tư 2025",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    const supplierNames = new Set<string>();
    const entityNames = new Set<string>();

    // Process first sheet (main ledger data)
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return { rows: [], conflicts: [], meta: { sheetName: "" } };

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    });

    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      // Normalise common Vietnamese column headers
      const supplierName = String(
        r["Nhà cung cấp"] ?? r["NCC"] ?? r["Supplier"] ?? r["Ten NCC"] ?? ""
      ).trim();
      const txType = String(r["Loại"] ?? r["Loai"] ?? r["Type"] ?? "lay_hang")
        .toLowerCase()
        .trim();
      const normalizedType =
        txType.includes("thanh") || txType.includes("tt")
          ? "thanh_toan"
          : txType.includes("dieu") || txType.includes("dc")
          ? "dieu_chinh"
          : "lay_hang";

      rows.push({
        rowIndex: i,
        data: {
          date: r["Ngày"] ?? r["Ngay"] ?? r["Date"] ?? null,
          supplierName,
          transactionType: normalizedType,
          amountTt: parseFloat(String(r["TT"] ?? r["Thực tế"] ?? r["Amount"] ?? "0").replace(/[^0-9.-]/g, "")) || 0,
          amountHd: parseFloat(String(r["HĐ"] ?? r["Hóa đơn"] ?? "0").replace(/[^0-9.-]/g, "")) || 0,
          invoiceNo: String(r["Số HĐ"] ?? r["Invoice"] ?? "").trim() || undefined,
          content: String(r["Nội dung"] ?? r["Content"] ?? "").trim() || undefined,
          entityName: String(r["Chủ thể"] ?? r["Entity"] ?? "").trim() || undefined,
        },
      });

      if (supplierName) supplierNames.add(supplierName);
      const entityName = String(r["Chủ thể"] ?? r["Entity"] ?? "").trim();
      if (entityName) entityNames.add(entityName);
    }

    // Build conflicts
    const conflicts: ConflictItem[] = [];
    for (const name of supplierNames) {
      conflicts.push(await resolveSupplier(name));
    }
    for (const name of entityNames) {
      conflicts.push(await resolveEntity(name));
    }

    return { rows, conflicts, meta: { sheetName } };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      const result = RowSchema.safeParse(row.data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            rowIndex: row.rowIndex,
            field: issue.path.join("."),
            message: issue.message,
          });
        }
      }
      if (!parseExcelDate(row.data.date)) {
        errors.push({ rowIndex: row.rowIndex, field: "date", message: "Ngày không hợp lệ" });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, mapping, tx): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    // Default entityId = 1 if not mapped
    const DEFAULT_ENTITY_ID = 1;

    for (const row of data.rows) {
      try {
        const supplierName = String(row.data.supplierName ?? "");
        const entityName = String(row.data.entityName ?? "");
        const partyId = mapping[`supplier:${supplierName}`];
        const entityId = mapping[`entity:${entityName}`] ?? DEFAULT_ENTITY_ID;

        if (!partyId) {
          skipped++;
          continue;
        }

        const date = parseExcelDate(row.data.date);
        if (!date) {
          errors.push({ rowIndex: row.rowIndex, message: "Ngày không hợp lệ, bỏ qua" });
          skipped++;
          continue;
        }

        const txType = String(row.data.transactionType);
        const amountTt = Number(row.data.amountTt ?? 0);
        const amountHd = Number(row.data.amountHd ?? 0);

        // Idempotency check: skip if exact tuple exists
        // Uses $executeRaw for bulk safety — bypasses audit middleware (intentional historical migration)
        const existing = await (tx as typeof import("@/lib/prisma")["prisma"]).$queryRaw<{ id: number }[]>`
          SELECT id FROM ledger_transactions
          WHERE "ledgerType" = 'material'
            AND date::date = ${date}::date
            AND "entityId" = ${entityId}
            AND "partyId" = ${partyId}
            AND "transactionType" = ${txType}
            AND "totalTt" = ${amountTt}
          LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await (tx as typeof import("@/lib/prisma")["prisma"]).$executeRaw`
          INSERT INTO ledger_transactions
            ("ledgerType", date, "transactionType", "entityId", "partyId",
             "amountTt", "vatPctTt", "vatTt", "totalTt",
             "amountHd", "vatPctHd", "vatHd", "totalHd",
             "invoiceNo", content, status, "createdAt", "updatedAt")
          VALUES
            ('material', ${date}, ${txType}, ${entityId}, ${partyId},
             ${amountTt}, 0, 0, ${amountTt},
             ${amountHd}, 0, 0, ${amountHd},
             ${String(row.data.invoiceNo ?? "")}, ${String(row.data.content ?? "")},
             'approved', NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
