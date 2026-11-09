import { describe, expect, it } from "vitest";
import { day } from "./fixture-builders";
import { findCrossCutover, matchPayments, matchPickups, type DeliveryCandidate, type NlMoneyRow } from "../post-cutover-matching";
import { planPostCutover } from "../plan-post-cutover";
import { idRef, pairRef, type Ref } from "../mapping-keys";
import type { NameResolution } from "../name-resolution";
import type { ResolvedNlRow } from "../plan-pairs";
import { EMPTY_DB_FACTS } from "../plan-types";
import type { NhapLieuRow } from "../types";

const BT_TC = "1|10";
const LT_DCX = "2|11";
const LT_MN2 = "2|12";
const NH_DCX = "3|11";
const QM_DCX = "4|11";
const QM_TC = "4|10";

/** 11 dòng "Lấy Hàng" sau mốc của Nhập Liệu thật (NL#912–926). */
const REAL_ROWS: [string, string, Date, number][] = [
  ["NL#912", BT_TC, day(2026, 10, 27), 28_980_000],
  ["NL#913", LT_DCX, day(2026, 10, 27), 2_800_000],
  ["NL#914", LT_MN2, day(2026, 10, 27), 1_400_000],
  ["NL#915", NH_DCX, day(2026, 10, 27), 7_290_000],
  ["NL#916", NH_DCX, day(2026, 10, 27), 7_290_000],
  ["NL#917", NH_DCX, day(2026, 10, 28), 20_275_200],
  ["NL#921", NH_DCX, day(2026, 10, 31), 20_275_200],
  ["NL#922", QM_DCX, day(2026, 10, 29), 1_800_000],
  ["NL#923", QM_DCX, day(2026, 10, 29), 1_800_000],
  ["NL#925", QM_DCX, day(2026, 10, 31), 3_600_000],
  ["NL#926", QM_TC, day(2026, 10, 30), 1_800_000],
];

const rows = (list: [string, string, Date, number][]): NlMoneyRow[] =>
  list.map(([sourceKey, pairKey, date, amount]) => ({ sourceKey, pairKey, date, amount }));

const deliveries = (list: [string, string, Date, number | null][], source: "bundle" | "erp" = "bundle"): DeliveryCandidate[] =>
  list.map(([id, pairKey, date, amount]) => ({ id, source, pairKey, date, amount, label: id }));

describe("matchPickups", () => {
  it("11 dòng mẫu ghép đủ với 11 phiếu có giá trong gói", () => {
    const candidates = deliveries(REAL_ROWS.map(([key, pair, date, amount], i) => [`b:${i}:${key}`, pair, date, amount]));
    const result = matchPickups(rows(REAL_ROWS), candidates);
    expect(result.filter((m) => m.delivery)).toHaveLength(11);
    expect(new Set(result.map((m) => m.delivery?.id)).size).toBe(11);
  });

  it("dòng \"Lấy Hàng\" không có phiếu (hoặc lệch tiền quá 1 đồng / quá 3 ngày) → không ghép", () => {
    const result = matchPickups(rows([["NL#1", BT_TC, day(2026, 10, 27), 28_980_000]]), deliveries([
      ["b:1", BT_TC, day(2026, 10, 27), 28_980_002],
      ["b:2", BT_TC, day(2026, 11, 1), 28_980_000],
      ["b:3", QM_TC, day(2026, 10, 27), 28_980_000],
    ]));
    expect(result[0].delivery).toBeNull();
  });

  it("phiếu chưa giá ghép theo số phiếu trong ngày (± 3 ngày, mỗi phiếu một dòng)", () => {
    const result = matchPickups(
      rows([
        ["NL#1", LT_DCX, day(2026, 10, 27), 2_800_000],
        ["NL#2", LT_DCX, day(2026, 10, 27), 2_800_000],
        ["NL#3", LT_DCX, day(2026, 10, 27), 2_800_000],
      ]),
      deliveries([
        ["b:1", LT_DCX, day(2026, 10, 27), null],
        ["b:2", LT_DCX, day(2026, 10, 28), null],
      ]),
    );
    expect(result.map((m) => m.delivery?.id ?? null)).toEqual(["b:1", "b:2", null]);
  });

  it("ưu tiên phiếu đã có trong ERP khi cùng khoảng cách ngày", () => {
    const result = matchPickups(
      rows([["NL#1", BT_TC, day(2026, 10, 27), 28_980_000]]),
      [...deliveries([["b:1", BT_TC, day(2026, 10, 27), 28_980_000]]), ...deliveries([["e:9", BT_TC, day(2026, 10, 27), 28_980_000]], "erp")],
    );
    expect(result[0].delivery?.id).toBe("e:9");
  });
});

describe("matchPayments / findCrossCutover", () => {
  const payment = (id: number, pairKey: string, date: Date, amount: number, fromRound = false) =>
    ({ id, pairKey, date, amount, fromRound, label: `#${id}` });

  it("\"Trả Nợ\" trùng thanh toán ERP (± 3 ngày, ± 1 đồng) → bỏ; không trùng → ghi", () => {
    const result = matchPayments(
      rows([
        ["NL#1", BT_TC, day(2026, 10, 30), 50_000_000],
        ["NL#2", BT_TC, day(2026, 10, 30), 20_000_000],
      ]),
      [payment(7, BT_TC, day(2026, 11, 2), 50_000_000), payment(8, BT_TC, day(2026, 10, 30), 19_000_000)],
    );
    expect(result.map((m) => m.payment?.id ?? null)).toEqual([7, null]);
  });

  it("thanh toán từ đợt đã đóng sau mốc trùng \"Trả Nợ\" ≤ mốc trong 30 ngày → khớp chéo", () => {
    const hits = findCrossCutover(
      rows([
        ["NL#5", BT_TC, day(2026, 10, 20), 50_000_000],
        ["NL#6", BT_TC, day(2026, 9, 1), 50_000_000],
      ]),
      [payment(9, BT_TC, day(2026, 11, 5), 50_000_000, true), payment(10, BT_TC, day(2026, 11, 5), 50_000_000, false)],
    );
    expect(hits.map((h) => [h.row.sourceKey, h.payment.id])).toEqual([["NL#5", 9]]);
  });
});

describe("planPostCutover — xác nhận từng đợt vat_tu còn mở và khớp chéo mốc", () => {
  const names = {
    label: (_kind: string, ref: Ref) => (ref.kind === "id" ? `#${ref.id}` : ref.name),
  } as unknown as NameResolution;
  const pair = pairRef(idRef(1), idRef(10));

  function nlRow(sourceKey: string, date: Date, rawType: "Lấy Hàng" | "Trả Nợ", total: number): ResolvedNlRow {
    const row = {
      sourceKey,
      date,
      rawType,
      afterCutover: date.getTime() > day(2026, 10, 26).getTime(),
      tt: { total, amount: total, vat: 0, vatRate: 0 },
      hd: null,
      supplierName: "Bê tông HP",
      projectName: "Trại Chuối",
    } as unknown as NhapLieuRow;
    return { row, pair, itemRef: null };
  }

  const facts = {
    ...EMPTY_DB_FACTS,
    erpPayments: [{ id: 77, supplierId: 1, projectId: 10, date: day(2026, 11, 5), amountTt: 50_000_000, paymentRoundItemId: 5, content: "Chi đợt 2026-11-1" }],
    openRoundItems: [
      { id: 3, roundId: 9, roundLabel: "2026-11-2", status: "submitted", supplierId: 1, projectId: 10, soDeNghi: 12_000_000, soDuyet: null, amount: 12_000_000 },
    ],
  };
  const rowsIn = [nlRow("NL#50", day(2026, 10, 20), "Trả Nợ", 50_000_000)];
  const openAck = "open-round:9:12000000";

  it("đợt còn mở không trùng \"Trả Nợ\" → không chặn, chỉ cần xác nhận từng đợt; khớp chéo đợt đã đóng chưa quyết → chặn", () => {
    const plan = planPostCutover(rowsIn, [], facts, names, {});
    expect(plan.roundBlocking).toEqual([]);
    expect(plan.requiredAcks).toEqual([openAck]);
    expect(plan.openRounds).toEqual([
      expect.objectContaining({ roundId: 9, round: "2026-11-2", status: "submitted", total: 12_000_000, matches: [], decisionKey: null, ackCode: openAck }),
    ]);
    expect(plan.openRounds[0].items).toEqual([{ itemId: 3, supplierName: "#1", projectName: "#10", soDeNghi: 12_000_000, soDuyet: null }]);
    expect(plan.crossCutover).toHaveLength(1);
    expect(plan.xmatchBlocking).toHaveLength(1);
  });

  it("đợt còn mở trùng số tiền \"Trả Nợ\" (± 1 đồng, mọi ngày) → chặn tới khi quyết định; drop-nl bỏ dòng, keep giữ", () => {
    const tra = [nlRow("NL#51", day(2026, 3, 2), "Trả Nợ", 12_000_000.5), nlRow("NL#52", day(2026, 10, 30), "Trả Nợ", 12_000_000)];
    const blocked = planPostCutover(tra, [], facts, names, {});
    expect(blocked.roundBlocking).toHaveLength(1);
    expect(blocked.roundBlocking[0]).toContain("NL#51");
    expect(blocked.openRounds[0].matches.map((m) => m.sourceKey)).toEqual(["NL#51", "NL#52"]);
    expect(blocked.openRounds[0].decisionKey).toBe("round:9");

    const dropped = planPostCutover(tra, [], facts, names, { "round:9": "drop-nl" });
    expect(dropped.roundBlocking).toEqual([]);
    expect(dropped.requiredAcks).toEqual([openAck]);
    expect([...dropped.droppedSourceKeys].sort()).toEqual(["NL#51", "NL#52"]);
    expect(dropped.writtenPayments).toEqual([]);
    expect(dropped.skipped.get(pair.key)?.paidTt).toBe(24_000_000.5);

    const kept = planPostCutover(tra, [], facts, names, { "round:9": "keep" });
    expect(kept.roundBlocking).toEqual([]);
    expect(kept.requiredAcks).toEqual([openAck]);
    expect(kept.droppedSourceKeys.size).toBe(0);
    expect(kept.writtenPayments.map((r) => r.row.sourceKey)).toEqual(["NL#52"]);
  });

  it("dòng đợt còn mở thiếu công trình hoặc khác cặp không bị coi là trùng", () => {
    const other = {
      ...facts,
      openRoundItems: [
        { ...facts.openRoundItems[0], projectId: null },
        { ...facts.openRoundItems[0], id: 4, projectId: 11 },
      ],
    };
    const plan = planPostCutover([nlRow("NL#53", day(2026, 4, 1), "Trả Nợ", 12_000_000)], [], other, names, {});
    expect(plan.roundBlocking).toEqual([]);
    expect(plan.openRounds[0].total).toBe(24_000_000);
    expect(plan.requiredAcks).toEqual(["open-round:9:24000000"]);
  });

  it("khớp chéo mốc (đợt đã đóng): bỏ dòng Nhập Liệu → không chặn, dòng bị bỏ; giữ cả hai → cần xác nhận", () => {
    const dropped = planPostCutover(rowsIn, [], facts, names, { "xmatch:NL#50:77": "drop" });
    expect(dropped.xmatchBlocking).toEqual([]);
    expect(dropped.droppedSourceKeys.has("NL#50")).toBe(true);
    expect(dropped.skipped.get(pair.key)?.paidTt).toBe(50_000_000);
    const kept = planPostCutover(rowsIn, [], facts, names, { "xmatch:NL#50:77": "keep" });
    expect(kept.xmatchBlocking).toEqual([]);
    expect(kept.requiredAcks).toEqual([openAck, "xmatch:NL#50:77"]);
    expect(kept.droppedSourceKeys.size).toBe(0);
  });

  it("\"Lấy Hàng\" sau mốc không ghép được → lỗi chặn; ghép được → không ghi, tính vào phần bỏ của V3", () => {
    const pickup = [nlRow("NL#60", day(2026, 10, 27), "Lấy Hàng", 3_220_000)];
    const unmatched = planPostCutover(pickup, [], EMPTY_DB_FACTS, names, {});
    expect(unmatched.pickupBlocking).toHaveLength(1);
    const matched = planPostCutover(pickup, deliveries([["b:0", pair.key, day(2026, 10, 27), 3_220_000]]), EMPTY_DB_FACTS, names, {});
    expect(matched.pickupBlocking).toEqual([]);
    expect(matched.pickupMatched).toBe(1);
    expect(matched.skipped.get(pair.key)?.lhTt).toBe(3_220_000);
  });
});
