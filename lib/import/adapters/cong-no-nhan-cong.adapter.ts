/**
 * Adapter: Quản Lý Công Nợ Nhân Công.xlsx
 * Sheets imported:
 *   - "Nhập Liệu"        -> ledger_transactions (ledgerType: "labor")
 *   - "Số Dư Ban Đầu"    -> ledger_opening_balances (ledgerType: "labor")
 */

import * as XLSX from "xlsx";
import { z } from "zod";
import { resolveContractor, resolveEntity } from "../conflict-resolver";
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

const PARTY_HEADERS = ["Đội Thi Công", "Đội thi công", "Đội", "Nhân Công", "Nhân công", "NC", "Nhà Cung Cấp", "NCC"];
const ITEM_HEADERS = ["Tên Nhân Công", "Tên nhân công", "Hạng Mục", "Hạng mục", "Nội dung"];

const TxSchema = z.object({
  kind: z.literal("tx"),
  date: z.union([z.string(), z.number(), z.date()]),
  contractorName: z.string().min(1),
  transactionType: z.enum(["lay_hang", "thanh_toan", "dieu_chinh"]),
  amountTt: z.number(),
  amountHd: z.number().optional().default(0),
});

const OpenSchema = z.object({
  kind: z.literal("open"),
  asOfDate: z.union([z.string(), z.number(), z.date()]),
  contractorName: z.string().min(1),
  entityName: z.string().min(1),
  balanceTt: z.number(),
  balanceHd: z.number(),
});

function toLaborRows(rows: ParsedRow[]): ParsedRow[] {
  return rows.map((row) => {
    const { supplierName, ...rest } = row.data;
    return { ...row, data: { ...rest, contractorName: supplierName } };
  });
}

function slugifyProjectCode(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `proj-${Date.now()}`;
}

export const CongNoNhanCongAdapter: ImportAdapter = {
  name: "cong-no-nhan-cong",
  label: "Công nợ Nhân công",
  supportsRollback: true,

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const contractorNames = new Set<string>();
    const entityNames = new Set<string>();
    const options = { partyHeaders: PARTY_HEADERS, itemHeaders: ITEM_HEADERS };

    const txSheetName = findSheet(wb, "nhập liệu", "nhap lieu");
    const openSheetName = findSheet(wb, "số dư ban đầu", "so du ban dau");

    const rows: ParsedRow[] = [];
    if (txSheetName) rows.push(...toLaborRows(parseTxSheet(wb.Sheets[txSheetName]!, 0, contractorNames, entityNames, options)));
    if (openSheetName) rows.push(...toLaborRows(parseOpenSheet(wb.Sheets[openSheetName]!, 100000, contractorNames, entityNames, options)));

    const conflicts: ConflictItem[] = [];
    for (const name of contractorNames) conflicts.push(await resolveContractor(name));
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

  async apply(data, mapping, tx, importRunId): Promise<ImportSummary> {
    type TxClient = typeof import("@/lib/prisma")["prisma"];
    const db = tx as unknown as TxClient;
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    const contractorCache = new Map<string, number>();
    const entityCache = new Map<string, number>();
    const projectCache = new Map<string, number>();
    const openingGroups = new Map<string, {
      entityId: number;
      partyId: number;
      projectId: number | null;
      asOfDate: Date;
      balanceTt: number;
      balanceHd: number;
      sourceRows: number;
    }>();

    async function getContractorId(name: string): Promise<number> {
      if (contractorCache.has(name)) return contractorCache.get(name)!;
      const fromMap = mapping[`contractor:${name}`];
      if (fromMap) { contractorCache.set(name, fromMap); return fromMap; }
      const found = await db.contractor.findFirst({ where: { name, deletedAt: null }, select: { id: true } });
      if (found) { contractorCache.set(name, found.id); return found.id; }
      const created = await db.contractor.create({ data: { name }, select: { id: true } });
      contractorCache.set(name, created.id);
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
      const created = await db.project.create({ data: { code: slugifyProjectCode(name), name }, select: { id: true } });
      projectCache.set(name, created.id);
      return created.id;
    }

    for (const row of data.rows) {
      try {
        const contractorName = String(row.data.contractorName);
        const entityName = String(row.data.entityName ?? "Công Ty Quản Lý");
        const projectName = String(row.data.projectName ?? "");
        const partyId = await getContractorId(contractorName);
        const entityId = await getEntityId(entityName);
        const projectId = await getProjectId(projectName);

        if (row.data.kind === "open") {
          const asOfDate = parseExcelDate(row.data.asOfDate)!;
          const balanceTt = Number(row.data.balanceTt ?? 0);
          const balanceHd = Number(row.data.balanceHd ?? 0);
          const key = `${entityId}:${partyId}:${projectId ?? "null"}`;
          const existingGroup = openingGroups.get(key);
          if (existingGroup) {
            existingGroup.balanceTt += balanceTt;
            existingGroup.balanceHd += balanceHd;
            existingGroup.sourceRows++;
            if (asOfDate > existingGroup.asOfDate) existingGroup.asOfDate = asOfDate;
          } else {
            openingGroups.set(key, { entityId, partyId, projectId, asOfDate, balanceTt, balanceHd, sourceRows: 1 });
          }
          continue;
        }

        const date = parseExcelDate(row.data.date)!;
        const amountTt = Number(row.data.amountTt ?? 0);
        const amountHd = Number(row.data.amountHd ?? 0);
        await db.$executeRaw`
          INSERT INTO ledger_transactions
            ("ledgerType", date, "transactionType", "entityId", "partyId", "projectId",
             "amountTt", "vatPctTt", "vatTt", "totalTt", "amountHd", "vatPctHd", "vatHd", "totalHd",
             "invoiceNo", content, status, "importRunId", "createdAt", "updatedAt")
          VALUES
            ('labor', ${date}, ${String(row.data.transactionType)}, ${entityId}, ${partyId}, ${projectId},
             ${amountTt}, 0, 0, ${amountTt}, ${amountHd}, 0, 0, ${amountHd},
             ${String(row.data.invoiceNo ?? "")}, ${String(row.data.content ?? "")}, 'approved', ${importRunId}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    for (const group of openingGroups.values()) {
      try {
        const existing = await db.ledgerOpeningBalance.findFirst({
          where: { ledgerType: "labor", entityId: group.entityId, partyId: group.partyId, projectId: group.projectId },
          select: { id: true },
        });
        if (existing) { skipped += group.sourceRows; continue; }

        await db.$executeRaw`
          INSERT INTO ledger_opening_balances
            ("ledgerType", "entityId", "partyId", "projectId", "balanceTt", "balanceHd", "asOfDate", "importRunId", "createdAt", "updatedAt")
          VALUES ('labor', ${group.entityId}, ${group.partyId}, ${group.projectId}, ${group.balanceTt}, ${group.balanceHd}, ${group.asOfDate}, ${importRunId}, NOW(), NOW())
        `;
        imported += group.sourceRows;
      } catch (err) {
        errors.push({ rowIndex: -1, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
