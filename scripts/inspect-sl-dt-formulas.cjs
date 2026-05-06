// Phase 1: Extract Excel formulas from SL-DT 2025 months 10, 11, 12
// Read-only — produces a mapping of cell -> formula for the key computed fields.

const XLSX = require("xlsx");
const wb = XLSX.readFile("SOP/SL - DT 2025.xlsx", {
  cellFormula: true,
  cellNF: true,
  cellDates: true,
});

// Find sheets we care about (months 10, 11, 12)
function findSheet(predicate) {
  return wb.SheetNames.filter(predicate);
}

const months = [10, 11, 12];

// ---- helpers --------------------------------------------------------------
function dumpFormulas(sheetName, opts = {}) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return console.log(`  [missing] ${sheetName}`);
  const ref = ws["!ref"];
  if (!ref) return console.log(`  [empty] ${sheetName}`);
  const range = XLSX.utils.decode_range(ref);
  console.log(`\n=== ${sheetName} (${ref}) ===`);

  const maxRow = Math.min(range.e.r, opts.maxRow ?? 60);
  const maxCol = Math.min(range.e.c, opts.maxCol ?? 25);

  // Print first ~12 rows of values to identify header layout
  console.log("--- HEADER PREVIEW (values) ---");
  for (let r = range.s.r; r <= Math.min(range.s.r + 11, maxRow); r++) {
    const row = [];
    for (let c = range.s.c; c <= maxCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? String(cell.v ?? "").slice(0, 14) : "");
    }
    console.log(`r${r.toString().padStart(2, "0")}:`, row.map((x) => x.padEnd(14)).join("|"));
  }

  console.log("--- FORMULAS (cell = formula // value) ---");
  let formulaCount = 0;
  for (let r = range.s.r; r <= maxRow; r++) {
    for (let c = range.s.c; c <= maxCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && cell.f) {
        const val = cell.v == null ? "" : String(cell.v).slice(0, 18);
        console.log(`  ${addr} = ${cell.f}  // ${val}`);
        formulaCount++;
        if (formulaCount > (opts.maxFormulas ?? 80)) {
          console.log("  ... (truncated)");
          return;
        }
      }
    }
  }
  if (formulaCount === 0) console.log("  (no formulas in scanned range)");
}

// ---- 1. Báo cáo sản lượng (per month) ------------------------------------
console.log("\n############ SẢN LƯỢNG ############");
for (const m of months) {
  const matches = findSheet((n) => /B[áa]o c[áa]o s[ảa]n l[ưu][ơo]ng/i.test(n) && n.includes(`Tháng ${m}`));
  for (const sn of matches) dumpFormulas(sn, { maxRow: 50, maxCol: 22, maxFormulas: 60 });
}

// ---- 2. Báo cáo doanh thu -------------------------------------------------
console.log("\n############ DOANH THU ############");
for (const m of months) {
  const matches = findSheet((n) => /B[áa]o c[áa]o doanh thu/i.test(n) && n.includes(`Tháng ${m}`));
  for (const sn of matches) dumpFormulas(sn, { maxRow: 50, maxCol: 22, maxFormulas: 60 });
}

// ---- 3. Chỉ tiêu ----------------------------------------------------------
console.log("\n############ CHỈ TIÊU ############");
for (const m of months) {
  const matches = findSheet((n) => /Ch[ỉi] ti[êe]u/i.test(n) && n.includes(`Tháng ${m.toString().padStart(2, "0")}`));
  for (const sn of matches) dumpFormulas(sn, { maxRow: 50, maxCol: 22, maxFormulas: 60 });
}

// ---- 4. Tiến độ XD --------------------------------------------------------
console.log("\n############ TIẾN ĐỘ XD ############");
for (const m of months) {
  const matches = findSheet((n) => /TI[ẾE]N [ĐD][Ộo] X[ÂA]Y/i.test(n) && n.includes(m.toString().padStart(2, "0")));
  for (const sn of matches.slice(0, 1)) dumpFormulas(sn, { maxRow: 40, maxCol: 22, maxFormulas: 50 });
}

// ---- 5. Tiến độ nộp tiền (single sheet?) ---------------------------------
console.log("\n############ TIẾN ĐỘ NỘP TIỀN ############");
const payMatches = findSheet((n) => /TI[ẾE]N [ĐD][Ộo] N[ỘO]P/i.test(n));
for (const sn of payMatches.slice(0, 2)) dumpFormulas(sn, { maxRow: 40, maxCol: 22, maxFormulas: 50 });

console.log("\n=== ALL SHEET NAMES ===");
wb.SheetNames.forEach((n, i) => console.log(`${i + 1}. ${n}`));
