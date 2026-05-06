/**
 * Reconcile compute layer vs Excel cells.
 * For each lot × month sheet, recompute via lib/sl-dt/compute.ts and diff
 * against the Excel computed cells (1 VND tolerance for amounts).
 */
import { readFileSync } from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { computeSanLuong, computeDoanhThu } from "../lib/sl-dt/compute";
import { parseMonthSheetName, classifySheet, normalizeLotCode } from "../lib/import/adapters/sl-dt-sheet-parsers";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

const TOL = 1; // VND tolerance for amounts

function num(v: unknown): number {
  if (v == null) return 0;
  let s = String(v).replace(/[\s,]/g, "").trim();
  if (!s || s === "-") return 0;
  // Excel parens = negative, e.g. "(2,300,000)" → -2300000
  let sign = 1;
  if (/^\(.+\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  s = s.replace(/[ -]+$/, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : sign * n;
}

interface Diff {
  sheet: string; lot: string; field: string; excel: number; computed: number; delta: number;
}

async function reconcileSanLuong(matrix: unknown[][], sheetName: string, year: number, month: number, lotByName: Map<string, number>) {
  const diffs: Diff[] = [];
  let checked = 0;
  for (const r of matrix) {
    if (!r || !Array.isArray(r)) continue;
    const stt = String(r[0] ?? "").trim();
    if (!/^\d+$/.test(stt)) continue;
    const lotName = normalizeLotCode(r[1]);
    if (!/^Lô\s/i.test(lotName)) continue;
    const lotId = lotByName.get(lotName);
    if (!lotId) continue;

    const inp = await prisma.slDtMonthlyInput.findFirst({ where: { lotId, year, month } });
    const lot = await prisma.slDtLot.findUnique({ where: { id: lotId } });
    if (!inp || !lot) continue;

    const computed = computeSanLuong({
      estimateValue: Number(inp.estimateValue ?? lot.estimateValue ?? 0),
      slKeHoachKy: Number(inp.slKeHoachKy ?? 0),
      slThucKyTho: Number(inp.slThucKyTho ?? 0),
      slLuyKeTho: Number(inp.slLuyKeTho ?? 0),
      slTrat: Number(inp.slTrat ?? 0),
    });

    const excelH = num(r[7]);
    const excelI = num(r[8]);

    if (Math.abs(excelH - computed.tongThoTrat) > TOL) {
      diffs.push({ sheet: sheetName, lot: lotName, field: "H (F+G)", excel: excelH, computed: computed.tongThoTrat, delta: excelH - computed.tongThoTrat });
    }
    if (Math.abs(excelI - computed.conPhaiTH) > TOL) {
      diffs.push({ sheet: sheetName, lot: lotName, field: "I (C-F)", excel: excelI, computed: computed.conPhaiTH, delta: excelI - computed.conPhaiTH });
    }
    checked++;
  }
  return { checked, diffs };
}

async function reconcileDoanhThu(matrix: unknown[][], sheetName: string, year: number, month: number, lotByName: Map<string, number>) {
  const diffs: Diff[] = [];
  let checked = 0;
  for (const r of matrix) {
    if (!r || !Array.isArray(r)) continue;
    const stt = String(r[0] ?? "").trim();
    if (!/^\d+$/.test(stt)) continue;
    const lotName = normalizeLotCode(r[2]);
    if (!/^Lô\s/i.test(lotName)) continue;
    const lotId = lotByName.get(lotName);
    if (!lotId) continue;

    const inp = await prisma.slDtMonthlyInput.findFirst({ where: { lotId, year, month } });
    const lot = await prisma.slDtLot.findUnique({ where: { id: lotId } });
    if (!inp || !lot) continue;

    const computed = computeDoanhThu({
      contractValue: Number(inp.contractValue ?? lot.contractValue ?? 0),
      dtKeHoachKy: Number(inp.dtKeHoachKy ?? 0),
      dtThoKy: Number(inp.dtThoKy ?? 0),
      dtThoLuyKe: Number(inp.dtThoLuyKe ?? 0),
      qtTratChua: Number(inp.qtTratChua ?? 0),
      dtTratKy: Number(inp.dtTratKy ?? 0),
      dtTratLuyKe: Number(inp.dtTratLuyKe ?? 0),
    });

    const excelH = num(r[7]);   // H = D-G
    const excelL = num(r[11]);  // L = I-K
    const excelM = num(r[12]);  // M = F+J
    const excelN = num(r[13]);  // N = G+K
    const excelO = num(r[14]);  // O = H+L

    const checks: [string, number, number][] = [
      ["H (D-G)", excelH, computed.cnTho],
      ["L (I-K)", excelL, computed.cnTrat],
      ["M (F+J)", excelM, computed.dtKy],
      ["N (G+K)", excelN, computed.dtLuyKe],
      ["O (H+L)", excelO, computed.cnTong],
    ];
    for (const [field, excel, c] of checks) {
      if (Math.abs(excel - c) > TOL) {
        diffs.push({ sheet: sheetName, lot: lotName, field, excel, computed: c, delta: excel - c });
      }
    }
    checked++;
  }
  return { checked, diffs };
}

async function main() {
  const file = process.argv[2] ?? "SOP/SL - DT 2025.xlsx";
  const buf = readFileSync(file);
  const wb = XLSX.read(buf, { type: "buffer" });

  const lots = await prisma.slDtLot.findMany({ where: { deletedAt: null } });
  const lotByName = new Map<string, number>();
  for (const l of lots) lotByName.set(l.lotName, l.id);
  console.log(`Loaded ${lotByName.size} lots from DB`);

  let totalChecked = 0;
  const allDiffs: Diff[] = [];
  const summary: { sheet: string; checked: number; diffs: number }[] = [];

  for (const name of wb.SheetNames) {
    const cat = classifySheet(name);
    if (cat !== "san_luong" && cat !== "doanh_thu") continue;
    const ym = parseMonthSheetName(name);
    if (!ym) continue;
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });

    const { checked, diffs } = cat === "san_luong"
      ? await reconcileSanLuong(matrix, name, ym.year, ym.month, lotByName)
      : await reconcileDoanhThu(matrix, name, ym.year, ym.month, lotByName);

    totalChecked += checked;
    allDiffs.push(...diffs);
    summary.push({ sheet: name, checked, diffs: diffs.length });
  }

  console.log("\n=== Summary ===");
  for (const s of summary) console.log(`${s.diffs === 0 ? "✓" : "✗"} ${s.sheet}  checked=${s.checked}  diffs=${s.diffs}`);

  console.log(`\nTotal lot×month checks: ${totalChecked}, diffs: ${allDiffs.length}`);
  if (allDiffs.length) {
    console.log("\n=== Diffs for Tháng 11 + Tháng 12 only ===");
    const recent = allDiffs.filter(d => /Tháng (11|12)/.test(d.sheet));
    for (const d of recent) {
      console.log(`  ${d.sheet} / ${d.lot} / ${d.field}: excel=${d.excel.toLocaleString()} computed=${d.computed.toLocaleString()} delta=${d.delta.toLocaleString()}`);
    }
    console.log(`\n(Total all-month diffs: ${allDiffs.length}; T11+T12 only: ${recent.length})`);
    process.exit(1);
  }

  await prisma.$disconnect();
  console.log("\n✓ All checks passed (tolerance 1 VND).");
}
main().catch((e) => { console.error(e); process.exit(1); });
