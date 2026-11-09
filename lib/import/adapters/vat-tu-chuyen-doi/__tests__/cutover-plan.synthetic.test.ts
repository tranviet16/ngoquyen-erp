/**
 * Lớp lập kế hoạch (thuần) trên gói tổng hợp — cùng gói với test tích hợp, để kiểm số không cần DB:
 * ánh xạ / Chủ thể chặn đúng, mặc định từng cặp, tách CDC, thứ tự và số dòng ghi, marker, ghép sau mốc.
 */
import { describe, expect, it } from "vitest";
import type { ImportMapping } from "../../adapter-types";
import { parseCutoverBundle } from "../cutover-bundle-parser";
import { buildCutoverPlan } from "../cutover-plan";
import { cutoverMappingSchema, nameKey } from "../mapping-keys";
import { collectSourceNames } from "../name-collect";
import { resolveNames } from "../name-resolution";
import { parseWithMapping } from "../parse-with-mapping";
import { EMPTY_DB_FACTS, type Catalog } from "../plan-types";
import { SYNTHETIC, syntheticCutoverBundle } from "./cutover-synthetic-bundle";

const files = syntheticCutoverBundle().map((f) => ({ path: f.path, buffer: f.data }));
const base = parseCutoverBundle(files);

function catalog(opts: { tanLocEntity?: number | null } = {}): Catalog {
  return {
    entities: [
      { id: 1, name: SYNTHETIC.entities.quanLy },
      { id: 2, name: SYNTHETIC.entities.huyen },
    ],
    suppliers: [{ id: 10, name: SYNTHETIC.supplier }],
    projects: [
      { id: 20, name: SYNTHETIC.projects.traiChuoi, code: "TC", entityId: 1 },
      { id: 21, name: SYNTHETIC.projects.daiCayXanh, code: "DCX", entityId: 2 },
      { id: 22, name: SYNTHETIC.projects.tanLocCdc, code: "TLCDC", entityId: opts.tanLocEntity === undefined ? 1 : opts.tanLocEntity },
    ],
    items: [
      { id: 30, name: SYNTHETIC.items.m300, unit: "m3" },
      { id: 31, name: SYNTHETIC.items.m250, unit: "m3" },
    ],
  };
}

const MAPPING: ImportMapping = {
  [nameKey("supplier", SYNTHETIC.csvSupplier)]: 10,
  [nameKey("project-csv", SYNTHETIC.csvTraiChuoi)]: 20,
};

function plan(mapping: ImportMapping, cat: Catalog = catalog()) {
  const names = resolveNames(collectSourceNames(base), base, mapping, cat);
  const parse = parseWithMapping(files, names, mapping);
  return buildCutoverPlan({ parse, mapping, names, facts: EMPTY_DB_FACTS });
}

describe("kế hoạch chuyển đổi trên gói tổng hợp", () => {
  it("parser đọc gói không lỗi chặn, không quyết định ngày", () => {
    expect(base.blockingErrors).toEqual([]);
    expect(base.dateDecisions).toEqual([]);
    expect(base.trackingFiles).toHaveLength(3);
  });

  it("chưa ánh xạ NCC / công trình CSV → lỗi chặn, không chạy thử", () => {
    const p = plan({});
    const mapping = p.blockingGroups.find((g) => g.group === "Ánh xạ tên");
    expect(mapping?.messages.some((m) => m.startsWith(nameKey("supplier", SYNTHETIC.csvSupplier)))).toBe(true);
    expect(mapping?.messages.some((m) => m.startsWith(nameKey("project-csv", SYNTHETIC.csvTraiChuoi)))).toBe(true);
    expect(p.dryRunAllowed).toBe(false);
  });

  it("công trình đã có nhưng chưa có Chủ thể → lỗi chặn", () => {
    const p = plan(MAPPING, catalog({ tanLocEntity: null }));
    const entity = p.blockingGroups.find((g) => g.group === "Chủ thể công trình");
    expect(entity?.messages[0]).toContain("Tân Lộc CDC");
    expect(p.dryRunAllowed).toBe(false);
  });

  it("sau ánh xạ: bảng cặp với mặc định đúng, tách CDC, số dòng ghi, marker, ghép sau mốc", () => {
    const p = plan(MAPPING);
    expect(p.blockingGroups).toEqual([]);
    expect(p.requiredAcks).toEqual([]);
    expect(p.dryRunAllowed).toBe(true);

    const decisions = Object.fromEntries(p.views.pairs.map((v) => [v.projectName, v.defaultDecision]));
    expect(decisions).toEqual({ "Trại Chuối": 1, "Tân Lộc CDC": 1, "Dải Cây Xanh": 0 });
    expect(p.views.pairs.find((v) => v.projectName === "Dải Cây Xanh")?.lockReasons).toEqual(["CSV không có cặp này"]);
    expect(p.views.cdc).toHaveLength(1);
    expect(p.views.cdc[0].targets.map((t) => [t.projectName, t.tt, t.hd])).toEqual([["Tân Lộc CDC", 20_000_000, 0]]);

    expect(p.openings.map((o) => [o.pair.key, o.tt, o.hd])).toEqual([["10|21", 5_000_000, 0]]);
    const lifetime = p.ledgerRows.filter((r) => r.sourceKey.startsWith("LK-")).map((r) => [r.pair.key, r.type, r.totalTt, r.totalHd]);
    expect(lifetime).toEqual([
      ["10|20", "lay_hang", 451_700_000, 300_000_000],
      ["10|20", "thanh_toan", 351_700_000, 210_000_000],
      ["10|22", "lay_hang", 50_000_000, 0],
      ["10|22", "thanh_toan", 30_000_000, 0],
    ]);
    expect(p.ledgerRows.filter((r) => r.sourceKey.startsWith("NL#")).map((r) => r.totalTt)).toEqual([
      16_100_000, 10_000_000, 28_980_000, 15_300_000, SYNTHETIC.postCutoverPayment,
    ]);
    expect(p.ledgerRows.every((r) => r.type === "thanh_toan" || r.date <= new Date("2026-10-26T00:00:00Z"))).toBe(true);

    expect(p.deliveries.filter((d) => !d.afterCutover)).toHaveLength(3);
    expect(p.deliveries.filter((d) => d.afterCutover).map((d) => [d.qty, d.totalAmount])).toEqual([[2, 3_220_000]]);
    expect(p.views.deliveries.reduce((s, d) => s + d.duplicatesMerged, 0)).toBe(1);
    expect(p.markers.map((m) => m.key).sort()).toEqual(["10|20", "10|21", "10|22"]);
    expect(p.v4).toMatchObject({ total: 1, matched: 1, expectedAfterCutover: 1 });
    expect(p.views.payments).toEqual([expect.objectContaining({ amount: SYNTHETIC.postCutoverPayment, match: null })]);
    expect(p.v2.map((t) => [t.pair.key, t.tt, t.hd])).toEqual(
      expect.arrayContaining([["10|20", 100_000_000, 90_000_000], ["10|22", 20_000_000, 0], ["10|21", 5_000_000, 0]]),
    );
    expect(p.v3.find((t) => t.pair.key === "10|20")).toMatchObject({ lhTt: 500_000_000, skippedLhTt: SYNTHETIC.postCutoverPickup });
    expect(p.anchors.map((a) => [a.file.split("/").pop(), a.totalDebt, a.linesAfter]).sort()).toEqual([
      ["Bê tông Hải Phòng - DCX.xlsx", SYNTHETIC.anchors.daiCayXanh, 0],
      ["Bê tông Hải Phòng - T3.xlsx", SYNTHETIC.anchors.traiChuoiT3, 0],
      ["Bê tông Hải Phòng.xlsx", SYNTHETIC.anchors.traiChuoi, SYNTHETIC.postCutoverPickup],
    ]);
  });

  it("chọn lũy kế cho cặp thiếu CSV → chặn; chọn ròng cho cặp khớp → số dư thay 2 dòng lũy kế", () => {
    const locked = plan({ ...MAPPING, "pair:10:21": 1 });
    expect(locked.blockingGroups.find((g) => g.group === "Duyệt từng cặp")?.messages[0]).toContain("CSV không có cặp này");
    const net = plan({ ...MAPPING, "pair:10:20": 0 });
    expect(net.openings.map((o) => o.pair.key).sort()).toEqual(["10|20", "10|21"]);
    expect(net.v3.map((t) => t.pair.key)).toEqual(["10|22"]);
  });
});

describe("cutoverMappingSchema", () => {
  it("nhận đúng loại giá trị theo khóa", () => {
    const ok = cutoverMappingSchema.safeParse({
      "supplier:nam hương": 5,
      "project:cdc@công ty quản lý": "split",
      "project-csv:tân lộc cdc": "new:Tân Lộc CDC",
      "project-label:mầm non": null,
      "item:bt m300": "new",
      "pair:5:7": 1,
      "cdc:5@công ty quản lý": 7,
      "date:a.xlsx:Đối chiếu công nợ!B2": "2026-10-11",
      "xmatch:NL#5:9": "drop",
      "ack:v1:a.xlsx:100": 1,
    });
    expect(ok.success).toBe(true);
  });

  it("từ chối NCC / công trình bỏ qua, lựa chọn sai kiểu và khóa lạ", () => {
    for (const bad of [
      { "supplier:nam hương": null },
      { "project:trại chuối@công ty quản lý": null },
      { "pair:5:7": 2 },
      { "date:a.xlsx:S!B2": "11/10/2026" },
      { "xmatch:NL#5:9": "yes" },
      { "foo:bar": 1 },
    ]) {
      expect(cutoverMappingSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
