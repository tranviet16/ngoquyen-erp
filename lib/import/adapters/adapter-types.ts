/**
 * Shared types for all import adapters.
 * Each adapter handles one Excel SOP file → one or more DB tables.
 */

import type { PrismaClient } from "@prisma/client";

export interface ParsedRow {
  /** Original 0-based row index from the sheet (for error messages) */
  rowIndex: number;
  /** Raw key-value data from the sheet */
  data: Record<string, unknown>;
}

export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ConflictItem {
  /** Source name from Excel */
  sourceName: string;
  /** Entity type needing resolution */
  entityType: "supplier" | "contractor" | "item" | "project" | "entity";
  /** Candidates found by fuzzy match */
  candidates: { id: number; name: string; score: number }[];
}

export interface ResolvedMapping {
  /** sourceName → resolved DB id (null = skip) */
  [sourceName: string]: number | null;
}

export interface ImportSummary {
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  errors: { rowIndex: number; message: string }[];
}

export interface ParsedData {
  rows: ParsedRow[];
  conflicts: ConflictItem[];
  meta: Record<string, unknown>;
}

/**
 * Contract every adapter must implement.
 * Adapters are stateless — no constructor args.
 *
 * The `tx` param in `apply()` is a Prisma transaction client.
 * We type it as `PrismaClient` for simplicity since the interactive
 * transaction client is structurally compatible with the base client.
 */
export interface ImportAdapter {
  /** Matches the `adapter` field in ImportRun */
  readonly name: string;
  /** Human-readable label shown in UI */
  readonly label: string;

  /**
   * Parse the raw Excel buffer into structured rows + detected conflicts.
   * Must NOT write to DB.
   */
  parse(buffer: Buffer): Promise<ParsedData>;

  /**
   * Validate parsed rows. Returns validation errors without touching DB.
   */
  validate(data: ParsedData): ValidationResult;

  /**
   * Write rows to DB inside a Prisma transaction.
   * IMPORTANT: Uses prisma.$executeRaw for bulk inserts to bypass audit middleware.
   * This is intentional for one-shot historical migration — documented bypass.
   * @param mapping User-resolved conflict mappings from ConflictItem resolution
   * @param tx Prisma transaction client (or base client during direct calls)
   * @param importRunId ID of the parent ImportRun — written onto inserted rows for rollback
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply(data: ParsedData, mapping: ResolvedMapping, tx: any, importRunId: number): Promise<ImportSummary>;
}
