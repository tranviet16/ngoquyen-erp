/**
 * Adapter: Quản Lý Công Nợ Vật Tư.xlsx
 * Sheets imported:
 *   - "Nhập Liệu"        → ledger_transactions (kind: "tx")
 *   - "Số Dư Ban Đầu"    → ledger_opening_balances (kind: "open")
 *
 * Auto-resolves suppliers/entities by name (find-or-create) — empty mapping
 * still works. Idempotent on re-import.
 */

import * as XLSX from "xlsx";
import { z } from "zod";
import { resolveSupplier, resolveEntity } from "../conflict-resolver";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ConflictItem,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";
import { parseExcelDate } from "./excel-utils";
import { findSheet, parseTxSheet, parseOpenSheet } from "./cong-no-vat-tu.parse";

const TxSchema = z.object({
  kind: z.literal("tx"),
  date: z.union([z.string(), z.number(), z.date()]),
  supplierName: z.string().min(1),
  transactionType: z.enum(["lay_hang", "thanh_toan", "dieu_chinh"]),
  amountTt: z.number(),
  amountHd: z.number().optional().default(0),
});

const OpenSchema = z.object({
  kind: z.literal("open"),
  asOfDate: z.union([z.string(), z.number(), z.date()]),
  supplierName: z.string().min(1),
  entityName: z.string().min(1),
  balanceTt: z.number(),
  balanceHd: z.number(),
});

export const CongNoVatTuAdapter: ImportAdapter = {
  name: "cong-no-vat-tu",
  label: "Công nợ Vật tư",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const supplierNames = new Set<string>();
    const entityNames = new Set<string>();

    const txSheetName = findSheet(wb, "nhập liệu", "nhap lieu");
    const openSheetName = findSheet(wb, "số dư ban đầu", "so du ban dau");

    const rows: ParsedRow[] = [];
    if (txSheetName) rows.push(...parseTxSheet(wb.Sheets[txSheetName]!, 0, supplierNames, entityNames));
    if (openSheetName) rows.push(...parseOpenSheet(wb.Sheets[openSheetName]!, 100000, supplierNames, entityNames));

    const conflicts: ConflictItem[] = [];
    for (const name of supplierNames) conflicts.push(await resolveSupplier(name));
    for (const name of entityNames) conflicts.push(await resolveEntity(name));

    return { rows, conflicts, meta: { txSheet: txSheetName, openSheet: openSheetName } };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      const schema = row.data.kind === "open" ? OpenSchema : TxSchema;
      const result = schema.safeParse(row.data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ rowIndex: row.rowIndex, field: issue.path.join("."), message: issue.message });
        }
      }
      const dateField = row.data.kind === "open" ? row.data.asOfDate : row.data.date;
      if (!parseExcelDate(dateField)) {
        errors.push({ rowIndex: row.rowIndex, field: "date", message: "Ngày không hợp lệ" });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, mapping, tx): Promise<ImportSummary> {
    type TxClient = typeof import("@/lib/prisma")["prisma"];
    const db = tx as unknown as TxClient;
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];

    // Per-run name → id cache (find-or-create)
    const supplierCache = new Map<string, number>();
    const entityCache = new Map<string, number>();
    const projectCache = new Map<string, number>();

    async function getSupplierId(name: string): Promise<number> {
      if (supplierCache.has(name)) return supplierCache.get(name)!;
      const fromMap = mapping[`supplier:${name}`];
      if (fromMap) { supplierCache.set(name, fromMap); return fromMap; }
      const found = await db.supplier.findFirst({ where: { name, deletedAt: null }, select: { id: true } });
      if (found) { supplierCache.set(name, found.id); return found.id; }
      const created = await db.supplier.create({ data: { name }, select: { id: true } });
      supplierCache.set(name, created.id);
      return created.id;
    }

    async function getEntityId(name: string): Promise<number> {
      if (entityCache.has(name)) return entityCache.get(name)!;
      const fromMap = mapping[`entity:${name}`];
      if (fromMap) { entityCache.set(name, fromMap); return fromMap; }
      const found = await db.entity.findFirst({ where: { name, deletedAt: null }, select: { id: true } });
      if (found) { entityCache.set(name, found.id); return found.id; }
      const created = await db.entity.create({ data: { name, type: "company" }, select: { id: true } });
      entityCache.set(name, created.id);
      return created.id;
    }

    async function getProjectId(name: string): Promise<number | null> {
      if (!name) return null;
      if (projectCache.has(name)) return projectCache.get(name)!;
      const fromMap = mapping[`project:${name}`];
      if (fromMap) { projectCache.set(name, fromMap); return fromMap; }
      const found = await db.project.findFirst({ where: { name, deletedAt: null }, select: { id: true } });
      if (found) { projectCache.set(name, found.id); return found.id; }
      return null;
    }

    for (const row of data.rows) {
      try {
        if (row.data.kind === "open") {
          const supplierName = String(row.data.supplierName);
          const entityName = String(row.data.entityName);
          const projectName = String(row.data.projectName ?? "");
          const partyId = await getSupplierId(supplierName);
          const entityId = await getEntityId(entityName);
          const projectId = await getProjectId(projectName);
          const asOfDate = parseExcelDate(row.data.asOfDate)!;
          const balTt = Number(row.data.balanceTt ?? 0);
          const balHd = Number(row.data.balanceHd ?? 0);

          const existing = projectId === null
            ? await db.$queryRaw<{ id: number }[]>`
                SELECT id FROM ledger_opening_balances
                WHERE "ledgerType" = 'material'
                  AND "entityId" = ${entityId}
                  AND "partyId" = ${partyId}
                  AND "projectId" IS NULL
                LIMIT 1`
            : await db.$queryRaw<{ id: number }[]>`
                SELECT id FROM ledger_opening_balances
                WHERE "ledgerType" = 'material'
                  AND "entityId" = ${entityId}
                  AND "partyId" = ${partyId}
                  AND "projectId" = ${projectId}
                LIMIT 1`;
          if (existing.length > 0) { skipped++; continue; }

          await db.$executeRaw`
            INSERT INTO ledger_opening_balances
              ("ledgerType", "entityId", "partyId", "projectId",
               "balanceTt", "balanceHd", "asOfDate", "createdAt", "updatedAt")
            VALUES
              ('material', ${entityId}, ${partyId}, ${projectId},
               ${balTt}, ${balHd}, ${asOfDate}, NOW(), NOW())
          `;
          imported++;
          continue;
        }

        // Transaction row
        const supplierName = String(row.data.supplierName);
        const entityName = String(row.data.entityName ?? "Công Ty Quản Lý");
        const partyId = await getSupplierId(supplierName);
        const entityId = await getEntityId(entityName);
        const date = parseExcelDate(row.data.date)!;
        const txType = String(row.data.transactionType);
        const amountTt = Number(row.data.amountTt ?? 0);
        const amountHd = Number(row.data.amountHd ?? 0);

        const existing = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM ledger_transactions
          WHERE "ledgerType" = 'material'
            AND date::date = ${date}::date
            AND "entityId" = ${entityId}
            AND "partyId" = ${partyId}
            AND "transactionType" = ${txType}
            AND "totalTt" = ${amountTt}
          LIMIT 1
        `;
        if (existing.length > 0) { skipped++; continue; }

        await db.$executeRaw`
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
