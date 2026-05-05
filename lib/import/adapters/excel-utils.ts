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
