import { readFileSync } from "fs";
import { SlDtAdapter } from "../lib/import/adapters/sl-dt.adapter";

async function main() {
  const buf = readFileSync("SOP/SL - DT 2025.xlsx");
  const data = await SlDtAdapter.parse(buf);
  console.log("meta:", data.meta);
  const counts: Record<string, number> = {};
  for (const r of data.rows) {
    const k = String(r.data.kind);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  console.log("rows by kind:", counts);
  console.log("total rows:", data.rows.length);

  // Sample lot_meta
  const lotMeta = data.rows.filter((r) => r.data.kind === "lot_meta").slice(0, 5);
  console.log("\nSample lot_meta:");
  for (const r of lotMeta) console.log(JSON.stringify(r.data));

  // Sample monthly_input_sl T11
  const sl11 = data.rows.find((r) =>
    r.data.kind === "monthly_input_sl" && Number(r.data.month) === 11 && String(r.data.lotName) === "Lô 5A"
  );
  console.log("\nLô 5A T11 sản lượng:", sl11?.data);

  // Sample monthly_input_dt T11 Lô 5A
  const dt11 = data.rows.find((r) =>
    r.data.kind === "monthly_input_dt" && Number(r.data.month) === 11 && String(r.data.lotName) === "Lô 5A"
  );
  console.log("Lô 5A T11 doanh thu:", dt11?.data);

  // Sample payment plan
  const pp = data.rows.find((r) => r.data.kind === "payment_plan" && String(r.data.lotName) === "Lô 5A");
  console.log("Lô 5A payment plan:", pp?.data);

  // Sample milestone scores
  const ms = data.rows.filter((r) => r.data.kind === "milestone_score");
  console.log(`\n${ms.length} milestone scores`);

  // Validate
  const v = SlDtAdapter.validate(data);
  console.log("valid:", v.valid, "errors:", v.errors.length);
  if (!v.valid) console.log(v.errors.slice(0, 5));
}
main().catch((e) => { console.error(e); process.exit(1); });
