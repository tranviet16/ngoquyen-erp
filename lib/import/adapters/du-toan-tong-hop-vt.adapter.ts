/**
 * Adapter: Dự toán chính thức — tab "Tổng hợp VT" (vd "1. Du toan xay dung MN Trai Chuoi.xls")
 * Target: project_estimates của dự án MNTC-GD1 — CẬP NHẬT TẠI CHỖ theo KL × Giá gốc.
 *
 * Khác các adapter khác: không chèn dữ liệu mới hàng loạt mà đối chiếu từng vật tư
 * (tên + ĐVT chuẩn hóa) với dự toán hiện có để giữ nguyên liên kết hóa đơn
 * (categoryId + itemCode) và các ghi đè "Còn phải lấy HĐ":
 *   - Khớp → update qty/unitPrice/totalVnd (giá trị = Giá gốc, KL cộng gộp các khối).
 *   - Chỉ có trong file → insert mới (tag importRunId).
 *   - Chỉ có trong hệ thống → giữ nguyên, liệt kê trong summary.errors (mã KEEP).
 * Chạy lại với cùng file là idempotent (lần 2 mọi dòng đều khớp) → supportsRollback: false.
 *
 * Ánh xạ khối hạng mục theo quy ước bảng cân đối vật tư:
 *   VL: Kết cấu/Kiến trúc/Bể ngầm/HTKT/Phá dỡ → HM1-VL; Cấp điện → HM2-VL; Nước → HM3-VL.
 *   NC/MÁY: mọi khối → HM1-NC / HM1-MAY (sheet cân đối ghi "NC+máy cộng cả vào bảng chung").
 *
 * Gate: tổng parse từng (khối, mục) so với dòng "TỔNG ..." của chính sheet, lệch >2% chặn
 * import (2% vì các dòng "% vật liệu khác" không có KL/Giá gốc bị loại theo yêu cầu nhập).
 */

import * as XLSX from "xlsx";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";

const PROJECT_CODE = "MNTC-GD1";
const SHEET_HINT = "tong hop vt";
const GATE_TOLERANCE = 0.02;

const BLOCK_TO_HM: Record<string, string> = {
  "KẾT CẤU KHỐI NHÀ XÂY MỚI": "HM1",
  "KIẾN TRÚC KHỐI XÂY MỚI": "HM1",
  "XÂY DỰNG BỂ NƯỚC NGẦM, BỂ PHỐT, BỂ TÁCH MỠ": "HM1",
  "HẠ TẦNG KỸ THUẬT NGOÀI NHÀ": "HM1",
  "PHÁ DỠ CÔNG TRÌNH HIỆN TRẠNG": "HM1",
  "CẤP ĐIỆN, ĐIỆN NHẸ KHỐI NHÀ XÂY MỚI": "HM2",
  "CẤP THOÁT NƯỚC KHỐI XÂY MỚI": "HM3",
};
const SECTION_CODE: Record<string, string> = {
  "VẬT LIỆU": "VL",
  "NHÂN CÔNG": "NC",
  "MÁY THI CÔNG": "MAY",
};

/** Tên khác nhau giữa hệ thống và file nhưng cùng một vật tư (raw → raw). */
const NAME_ALIASES: Record<string, string> = {
  "Gạch đặc không nung": "Gạch không nung 6,0 x 10,5 x 22cm",
  "Khí ga": "Khí gas",
  "Chống thấm cổ ống băng thanh Trương nở": "Chống thấm cổ ống bằng thanh trương nở hyperstop",
};

export { normVtName } from "@/lib/text/norm-vt-name";
import { normVtName } from "@/lib/text/norm-vt-name";

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
};

interface BlockSectionSum {
  parsed: number;
  /** Thành tiền của các dòng không có KL/Giá gốc (vd "% vật liệu khác") — không import
   * nhưng vẫn tính vào phép đối chiếu với dòng TỔNG của sheet. */
  skippedAmount: number;
  sheetTotal: number | null;
}

export const DuToanTongHopVtAdapter: ImportAdapter = {
  name: "du-toan-tong-hop-vt",
  label: "Dự toán — Tổng hợp VT (KL × Giá gốc, cập nhật tại chỗ)",
  supportsRollback: false,

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames.find((n) => normVtName(n).includes(SHEET_HINT));
    if (!sheetName) {
      return {
        rows: [],
        conflicts: [],
        meta: { error: `Không tìm thấy sheet "Tổng hợp VT" (các sheet: ${wb.SheetNames.slice(0, 10).join(", ")}…)` },
      };
    }
    const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: false,
    });

    let block = "";
    let section = "";
    const unknownBlocks: string[] = [];
    const blockSections = new Map<string, BlockSectionSum>(); // "block|section"
    // key: `${groupKey}|${normName}|${normUnit}` → aggregated item
    const items = new Map<
      string,
      { groupKey: string; name: string; unit: string; qty: number; totalVnd: number }
    >();
    let skippedNoNumbers = 0;

    for (const r of m) {
      const c0 = String(r?.[0] ?? "").trim();
      const c2 = String(r?.[2] ?? "").trim();
      if (
        c0 && !r?.[1] && !r?.[3] && num(c0) === null &&
        !/^(STT|I|II|III|IV|V)$/.test(c0) && !c0.startsWith("BẢNG") &&
        !c0.startsWith("CÔNG TRÌNH") && c0 === c0.toUpperCase() && c0.length > 5
      ) {
        block = c0;
        section = "";
        if (!(block in BLOCK_TO_HM)) unknownBlocks.push(block);
        continue;
      }
      if (/^(I|II|III|IV|V)$/.test(c0) && c2) {
        section = SECTION_CODE[c2.toUpperCase().trim()] ?? "";
        continue;
      }
      if (!block || !(block in BLOCK_TO_HM)) continue;
      // dòng "TỔNG ..." của sheet — mốc đối chiếu
      if (/^TỔNG/i.test(c2)) {
        const tt = num(r?.[6]);
        if (section && tt != null) {
          const key = `${block}|${section}`;
          const cur = blockSections.get(key) ?? { parsed: 0, skippedAmount: 0, sheetTotal: null };
          cur.sheetTotal = tt;
          blockSections.set(key, cur);
        }
        continue;
      }
      if (!section || !c2) continue;
      const bsKey = `${block}|${section}`;
      const bs = blockSections.get(bsKey) ?? { parsed: 0, skippedAmount: 0, sheetTotal: null };
      blockSections.set(bsKey, bs);
      const kl = num(r?.[4]);
      const giaGoc = num(r?.[5]);
      if (kl == null || giaGoc == null) {
        const amount = num(r?.[6]) ?? 0;
        if (c2 && amount !== 0) {
          skippedNoNumbers++;
          bs.skippedAmount += amount;
        }
        continue;
      }
      const tt = num(r?.[6]) ?? kl * giaGoc;
      bs.parsed += tt;

      const hm = BLOCK_TO_HM[block];
      const groupKey = section === "VL" ? `${hm}-VL` : `HM1-${section}`;
      const unit = String(r?.[3] ?? "").trim();
      const itemKey = `${groupKey}|${normVtName(c2)}|${normVtName(unit)}`;
      const existing = items.get(itemKey);
      if (existing) {
        existing.qty += kl;
        existing.totalVnd += tt;
      } else {
        items.set(itemKey, { groupKey, name: c2, unit, qty: kl, totalVnd: tt });
      }
    }

    const rows: ParsedRow[] = [...items.values()].map((it, i) => ({
      rowIndex: i,
      data: { _type: "estimate-official", ...it },
    }));

    return {
      rows,
      conflicts: [],
      meta: {
        projectCode: PROJECT_CODE,
        sheetName,
        unknownBlocks,
        skippedNoNumbers,
        blockSections: Object.fromEntries(blockSections),
      },
    };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    if (data.meta.error) {
      errors.push({ rowIndex: 0, field: "sheet", message: String(data.meta.error) });
      return { valid: false, errors };
    }
    const unknownBlocks = (data.meta.unknownBlocks ?? []) as string[];
    for (const b of unknownBlocks) {
      errors.push({ rowIndex: 0, field: "block", message: `Khối hạng mục chưa có ánh xạ: "${b}"` });
    }
    if (data.rows.length === 0) {
      errors.push({ rowIndex: 0, field: "rows", message: "Không parse được vật tư nào" });
    }
    const blockSections = (data.meta.blockSections ?? {}) as Record<string, BlockSectionSum>;
    for (const [key, bs] of Object.entries(blockSections)) {
      if (bs.sheetTotal == null || bs.sheetTotal === 0) continue;
      const accounted = bs.parsed + bs.skippedAmount;
      const diff = Math.abs(accounted - bs.sheetTotal);
      if (diff > bs.sheetTotal * GATE_TOLERANCE) {
        errors.push({
          rowIndex: 0,
          field: key,
          message: `Lệch tổng ${key}: sheet ${bs.sheetTotal.toLocaleString()} ≠ parse ${Math.round(bs.parsed).toLocaleString()} + bỏ qua ${Math.round(bs.skippedAmount).toLocaleString()} (>${GATE_TOLERANCE * 100}%)`,
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

    const project = await db.project.findFirst({
      where: { code: String(data.meta.projectCode ?? PROJECT_CODE), deletedAt: null },
    });
    if (!project) {
      return {
        rowsTotal: data.rows.length,
        rowsImported: 0,
        rowsSkipped: data.rows.length,
        errors: [{ rowIndex: 0, message: `Không tìm thấy dự án ${PROJECT_CODE} — import bảng cân đối vật tư trước` }],
      };
    }
    const categories = await db.projectCategory.findMany({
      where: { projectId: project.id, deletedAt: null },
    });
    const catByCode = new Map(categories.map((c) => [c.code, c]));
    const catCodeById = new Map(categories.map((c) => [c.id, c.code]));
    const estimates = await db.projectEstimate.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { itemCode: "asc" },
    });

    // index official theo groupKey → (nameKey → itemKeys) để hỗ trợ fallback tên-duy-nhất
    type Official = { groupKey: string; name: string; unit: string; qty: number; totalVnd: number };
    const official = new Map<string, Official>();
    for (const row of data.rows) {
      const d = row.data as unknown as Official & { _type: string };
      official.set(`${d.groupKey}|${normVtName(d.name)}|${normVtName(d.unit)}`, d);
    }
    const findOfficial = (groupKey: string, rawName: string, unit: string): [string, Official] | null => {
      const aliased = NAME_ALIASES[rawName] ?? rawName;
      const nameKey = normVtName(aliased);
      const fullKey = `${groupKey}|${nameKey}|${normVtName(unit)}`;
      if (official.has(fullKey)) return [fullKey, official.get(fullKey)!];
      const sameNameOwn = [...official.entries()].filter(([k]) => k.startsWith(`${groupKey}|${nameKey}|`));
      if (sameNameOwn.length === 1) return sameNameOwn[0];
      if (sameNameOwn.length > 1) return null;
      const global = [...official.entries()].filter(([k]) => k.endsWith(`|${nameKey}|${normVtName(unit)}`));
      return global.length === 1 ? global[0] : null;
    };

    const used = new Set<string>();
    for (const est of estimates) {
      const groupKey = catCodeById.get(est.categoryId) ?? "";
      const found = findOfficial(groupKey, est.itemName, est.unit);
      if (!found || used.has(found[0])) {
        skipped++;
        errors.push({ rowIndex: -1, message: `KEEP ${est.itemCode} ${est.itemName} — giữ nguyên (không có trong file hoặc trùng khớp)` });
        continue;
      }
      const [key, item] = found;
      used.add(key);
      const price = item.qty > 0 ? item.totalVnd / item.qty : 0;
      try {
        await db.projectEstimate.update({
          where: { id: est.id },
          data: {
            qty: item.qty.toFixed(4),
            unitPrice: price.toFixed(2),
            totalVnd: item.totalVnd.toFixed(2),
            note: "Dự toán theo Tổng hợp VT (KL × Giá gốc)",
          },
        });
        imported++;
      } catch (err) {
        errors.push({ rowIndex: -1, message: `${est.itemCode}: ${String(err)}` });
      }
    }

    const seqByCat = new Map<string, number>();
    for (const est of estimates) {
      const mCode = est.itemCode.match(/^(HM\d+-[A-Z]+)-(\d+)$/);
      if (mCode) seqByCat.set(mCode[1], Math.max(seqByCat.get(mCode[1]) ?? 0, Number(mCode[2])));
    }
    for (const [key, item] of official) {
      if (used.has(key)) continue;
      const cat = catByCode.get(item.groupKey);
      if (!cat) {
        errors.push({ rowIndex: -1, message: `Thiếu danh mục ${item.groupKey} cho "${item.name}"` });
        continue;
      }
      const seq = (seqByCat.get(item.groupKey) ?? 0) + 1;
      seqByCat.set(item.groupKey, seq);
      const price = item.qty > 0 ? item.totalVnd / item.qty : 0;
      try {
        await db.projectEstimate.create({
          data: {
            projectId: project.id,
            categoryId: cat.id,
            itemCode: `${item.groupKey}-${String(seq).padStart(3, "0")}`,
            itemName: item.name,
            unit: item.unit,
            qty: item.qty.toFixed(4),
            unitPrice: price.toFixed(2),
            totalVnd: item.totalVnd.toFixed(2),
            note: "Dự toán theo Tổng hợp VT (KL × Giá gốc)",
            importRunId: importRunId ?? null,
          },
        });
        imported++;
      } catch (err) {
        errors.push({ rowIndex: -1, message: `Thêm "${item.name}": ${String(err)}` });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
