// Phase 1 round 2: focus on missing report types (sản lượng, tiến độ XD, tiến độ nộp tiền)
const XLSX = require("xlsx");
const wb = XLSX.readFile("SOP/SL - DT 2025.xlsx", { cellFormula: true, cellNF: true, cellDates: true });

console.log("=== ALL SHEETS ===");
wb.SheetNames.forEach((n, i) => console.log(`${i + 1}. [${n}]`));

function dumpFormulas(sheetName, opts = {}) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return console.log(`  [missing] ${sheetName}`);
  const ref = ws["!ref"];
  if (!ref) return console.log(`  [empty] ${sheetName}`);
  const range = XLSX.utils.decode_range(ref);
  console.log(`\n=== ${sheetName} (${ref}) ===`);
  const maxRow = Math.min(range.e.r, opts.maxRow ?? 40);
  const maxCol = Math.min(range.e.c, opts.maxCol ?? 22);

  console.log("--- HEADER PREVIEW ---");
  for (let r = range.s.r; r <= Math.min(range.s.r + 11, maxRow); r++) {
    const row = [];
    for (let c = range.s.c; c <= maxCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push((cell ? String(cell.v ?? "").replace(/\n/g, " ") : "").slice(0, 14));
    }
    console.log(`r${r.toString().padStart(2, "0")}:`, row.map((x) => x.padEnd(14)).join("|"));
  }

  console.log("--- UNIQUE FORMULA PATTERNS (first 30 rows) ---");
  const patternsSeen = new Set();
  for (let r = range.s.r; r <= maxRow; r++) {
    for (let c = range.s.c; c <= maxCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && cell.f) {
        // Replace row numbers with R to dedupe
        const pattern = cell.f.replace(/\d+/g, "R").slice(0, 200);
        const colLetter = addr.replace(/\d+/g, "");
        const key = `${colLetter}:${pattern}`;
        if (!patternsSeen.has(key)) {
          patternsSeen.add(key);
          const val = cell.v == null ? "" : String(cell.v).slice(0, 20);
          console.log(`  ${addr} = ${cell.f.slice(0, 200)}  // ${val}`);
        }
      }
    }
  }
}

// Sản lượng
console.log("\n############ SẢN LƯỢNG ############");
const slSheets = wb.SheetNames.filter((n) => /B[áa]o c[áa]o s[ảa]n l[ưu]/i.test(n));
console.log("MATCHED:", slSheets);
for (const sn of slSheets) {
  if (/Tháng (10|11|12)/i.test(sn)) dumpFormulas(sn);
}

// Tiến độ XD
console.log("\n############ TIẾN ĐỘ XD ############");
const xdSheets = wb.SheetNames.filter((n) => /TI[ẾE]N [ĐD][Ộo] X[ÂA]Y/i.test(n));
console.log("MATCHED:", xdSheets);
for (const sn of xdSheets.slice(0, 3)) dumpFormulas(sn);

// Tiến độ nộp tiền
console.log("\n############ TIẾN ĐỘ NỘP TIỀN ############");
const npSheets = wb.SheetNames.filter((n) => /TI[ẾE]N [ĐD][Ộo] N[ỘO]P/i.test(n));
console.log("MATCHED:", npSheets);
for (const sn of npSheets) dumpFormulas(sn, { maxRow: 30, maxCol: 26 });
