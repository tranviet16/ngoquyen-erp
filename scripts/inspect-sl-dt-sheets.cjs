const XLSX = require("xlsx");
const wb = XLSX.readFile("SOP/SL - DT 2025.xlsx", { cellDates: true });

console.log("=== ALL SHEETS ===");
wb.SheetNames.forEach((n, i) => console.log(`${i + 1}. ${n}`));

const interesting = [
  "Chỉ tiêu SL DT Tháng 07 năm 2025",
  "Báo cáo sản lượng Tháng 07 năm",
  "Báo cáo doanh thu Tháng 07 năm",
  "TIẾN ĐỘ NỘP TIỀN",
];

for (const name of interesting) {
  const match = wb.SheetNames.find((n) => n.trim() === name.trim());
  if (!match) {
    console.log(`\n--- "${name}" NOT FOUND, looking for similar...`);
    const similar = wb.SheetNames.filter((n) =>
      n.toLowerCase().includes(name.split(" ")[0].toLowerCase()),
    );
    console.log("similar:", similar.slice(0, 5));
    continue;
  }
  console.log(`\n=== SHEET: ${match} ===`);
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[match], {
    header: 1,
    defval: null,
    raw: false,
  });
  const max = Math.min(matrix.length, 18);
  for (let i = 0; i < max; i++) {
    const row = (matrix[i] || []).slice(0, 14).map((c) =>
      c == null ? "" : String(c).slice(0, 18),
    );
    console.log(`r${i.toString().padStart(2, "0")}:`, row.join(" | "));
  }
  console.log(`... total rows: ${matrix.length}`);
}

// Tiến độ XD — find any sheet with that name
console.log("\n=== Tiến độ XD candidates ===");
const xdSheets = wb.SheetNames.filter((n) =>
  n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes("tien do"),
);
console.log(xdSheets);
for (const n of xdSheets.slice(0, 2)) {
  console.log(`\n--- ${n} ---`);
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[n], {
    header: 1,
    defval: null,
    raw: false,
  });
  for (let i = 0; i < Math.min(matrix.length, 12); i++) {
    const row = (matrix[i] || []).slice(0, 14).map((c) =>
      c == null ? "" : String(c).slice(0, 16),
    );
    console.log(`r${i.toString().padStart(2, "0")}:`, row.join(" | "));
  }
}
