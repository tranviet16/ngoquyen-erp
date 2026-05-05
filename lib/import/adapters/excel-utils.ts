/**
 * Shared excel parsing helpers for stub-rebuilt adapters
 * (gach-nam-huong, quang-minh, sl-dt, cong-no-vat-tu).
 * The legacy adapters keep their inlined copies — DO NOT migrate them
 * unless the touch is part of a deliberate refactor.
 */

export function parseExcelDate(val: unknown): Date | null {
  if (val == null || val === "") return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") return new Date(Math.round((val - 25569) * 86400 * 1000));
  const s = String(val).trim();
  // Vietnamese DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function num(val: unknown): number {
  return parseFloat(String(val ?? "0").replace(/[^0-9.-]/g, "")) || 0;
}

/** Parse VND-style numbers: "12,800,000", "(123)", "-", "1.234,56" → number */
export function parseVndNumber(val: unknown): number {
  if (val == null || val === "" || val === "-") return 0;
  if (typeof val === "number") return val;
  const raw = String(val);
  const negative = raw.includes("(");
  const s = raw.replace(/[^\d.,\-]/g, "").replace(/[.,]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : negative ? -n : n;
}

/** Normalize a header label: trim, lowercase, collapse whitespace, strip accents. */
export function normHeader(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Find the row index containing all the given keyword fragments (any cell).
 * Returns -1 if not found. Keywords compared with `normHeader`.
 */
export function findHeaderRow(matrix: unknown[][], anyOf: string[]): number {
  const want = anyOf.map(normHeader);
  for (let i = 0; i < matrix.length; i++) {
    const cells = (matrix[i] || []).map(normHeader);
    // Header row = at least one cell equals one of the wanted tokens (exact match,
    // not substring — avoids matching long sentences that contain a keyword).
    for (const w of want) {
      if (cells.some((c) => c === w)) return i;
    }
  }
  return -1;
}

/**
 * Read a sheet as rows-of-records with dynamic header detection.
 * - `headerHints`: substrings that identify the header row (first hit wins).
 * - Returns { headers, rows, matrix } where rows[i] is keyed by raw header text.
 */
export function readSheetMatrix(sheet: unknown): unknown[][] {
  // dynamic import-free wrapper for callers that already have XLSX
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }) as unknown[][];
}

export function buildRowsFromMatrix(
  matrix: unknown[][],
  headerRowIdx: number,
): { headers: string[]; rows: Record<string, unknown>[] } {
  const headers = (matrix[headerRowIdx] || []).map((h) =>
    String(h ?? "").replace(/\s+/g, " ").trim(),
  );
  const rows: Record<string, unknown>[] = [];
  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const arr = matrix[i] || [];
    if (arr.every((c) => c == null || c === "")) continue;
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] || `__col_${j}`;
      obj[key] = arr[j] ?? null;
    }
    rows.push(obj);
  }
  return { headers, rows };
}

/** Find a value like "Tên vật tư: Gạch đặc A1" anywhere in the matrix; return everything after the colon. */
export function findLabeledValue(matrix: unknown[][], labelHint: string): string | null {
  const want = normHeader(labelHint);
  for (const row of matrix) {
    for (const cell of row || []) {
      const s = String(cell ?? "");
      if (!s) continue;
      if (normHeader(s).startsWith(want)) {
        const idx = s.indexOf(":");
        if (idx >= 0) return s.slice(idx + 1).trim();
      }
    }
  }
  return null;
}
