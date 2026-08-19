/**
 * Adapter: Bảng cân đối vật tư (per-project workbook, e.g. "Bang cân đối vật tư.xlsx")
 * Target tables: projects, project_categories, project_estimates, project_transactions
 *
 * Sheet layout: repeated HM blocks, each headed by a cell starting with "HM:".
 * Inside a block, sections are marked by Roman numerals (I Vật liệu, II Chi phí chung,
 * III Nhân công, IV Máy thi công) or bare labels ("NHÂN CÔNG", "Máy").
 * Columns: STT | Tên vật tư | ĐV | Dự Toán (SL/ĐG/TT) | Hoá đơn (SL/ĐG/TT) |
 * Còn phải nhập (SL/ĐG/TT — derived, never imported) | Số HĐ | free-form notes.
 *
 * Emission rules:
 *   - Row with dự toán values → project_estimates (totalVnd = sheet TT as-is).
 *   - Hóa đơn values → project_transactions with amounts in the Hd columns and
 *     amountTt = 0 ("thực tế chưa nhập"); invoice sub-lines (blank STT, no dự toán)
 *     inherit the preceding estimate's itemCode so vw_project_norm joins them.
 *   - "Phần hoá đơn có" switches to orphan mode: invoice-only lines get their own codes.
 *   - Section "Chi phí chung" carries its amount on the header row → one
 *     chi_phi_chung transaction (SL=1, ĐVT "gói").
 *   - "Cộng ..." / "Tổng ..." rows are captured for the reconciliation gate, not emitted.
 *
 * Validation gate: per (HM, section) the parsed estimate/transaction sums must match
 * the sheet's own subtotal rows within ±0.5% — a failed gate blocks the import.
 *
 * Idempotency: project matched by fixed code; estimates deduped by
 * (projectId, categoryId, itemCode). Transactions have NO dedup — re-import requires
 * rollback of the previous run first. Synthetic itemCodes are sequence-based per
 * (HM, section): stable only while sheet row order is unchanged.
 */

import * as XLSX from "xlsx";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";
import { normHeader } from "./excel-utils";

const PROJECT_CODE = "MNTC-GD1";
const PROJECT_NAME = "Mầm Non Trại Chuối GĐ1";
const IMPORT_NOTE = "Nhập từ bảng cân đối vật tư";
/** Relative tolerance for the subtotal reconciliation gate. */
const GATE_TOLERANCE = 0.005;
/** Absolute floor (VNĐ) so zero/near-zero subtotals don't trip on rounding dust. */
const GATE_FLOOR_VND = 1000;

interface SectionDef {
  code: string;
  label: string;
  txType: string;
}

const SECTIONS: Record<string, SectionDef> = {
  "vat lieu": { code: "VL", label: "Vật liệu", txType: "lay_hang" },
  "chi phi chung": { code: "CPC", label: "Chi phí chung", txType: "chi_phi_chung" },
  "nhan cong": { code: "NC", label: "Nhân công", txType: "nhan_cong" },
  "may thi cong": { code: "MAY", label: "Máy thi công", txType: "may_moc" },
  "may": { code: "MAY", label: "Máy thi công", txType: "may_moc" },
};

/**
 * Parse a VN-formatted sheet number: "  2,265 ", "1,231.481", "(10,266)" → -10266,
 * "-"/"Xong"/"#REF!"/blank → null. Thousands = comma, decimal = dot (sheet convention).
 */
export function parseSheetNumber(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  let s = String(val).trim();
  if (!s || s === "-" || s === "—") return null;
  const negative = s.startsWith("(") && s.endsWith(")");
  s = s.replace(/[()]/g, "").replace(/\s+/g, "");
  if (!s || s === "-") return null;
  if (!/^-?\d[\d,]*(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s.replace(/,/g, ""));
  if (isNaN(n)) return null;
  return negative ? -n : n;
}

/** Số HĐ: numeric-ish values lose Excel thousands separators ("1,650" → "1650"); composites kept verbatim ("7+9"). */
function normalizeInvoiceNo(val: unknown): string | undefined {
  const s = String(val ?? "").trim();
  if (!s) return undefined;
  if (/^[\d\s.,]+$/.test(s)) return s.replace(/[\s,]/g, "").replace(/\.0+$/, "");
  return s;
}

function cellText(val: unknown): string {
  return String(val ?? "").trim();
}

/** Free-text remark cells right of Số HĐ (cols 13–16); numeric scratch values are ignored. */
function collectNote(row: unknown[]): string | undefined {
  const parts: string[] = [];
  for (let c = 13; c <= 16; c++) {
    const s = cellText(row[c]);
    if (s && /[A-Za-zÀ-ỹà-ỹ]/.test(s) && !s.includes("#REF")) parts.push(s);
  }
  return parts.length ? parts.join("; ") : undefined;
}

interface SheetSubtotal {
  dtTt: number;
  hdTt: number;
}

export const BangCanDoiVatTuAdapter: ImportAdapter = {
  name: "bang-can-doi-vat-tu",
  label: "Bảng cân đối vật tư (Dự toán + Hóa đơn)",
  supportsRollback: true,

  async parse(buffer: Buffer): Promise<ParsedData> {
    // XLSX decodes bare CSV buffers as latin1, mangling Vietnamese; only real
    // .xlsx files (zip magic "PK") go through the buffer path.
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    const wb = isZip
      ? XLSX.read(buffer, { type: "buffer", cellDates: true })
      : XLSX.read(buffer.toString("utf8").replace(/^﻿/, ""), { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const rows: ParsedRow[] = [];
    const sheetSubtotals: Record<string, SheetSubtotal> = {};
    const grandTotals: Record<string, SheetSubtotal> = {};
    const warnings: { rowIndex: number; message: string }[] = [];
    const hmBlocks: { slug: string; label: string }[] = [];

    let hmIndex = 0;
    let hmSlug = "";
    let hmLabel = "";
    let section: SectionDef | null = null;
    const subtotalMeta: { hm: string; hmLabel: string; section: SectionDef; dtTt: number; hdTt: number }[] = [];
    let orphanMode = false;
    let lastEstimate: { itemCode: string } | null = null;
    let lastTxn: { itemCode: string; itemName: string; unit: string } | null = null;
    const seqCounters = new Map<string, number>();

    const nextCode = (): string => {
      const key = `${hmSlug}-${section!.code}`;
      const seq = (seqCounters.get(key) ?? 0) + 1;
      seqCounters.set(key, seq);
      return `${key}-${String(seq).padStart(3, "0")}`;
    };
    const categoryOf = () => ({
      categoryCode: `${hmSlug}-${section!.code}`,
      categoryName: `${hmLabel} — ${section!.label}`,
    });

    const pushEstimate = (d: {
      rowIndex: number; itemCode: string; itemName: string; unit: string;
      qty: number; unitPrice: number; totalVnd: number; note?: string;
    }) => {
      rows.push({
        rowIndex: d.rowIndex,
        data: { _type: "estimate", hm: hmSlug, sectionCode: section!.code, ...categoryOf(), ...d },
      });
    };
    const pushTxn = (d: {
      rowIndex: number; itemCode: string; itemName: string; unit: string;
      qty: number; unitPriceHd: number; amountHd: number; invoiceNo?: string; note?: string;
    }): { itemCode: string; itemName: string; unit: string } => {
      rows.push({
        rowIndex: d.rowIndex,
        data: {
          _type: "transaction", hm: hmSlug, sectionCode: section!.code,
          transactionType: section!.txType, ...categoryOf(), ...d,
          // Adapter rows are invoice records: sheet's HĐ SL is both qty and qtyHd
          qtyHd: d.qty,
        },
      });
      return { itemCode: d.itemCode, itemName: d.itemName, unit: d.unit };
    };

    for (let i = 0; i < matrix.length; i++) {
      const row = matrix[i] || [];
      const stt = cellText(row[0]);
      const name = cellText(row[1]);

      // New HM block
      if (/^hm\s*:/i.test(stt)) {
        hmIndex++;
        hmSlug = `HM${hmIndex}`;
        hmLabel = stt.replace(/^hm\s*:/i, "").trim();
        hmBlocks.push({ slug: hmSlug, label: hmLabel });
        section = null;
        orphanMode = false;
        lastEstimate = null;
        lastTxn = null;
        continue;
      }
      if (!hmSlug) continue; // preamble before first HM

      const normName = normHeader(name);

      // Section switch: Roman numeral STT, or a bare section label with no data
      const isRoman = /^(I|II|III|IV|V)$/.test(stt);
      const labelSection = !stt && SECTIONS[normName] ? SECTIONS[normName] : null;
      if (isRoman || labelSection) {
        section = isRoman ? (SECTIONS[normName] ?? null) : labelSection;
        orphanMode = false;
        lastEstimate = null;
        lastTxn = null;
        // "Chi phí chung" carries its amount on the section header row itself
        const headerHd = parseSheetNumber(row[8]);
        if (section && section.code === "CPC" && headerHd) {
          const code = nextCode();
          lastTxn = pushTxn({
            rowIndex: i, itemCode: code, itemName: section.label, unit: "gói",
            qty: 1, unitPriceHd: headerHd, amountHd: headerHd,
            invoiceNo: normalizeInvoiceNo(row[12]), note: collectNote(row),
          });
          sheetSubtotals[`${hmSlug}-CPC`] = { dtTt: 0, hdTt: headerHd };
        }
        continue;
      }
      // Subtotal rows — captured for the gate, never emitted. Whitelisted so item
      // names like "Công tác 1 chiều" / "Cồn rửa" are not mistaken for "Cộng ...".
      const subMatch = normName.match(/^(cong|tong)(?:\s+(.*))?$/);
      if (subMatch) {
        const kind = subMatch[1];
        const rest = subMatch[2] ?? "";
        const isSubtotalRow =
          kind === "tong" || rest === "" ||
          /^(vl|vat lieu|nc|nhan cong|may|may thi cong|tong)\b/.test(rest);
        if (isSubtotalRow) {
          const dtTt = parseSheetNumber(row[5]) ?? 0;
          const hdTt = parseSheetNumber(row[8]) ?? 0;
          if (kind === "tong" || rest.startsWith("tong")) {
            grandTotals[hmSlug] = { dtTt, hdTt };
          } else if (section) {
            sheetSubtotals[`${hmSlug}-${section.code}`] = { dtTt, hdTt };
            subtotalMeta.push({ hm: hmSlug, hmLabel, section, dtTt, hdTt });
          }
          section = null; // closes the section; stray scratch rows below are ignored
          orphanMode = false;
          lastEstimate = null;
          lastTxn = null;
          continue;
        }
      }

      if (!section) continue;

      // "Phần hoá đơn có": invoice-only lines with no estimate to attach to
      if (normName.startsWith("phan hoa don")) {
        orphanMode = true;
        lastTxn = null;
        continue;
      }

      if (normHeader(stt) === "stt") continue; // header echo

      const unit = cellText(row[2]);
      const dtSl = parseSheetNumber(row[3]);
      const dtDg = parseSheetNumber(row[4]);
      const dtTt = parseSheetNumber(row[5]);
      const hdSl = parseSheetNumber(row[6]);
      const hdDg = parseSheetNumber(row[7]);
      const hdTt = parseSheetNumber(row[8]);
      const invoiceNo = normalizeInvoiceNo(row[12]);
      const note = collectNote(row);

      const estTotal = dtTt ?? (dtSl != null && dtDg != null ? dtSl * dtDg : null);
      const hasDt = estTotal != null && estTotal !== 0;
      const amountHd = hdTt ?? (hdSl != null && hdDg != null ? hdSl * hdDg : null);
      const hasHd = amountHd != null && amountHd !== 0;

      if (orphanMode) {
        if (name && hasHd) {
          lastTxn = pushTxn({
            rowIndex: i, itemCode: nextCode(), itemName: name, unit,
            qty: hdSl ?? 0, unitPriceHd: hdDg ?? 0, amountHd: amountHd!, invoiceNo, note,
          });
        } else if (!name && hasHd && hdSl != null && lastTxn) {
          lastTxn = pushTxn({
            rowIndex: i, itemCode: lastTxn.itemCode, itemName: lastTxn.itemName,
            unit: unit || lastTxn.unit, qty: hdSl, unitPriceHd: hdDg ?? 0,
            amountHd: amountHd!, invoiceNo, note,
          });
        }
        continue;
      }

      const isNumberedItem = /^\d+$/.test(stt);

      if (isNumberedItem || (!stt && hasDt)) {
        let code: string | null = null;
        if (hasDt) {
          code = nextCode();
          const qty = dtSl ?? 0;
          const unitPrice = dtDg ?? 0;
          if (dtTt != null && qty && unitPrice) {
            const computed = qty * unitPrice;
            if (Math.abs(dtTt - computed) / Math.max(Math.abs(dtTt), 1) > GATE_TOLERANCE) {
              warnings.push({
                rowIndex: i,
                message: `"${name}": TT dự toán ${dtTt.toLocaleString()} ≠ SL×ĐG ${Math.round(computed).toLocaleString()} (giữ TT của sheet)`,
              });
            }
          }
          pushEstimate({
            rowIndex: i, itemCode: code, itemName: name || code, unit,
            qty, unitPrice, totalVnd: estTotal!, note,
          });
          lastEstimate = { itemCode: code };
        }
        if (hasHd) {
          lastTxn = pushTxn({
            rowIndex: i, itemCode: code ?? nextCode(), itemName: name || "(không tên)",
            unit, qty: hdSl ?? 0, unitPriceHd: hdDg ?? 0, amountHd: amountHd!, invoiceNo, note,
          });
        }
        continue;
      }

      // Blank STT, no dự toán → invoice sub-line of the preceding estimate
      if (!stt && hasHd) {
        if (name) {
          const code = lastEstimate?.itemCode ?? nextCode();
          lastTxn = pushTxn({
            rowIndex: i, itemCode: code, itemName: name, unit,
            qty: hdSl ?? 0, unitPriceHd: hdDg ?? 0, amountHd: amountHd!, invoiceNo, note,
          });
        } else if (hdSl != null && lastTxn) {
          lastTxn = pushTxn({
            rowIndex: i, itemCode: lastTxn.itemCode, itemName: lastTxn.itemName,
            unit: unit || lastTxn.unit, qty: hdSl, unitPriceHd: hdDg ?? 0,
            amountHd: amountHd!, invoiceNo, note,
          });
        }
      }
      // else: note-only / scratch row → skip
    }

    // A section subtotal can report collected invoices with no detail rows in the
    // export (e.g. HM1 Nhân công) — emit one aggregate transaction so the imported
    // totals still reproduce the sheet. Clearly flagged in the note.
    for (const sub of subtotalMeta) {
      if (sub.hdTt <= 0) continue;
      const key = `${sub.hm}-${sub.section.code}`;
      const parsedHd = rows
        .filter((r) => r.data._type === "transaction" && `${r.data.hm}-${r.data.sectionCode}` === key)
        .reduce((a, r) => a + Number(r.data.amountHd ?? 0), 0);
      if (parsedHd !== 0) continue;
      const seq = (seqCounters.get(key) ?? 0) + 1;
      seqCounters.set(key, seq);
      rows.push({
        rowIndex: -1,
        data: {
          _type: "transaction",
          hm: sub.hm,
          sectionCode: sub.section.code,
          transactionType: sub.section.txType,
          categoryCode: key,
          categoryName: `${sub.hmLabel} — ${sub.section.label}`,
          itemCode: `${key}-${String(seq).padStart(3, "0")}`,
          itemName: `${sub.section.label} (tổng hợp)`,
          unit: "gói",
          qty: 1,
          qtyHd: 1,
          unitPriceHd: sub.hdTt,
          amountHd: sub.hdTt,
          note: "Tổng hợp từ dòng Cộng của sheet — file không có chi tiết hóa đơn",
        },
      });
    }

    return {
      rows,
      conflicts: [],
      meta: {
        projectCode: PROJECT_CODE,
        projectName: PROJECT_NAME,
        hmBlocks,
        sheetSubtotals,
        grandTotals,
        warnings,
      },
    };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    const sheetSubtotals = (data.meta.sheetSubtotals ?? {}) as Record<string, SheetSubtotal>;
    const grandTotals = (data.meta.grandTotals ?? {}) as Record<string, SheetSubtotal>;
    const hmBlocks = (data.meta.hmBlocks ?? []) as { slug: string; label: string }[];

    if (hmBlocks.length === 0) {
      errors.push({ rowIndex: 0, field: "file", message: "Không tìm thấy khối HM nào (dòng bắt đầu bằng 'HM:')" });
      return { valid: false, errors };
    }

    // Roll up parsed rows per (HM, section) and per HM
    const estSums = new Map<string, number>();
    const txnSums = new Map<string, number>();
    const rowsPerHm = new Map<string, number>();
    for (const row of data.rows) {
      const d = row.data;
      const key = `${d.hm}-${d.sectionCode}`;
      rowsPerHm.set(String(d.hm), (rowsPerHm.get(String(d.hm)) ?? 0) + 1);
      if (d._type === "estimate") {
        estSums.set(key, (estSums.get(key) ?? 0) + Number(d.totalVnd ?? 0));
      } else if (d._type === "transaction") {
        txnSums.set(key, (txnSums.get(key) ?? 0) + Number(d.amountHd ?? 0));
      }
    }

    const withinGate = (parsed: number, sheet: number): boolean =>
      Math.abs(parsed - sheet) <= Math.max(Math.abs(sheet) * GATE_TOLERANCE, GATE_FLOOR_VND);

    for (const hm of hmBlocks) {
      if (!rowsPerHm.get(hm.slug)) {
        errors.push({ rowIndex: 0, field: hm.slug, message: `Khối ${hm.slug} (${hm.label}) không có dòng dữ liệu nào` });
      }
    }

    for (const [key, sub] of Object.entries(sheetSubtotals)) {
      const est = estSums.get(key) ?? 0;
      const txn = txnSums.get(key) ?? 0;
      if (!withinGate(est, sub.dtTt)) {
        errors.push({
          rowIndex: 0, field: key,
          message: `Lệch dự toán mục ${key}: sheet ${sub.dtTt.toLocaleString()} ≠ parse ${Math.round(est).toLocaleString()} (Δ ${Math.round(est - sub.dtTt).toLocaleString()})`,
        });
      }
      if (!withinGate(txn, sub.hdTt)) {
        errors.push({
          rowIndex: 0, field: key,
          message: `Lệch hóa đơn mục ${key}: sheet ${sub.hdTt.toLocaleString()} ≠ parse ${Math.round(txn).toLocaleString()} (Δ ${Math.round(txn - sub.hdTt).toLocaleString()})`,
        });
      }
    }

    for (const [hm, grand] of Object.entries(grandTotals)) {
      let est = 0;
      let txn = 0;
      for (const [key, v] of estSums) if (key.startsWith(`${hm}-`)) est += v;
      for (const [key, v] of txnSums) if (key.startsWith(`${hm}-`)) txn += v;
      if (!withinGate(est, grand.dtTt)) {
        errors.push({
          rowIndex: 0, field: hm,
          message: `Lệch tổng dự toán ${hm}: sheet ${grand.dtTt.toLocaleString()} ≠ parse ${Math.round(est).toLocaleString()}`,
        });
      }
      if (!withinGate(txn, grand.hdTt)) {
        errors.push({
          rowIndex: 0, field: hm,
          message: `Lệch tổng hóa đơn ${hm}: sheet ${grand.hdTt.toLocaleString()} ≠ parse ${Math.round(txn).toLocaleString()}`,
        });
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
    const asOfDate = new Date();

    const projectCode = String(data.meta.projectCode ?? PROJECT_CODE);
    let project = await db.project.findFirst({ where: { code: projectCode, deletedAt: null } });
    if (!project) {
      project = await db.project.create({
        data: { code: projectCode, name: String(data.meta.projectName ?? PROJECT_NAME) },
      });
    }
    imported++;
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
        const categoryId = await getOrCreateCategory(
          String(row.data.categoryCode), String(row.data.categoryName ?? row.data.categoryCode),
        );
        const itemCode = String(row.data.itemCode);
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
        await db.$executeRaw`
          INSERT INTO project_estimates
            ("projectId", "categoryId", "itemCode", "itemName", unit, qty, "unitPrice", "totalVnd", note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${categoryId}, ${itemCode}, ${String(row.data.itemName)},
             ${String(row.data.unit ?? "")}, ${Number(row.data.qty ?? 0)}, ${Number(row.data.unitPrice ?? 0)},
             ${Number(row.data.totalVnd ?? 0)},
             ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    for (const row of data.rows.filter((r) => r.data._type === "transaction")) {
      try {
        const categoryId = await getOrCreateCategory(
          String(row.data.categoryCode), String(row.data.categoryName ?? row.data.categoryCode),
        );
        const note = row.data.note ? `${IMPORT_NOTE}; ${String(row.data.note)}` : IMPORT_NOTE;
        await db.$executeRaw`
          INSERT INTO project_transactions
            ("projectId", date, "transactionType", "categoryId", "itemCode", "itemName",
             "partyName", qty, "qtyHd", unit, "unitPriceTt", "unitPriceHd",
             "amountTt", "amountHd", "invoiceNo", status, note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${asOfDate}, ${String(row.data.transactionType)}, ${categoryId},
             ${String(row.data.itemCode)}, ${String(row.data.itemName)},
             ${null}, ${Number(row.data.qty ?? 0)}, ${row.data.qtyHd != null ? Number(row.data.qtyHd) : null}, ${String(row.data.unit ?? "")},
             ${0}, ${Number(row.data.unitPriceHd ?? 0)},
             ${0}, ${Number(row.data.amountHd ?? 0)},
             ${row.data.invoiceNo ? String(row.data.invoiceNo) : null},
             'approved', ${note}, ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
