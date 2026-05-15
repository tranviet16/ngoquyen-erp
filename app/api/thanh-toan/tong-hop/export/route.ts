import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  aggregateMonth,
  type AggregateRow,
  type PaymentCategory,
} from "@/lib/payment/payment-service";

// Must mirror tong-hop-client.tsx ordering exactly
const CATEGORIES: PaymentCategory[] = ["vat_tu", "nhan_cong", "dich_vu", "khac"];
const CATEGORY_LABEL: Record<PaymentCategory, string> = {
  vat_tu: "Vật tư",
  nhan_cong: "Nhân công",
  dich_vu: "Dịch vụ",
  khac: "Khác",
};

interface EntityMeta {
  id: number;
  name: string;
}

// Cell key: `${category}_${entityId}_${'deNghi'|'duyet'}`
type CellKey = string;

interface PivotRow {
  supplierId: number;
  supplierName: string;
  cells: Record<CellKey, number>;
  totals: { deNghi: number; duyet: number };
}

function uniqueEntities(rows: AggregateRow[]): EntityMeta[] {
  const m = new Map<number, string>();
  for (const r of rows) m.set(r.entityId, r.entityName);
  return [...m.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function makeCells(entities: EntityMeta[]): Record<CellKey, number> {
  const result: Record<CellKey, number> = {};
  for (const cat of CATEGORIES) {
    for (const en of entities) {
      result[`${cat}_${en.id}_deNghi`] = 0;
      result[`${cat}_${en.id}_duyet`] = 0;
    }
  }
  return result;
}

function buildPivot(rows: AggregateRow[], entities: EntityMeta[]): PivotRow[] {
  const m = new Map<number, PivotRow>();
  for (const r of rows) {
    let p = m.get(r.supplierId);
    if (!p) {
      p = {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        cells: makeCells(entities),
        totals: { deNghi: 0, duyet: 0 },
      };
      m.set(r.supplierId, p);
    }
    const cat = r.category as PaymentCategory;
    p.cells[`${cat}_${r.entityId}_deNghi`] += r.soDeNghi;
    p.cells[`${cat}_${r.entityId}_duyet`] += r.soDuyet;
    p.totals.deNghi += r.soDeNghi;
    p.totals.duyet += r.soDuyet;
  }
  return [...m.values()].sort((a, b) =>
    a.supplierName.localeCompare(b.supplierName, "vi")
  );
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month =
    req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const rows = await aggregateMonth(month);

  const entities = uniqueEntities(rows);
  const N = entities.length;

  // Guard: no data — return a simple single-cell sheet instead of ragged N=0 layout
  if (N === 0) {
    const ws = XLSX.utils.aoa_to_sheet([[`TỔNG HỢP THANH TOÁN THÁNG ${month}`], ["Không có dữ liệu"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tổng hợp");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tong-hop-thanh-toan-${month}.xlsx"`,
      },
    });
  }

  const pivot = buildPivot(rows, entities);

  // Column layout (dynamic):
  // col 0: STT
  // col 1: Đơn vị TT
  // cols 2 .. 2 + 4*N*2 - 1: 4 categories × N entities × 2 metrics
  // last 2 cols: Tổng Đề nghị, Tổng Duyệt
  const COL_FIXED = 2;
  const COLS_PER_CAT = N * 2; // N entities × 2 metrics
  const COL_TOTALS_START = COL_FIXED + CATEGORIES.length * COLS_PER_CAT;
  const totalCols = COL_TOTALS_START + 2;

  // Grand totals
  const grandCells = makeCells(entities);
  const grandTotals = { deNghi: 0, duyet: 0 };
  for (const p of pivot) {
    for (const cat of CATEGORIES) {
      for (const en of entities) {
        grandCells[`${cat}_${en.id}_deNghi`] += p.cells[`${cat}_${en.id}_deNghi`];
        grandCells[`${cat}_${en.id}_duyet`] += p.cells[`${cat}_${en.id}_duyet`];
      }
    }
    grandTotals.deNghi += p.totals.deNghi;
    grandTotals.duyet += p.totals.duyet;
  }

  // ── Build cell data per pivot row ─────────────────────────────────────────
  function pivotCells(p: PivotRow | { cells: Record<CellKey, number>; totals: { deNghi: number; duyet: number } }): number[] {
    const cells: number[] = [];
    for (const cat of CATEGORIES) {
      for (const en of entities) {
        cells.push(p.cells[`${cat}_${en.id}_deNghi`]);
        cells.push(p.cells[`${cat}_${en.id}_duyet`]);
      }
    }
    cells.push(p.totals.deNghi, p.totals.duyet);
    return cells;
  }

  // ── Title row ─────────────────────────────────────────────────────────────
  const titleRow: (string | number)[] = [`TỔNG HỢP THANH TOÁN THÁNG ${month}`];
  for (let i = 1; i < totalCols; i++) titleRow.push("");

  // ── Header row 1: STT | Đơn vị TT | [cat labels × COLS_PER_CAT] | Tổng×2 ─
  const headerRow1: (string | number)[] = ["STT", "Đơn vị TT"];
  for (const cat of CATEGORIES) {
    headerRow1.push(CATEGORY_LABEL[cat]);
    for (let i = 1; i < COLS_PER_CAT; i++) headerRow1.push("");
  }
  headerRow1.push("Tổng", "");

  // ── Header row 2: entity×metric sub-headers per category + Totals subs ───
  const headerRow2: (string | number)[] = ["", ""];
  for (const _cat of CATEGORIES) {
    for (const en of entities) {
      headerRow2.push(`${en.name} — Đề nghị`);
      headerRow2.push(`${en.name} — Duyệt`);
    }
  }
  headerRow2.push("Đề nghị", "Duyệt");

  // ── Body rows ─────────────────────────────────────────────────────────────
  const bodyRows = pivot.map((p, i) => [i + 1, p.supplierName, ...pivotCells(p)]);

  // ── Footer row ────────────────────────────────────────────────────────────
  const footerRow: (string | number)[] = ["", "Tổng", ...pivotCells({ cells: grandCells, totals: grandTotals })];

  const aoa: (string | number)[][] = [
    titleRow,
    [],
    headerRow1,
    headerRow2,
    ...bodyRows,
    footerRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── Merges ────────────────────────────────────────────────────────────────
  // Row indices (0-based): title=0, blank=1, hdr1=2, hdr2=3, body=4+, footer=4+n
  const ROW_TITLE = 0;
  const ROW_HDR1 = 2;
  const ROW_HDR2 = 3;

  const merges: XLSX.Range[] = [
    // Title spans all columns
    { s: { r: ROW_TITLE, c: 0 }, e: { r: ROW_TITLE, c: totalCols - 1 } },
    // STT spans hdr1+hdr2
    { s: { r: ROW_HDR1, c: 0 }, e: { r: ROW_HDR2, c: 0 } },
    // Đơn vị TT spans hdr1+hdr2
    { s: { r: ROW_HDR1, c: 1 }, e: { r: ROW_HDR2, c: 1 } },
    // Tổng header spans 2 cols (hdr1 only, hdr2 has Đề nghị/Duyệt)
    { s: { r: ROW_HDR1, c: COL_TOTALS_START }, e: { r: ROW_HDR1, c: COL_TOTALS_START + 1 } },
  ];

  // Each category group header merges COLS_PER_CAT (= N*2) columns in hdr1
  for (let i = 0; i < CATEGORIES.length; i++) {
    const startCol = COL_FIXED + i * COLS_PER_CAT;
    if (COLS_PER_CAT > 1) {
      merges.push({
        s: { r: ROW_HDR1, c: startCol },
        e: { r: ROW_HDR1, c: startCol + COLS_PER_CAT - 1 },
      });
    }
  }

  ws["!merges"] = merges;

  // ── Column widths ─────────────────────────────────────────────────────────
  const cols: XLSX.ColInfo[] = [
    { wch: 6 },  // STT
    { wch: 30 }, // Đơn vị TT
  ];
  // data columns: 4 categories × N entities × 2 metrics
  for (let i = 0; i < CATEGORIES.length * N * 2; i++) {
    cols.push({ wch: 18 });
  }
  // 2 total columns
  cols.push({ wch: 20 }, { wch: 20 });
  ws["!cols"] = cols;

  // ── VND number format for all numeric cells ───────────────────────────────
  const numFmt = "#,##0";
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let R = ROW_HDR2 + 1; R <= range.e.r; R++) {
    for (let C = COL_FIXED; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[addr] && ws[addr].t === "n") {
        ws[addr].z = numFmt;
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tổng hợp");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tong-hop-thanh-toan-${month}.xlsx"`,
    },
  });
}
