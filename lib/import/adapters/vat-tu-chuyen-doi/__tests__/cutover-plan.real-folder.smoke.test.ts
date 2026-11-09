/**
 * Chạy lớp lập kế hoạch thuần (không DB) trên thư mục thật `Quản Lý Công Nợ/` (không có trong git;
 * bỏ qua khi thiếu). Danh mục giả lập: Chủ thể / NCC / công trình trùng tên khít với Nhập Liệu và
 * Số Dư, cộng các bí danh đã biết (CSV, tên file theo dõi, thư mục, nhãn gộp). Vật tư: danh mục rỗng
 * (phiếu tạo mới theo tên). In số liệu để đối chiếu go-live.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ImportMapping } from "../../adapter-types";
import { parseCutoverBundle } from "../cutover-bundle-parser";
import { buildCutoverPlan, type CutoverPlan } from "../cutover-plan";
import { isoDay } from "../day-utils";
import { nameKey, projectKey, refKey } from "../mapping-keys";
import { collectSourceNames } from "../name-collect";
import { resolveNames } from "../name-resolution";
import { parseWithMapping } from "../parse-with-mapping";
import { EMPTY_DB_FACTS, type Catalog } from "../plan-types";
import type { BundleFile, CutoverBundleParseResult } from "../types";

const ROOT = join(process.cwd(), "Quản Lý Công Nợ");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const ENTITIES = ["Công Ty Quản Lý", "Lê Văn Huyên", "Lưu Minh Xuân"];
const PROJECTS: [string, string][] = [
  ["Trại Chuối", "Công Ty Quản Lý"],
  ["Quán Toan", "Công Ty Quản Lý"],
  ["326 - Lô 34", "Công Ty Quản Lý"],
  ["Trụ sở 149 Hai Bà Trưng", "Công Ty Quản Lý"],
  ["Phí khác( các dự án)", "Công Ty Quản Lý"],
  ["346 Cát Dài", "Công Ty Quản Lý"],
  ["Tân Lộc CDC", "Công Ty Quản Lý"],
  ["ĐVP-CDC", "Công Ty Quản Lý"],
  ["Tiên Lãng (Việt Úc)", "Lưu Minh Xuân"],
  ["Tiên Lãng (SH)", "Lê Văn Huyên"],
  ["Mầm non Trại chuối", "Lê Văn Huyên"],
  ["Mầm non GĐ2", "Lê Văn Huyên"],
  ["Xây dựng Dải cây xanh", "Lê Văn Huyên"],
];

const SUPPLIER_ALIASES: Record<string, string> = {
  "Công ty TNHH Nam Hương": "Nam Hương",
  "Gạch Nam Hương": "Nam Hương",
  "Cty (Anh Công)": "Khánh Đức",
  "Cty Hiệu Trần (Anh Hiếu)": "Thương Hiệu Trần",
  "Thép Hiệu Trần": "Thương Hiệu Trần",
  "Công ty Đại Ngàn": "Đại Ngàn",
  "Công ty CP bê tông Hải Phòng": "Bê tông Hải Phòng",
  "Công ty Lộc Tài HT": "Lộc Tài",
  "Máy xúc Lộc Tài HT": "Lộc Tài",
  "Cty CPTM Kim khí TT (Ô Hiếu)": "Công ty Kim Khí",
  "Cty Phương Minh (Cô Dinh)": "Phương Minh",
  "Xi măng Phương Minh": "Phương Minh",
  "Cty Quang Minh (Ô Hoà)": "Quang Minh",
  "Quang Minh cát,gạch": "Quang Minh",
  "Cát xây Quang Minh": "Quang Minh",
  "Công ty Anh thư": "Anh Thư",
  "Xi măng Anh Thư": "Anh Thư",
  "Công ty Đất Việt Phát": "Đất Việt Phát",
  "Công ty Thiết bị điện Việt Đức HP": "Thiết bị điện Việt Đức",
  "Thiết bị điện Việt Đức HP": "Thiết bị điện Việt Đức",
  "Cty Quang Minh chống thấm": "Quang Minh (chống thấm)",
  "Công ty Đá Việt Hà": "Đá Việt Hà",
  "Công ty nhôm kính HK": "Cty Nhôm Kính HK",
  "Công ty Phương Vũ": "Cty Phương Vũ camera",
  "Gạch ốp lát Hùng Chi": "Hùng Chi gạch ốp lát",
  "Gạch lát Hùng Chi": "Hùng Chi gạch ốp lát",
  "Công ty Đồng Yên": "Đồng Yên",
  "Công ty Sơn Sobek": "Cty sơn Sobek",
};
const NEW_SUPPLIERS = ["Tùng Lâm", "Vận Chuyển Gia Bảo", "Cty Khang Trang Phát", "Công ty Nhật Nguyệt"];

const CSV_PROJECTS: Record<string, string> = {
  "Ngô quyền Trại chuối": "Trại Chuối",
  "Trại chuối(khánh đức": "Trại Chuối",
  "T/chuối gạch cty đại cương": "Trại Chuối",
  "Ngô quyền Quán toan": "Quán Toan",
  "Tân lộc CDC": "Tân Lộc CDC",
  "ĐVP -CDC": "ĐVP-CDC",
  "ĐVP CDC": "ĐVP-CDC",
  "Lô 34 - Dự án 326": "326 - Lô 34",
  "Lô 34- 326": "326 - Lô 34",
  "MN trại chuối": "Mầm non Trại chuối",
  "MN GĐ2": "Mầm non GĐ2",
  "Dải cây xanh": "Xây dựng Dải cây xanh",
  "Tiên Lãng S/h": "Tiên Lãng (SH)",
  "Tiên Lãng (SH )": "Tiên Lãng (SH)",
  "Tiên Lãng ( Việt Úc )": "Tiên Lãng (Việt Úc)",
  "ĐVP -149 HBT": "Trụ sở 149 Hai Bà Trưng",
  "Ngô quyền 346 Cát Dài": "346 Cát Dài",
};
const FOLDERS: Record<string, string> = {
  "Mầm Non TC1": "Mầm non Trại chuối",
  "Mầm Non TC2": "Mầm non GĐ2",
  "Dải Cây Xanh": "Xây dựng Dải cây xanh",
};
const LABELS: Record<string, string> = {
  "dải cây xanh": "Xây dựng Dải cây xanh",
  "ĐVP - CDC": "ĐVP-CDC",
  "Mầm non": "Mầm non Trại chuối",
  "Tiên Lãng SH": "Tiên Lãng (SH)",
  "Tiên Lãng ( Việt Úc )": "Tiên Lãng (Việt Úc)",
  "TC Quán Toan": "Quán Toan",
  "Ngô Quyền Quán Toan": "Quán Toan",
};

function buildCatalog(base: CutoverBundleParseResult): Catalog {
  const entities = ENTITIES.map((name, i) => ({ id: i + 1, name }));
  const entityId = (name: string) => entities.find((e) => e.name === name)?.id ?? null;
  const supplierNames = new Set<string>();
  for (const r of base.mainFile?.nhapLieu.rows ?? []) supplierNames.add(r.supplierName);
  for (const r of base.mainFile?.openingBalances ?? []) supplierNames.add(r.supplierName);
  return {
    entities,
    suppliers: [...supplierNames].map((name, i) => ({ id: 100 + i, name })),
    projects: PROJECTS.map(([name, entity], i) => ({ id: 500 + i, name, code: `P${i}`, entityId: entityId(entity) })),
    items: [],
  };
}

function buildMapping(base: CutoverBundleParseResult, catalog: Catalog): ImportMapping {
  const supplierId = (name: string) => catalog.suppliers.find((s) => s.name === name)?.id ?? 0;
  const projectId = (name: string) => catalog.projects.find((p) => p.name === name)?.id ?? 0;
  const mapping: ImportMapping = {};
  for (const [alias, name] of Object.entries(SUPPLIER_ALIASES)) mapping[nameKey("supplier", alias)] = supplierId(name);
  for (const name of NEW_SUPPLIERS) mapping[nameKey("supplier", name)] = "new";
  mapping[projectKey("Cống hộp - Tiên lãng", "Lưu Minh Xuân")] = projectId("Tiên Lãng (Việt Úc)");
  mapping[projectKey("Cống hộp - Tiên lãng", "Lê Văn Huyên")] = projectId("Tiên Lãng (SH)");
  for (const [csv, name] of Object.entries(CSV_PROJECTS)) mapping[nameKey("project-csv", csv)] = projectId(name);
  for (const [folder, name] of Object.entries(FOLDERS)) mapping[nameKey("project-folder", folder)] = projectId(name);
  for (const [label, name] of Object.entries(LABELS)) mapping[nameKey("project-label", label)] = projectId(name);
  // Quyết định ngày: ứng viên đầu tiên; ô "3,4,5/4/2026" → 03/04; khối không ngày → 01/07.
  for (const d of base.dateDecisions) mapping[d.key] = isoDay(d.candidates[0]);
  for (const e of base.blockingErrors) {
    const key = `date:${e.ref.file}:${e.ref.sheet}!${e.ref.cell}`;
    if (e.code === "date-invalid") mapping[key] = "2026-04-03";
    if (e.code === "date-missing") mapping[key] = "2026-07-01";
  }
  return mapping;
}

/** Nợ TT dự phóng của cặp tại Y từ chính các dòng kế hoạch (chỉ để đối chiếu trong test). */
function projectedDebt(plan: CutoverPlan, pairKey: string, y: Date): number {
  let debt = 0;
  for (const o of plan.openings) if (o.pair.key === pairKey) debt += o.tt;
  for (const r of plan.ledgerRows) {
    if (r.pair.key !== pairKey || r.date.getTime() > y.getTime()) continue;
    debt += r.type === "thanh_toan" ? -r.totalTt : r.totalTt;
  }
  return debt;
}

describe.skipIf(!existsSync(ROOT))("lập kế hoạch chuyển đổi trên thư mục thật (không DB)", () => {
  let plan: CutoverPlan;
  let v1: { file: string; projected: number; totalDebt: number; diff: number }[];

  beforeAll(() => {
    const files: BundleFile[] = walk(ROOT).map((p) => ({ path: relative(ROOT, p).split(sep).join("/"), buffer: readFileSync(p) }));
    const base = parseCutoverBundle(files);
    const catalog = buildCatalog(base);
    const mapping = buildMapping(base, catalog);
    const names = resolveNames(collectSourceNames(base), base, mapping, catalog);
    const parse = parseWithMapping(files, names, mapping);
    plan = buildCutoverPlan({ parse, mapping, names, facts: EMPTY_DB_FACTS });
    v1 = plan.anchors.map((a) => {
      const projected = a.memberRefs.reduce((s, p) => s + projectedDebt(plan, `${refKey(a.supplierRef)}|${refKey(p)}`, a.y), 0) + a.linesAfter;
      return { file: a.file, projected: Math.round(projected), totalDebt: a.totalDebt, diff: Math.round(projected - a.totalDebt) };
    });

    const pairs = plan.views.pairs;
    const summary = {
      blocking: plan.blockingGroups.map((g) => ({ group: g.group, count: g.messages.length, first: g.messages.slice(0, 3) })),
      requiredAcks: plan.requiredAcks.length,
      ackKinds: plan.requiredAcks.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.split(":")[0]]: (acc[c.split(":")[0]] ?? 0) + 1 }), {}),
      pairs: pairs.length,
      pairsDefault1: pairs.filter((p) => p.defaultDecision === 1).length,
      pairsWithCsv: pairs.filter((p) => p.csv).length,
      pairsSdNoCsv: pairs.filter((p) => p.hasOpeningRow && !p.csv && (p.s.tt !== 0 || p.s.hd !== 0)).length,
      pairsCsvNoSd: pairs.filter((p) => p.csv && !p.hasOpeningRow).length,
      pairsMismatchTt: pairs.filter((p) => p.csv && !p.matchTt).length,
      pairsMismatchHd: pairs.filter((p) => p.csv && !p.matchHd).length,
      cdc: plan.views.cdc.map((c) => ({ supplier: c.supplierName, reason: c.reason, diff: c.diff, targets: c.targets })),
      openings: plan.openings.length,
      ledgerRows: plan.ledgerRows.length,
      lifetimeRows: plan.ledgerRows.filter((r) => r.sourceKey.startsWith("LK")).length,
      deliveriesBefore: plan.deliveries.filter((d) => !d.afterCutover).length,
      deliveriesAfter: plan.deliveries.filter((d) => d.afterCutover).length,
      markers: plan.markers.length,
      pickups: `${plan.v4.matched}/${plan.v4.total}`,
      postPayments: plan.views.payments.length,
      newMaster: {
        suppliers: plan.newMaster.suppliers.length,
        projects: plan.newMaster.projects.length,
        items: plan.newMaster.items.length,
        entities: plan.newMaster.entities.length,
      },
      noMoneyPairs: plan.views.deliveries.filter((d) => d.noMoney).map((d) => `${d.supplierName} × ${d.projectName}`),
      v1,
    };
    console.log(JSON.stringify(summary, null, 2));
  });

  it("không còn lỗi chặn ánh xạ / Chủ thể / ngày / cấu trúc với ánh xạ giả lập", () => {
    const hard = plan.blockingGroups.filter((g) => ["Ánh xạ tên", "Chủ thể công trình", "Ngày", "Cấu trúc file"].includes(g.group));
    expect(hard).toEqual([]);
    expect(plan.dryRunAllowed).toBe(true);
  });

  it("11/11 dòng \"Lấy Hàng\" sau mốc ghép được với phiếu trong gói; không dòng sổ lay_hang nào sau mốc", () => {
    expect(plan.v4.total).toBe(11);
    expect(plan.v4.matched).toBe(11);
    expect(plan.ledgerRows.some((r) => r.date > new Date("2026-10-26T00:00:00Z") && r.type !== "thanh_toan")).toBe(false);
  });

  it("Nam Hương CDC tách đúng Tân Lộc CDC 109.336.700 / 0 và ĐVP-CDC 44.600.000 / 27.734.400", () => {
    const nh = plan.views.cdc.find((c) => c.supplierName === "Nam Hương");
    expect(nh?.reason).toBeNull();
    expect(nh?.targets.map((t) => [t.projectName, t.tt, t.hd]).sort()).toEqual([
      ["Tân Lộc CDC", 109_336_700, 0],
      ["ĐVP-CDC", 44_600_000, 27_734_400],
    ].sort());
  });

  it("neo V1: Bê tông HP × Trại Chuối 509.563.111; Nam Hương nhóm Trại Chuối + Tân Lộc CDC + ĐVP-CDC 294.445.120", () => {
    const bt = v1.find((a) => a.file.endsWith("Trại Chuối/Bê tông Hải Phòng.xlsx"));
    const nh = v1.find((a) => a.file.endsWith("Trại Chuối/Gạch Nam Hương.xlsx"));
    expect(bt?.totalDebt).toBe(509_563_111);
    expect(Math.abs(bt?.diff ?? 99)).toBeLessThanOrEqual(1);
    expect(nh?.totalDebt).toBe(294_445_120);
    expect(Math.abs(nh?.diff ?? 99)).toBeLessThanOrEqual(1);
  });

  it("mọi cặp có dữ liệu tới mốc đều có marker", () => {
    const markerKeys = new Set(plan.markers.map((m) => m.key));
    for (const o of plan.openings) expect(markerKeys.has(o.pair.key)).toBe(true);
    for (const d of plan.deliveries.filter((x) => !x.afterCutover)) expect(markerKeys.has(d.pair.key)).toBe(true);
  });
});
