import { describe, expect, it } from "vitest";
import type { AliasKeyRow, AliasView } from "../alias-board";
import { filterAnhXaRows, unmappedRows } from "../anh-xa-filter";
import { buildBookIndex } from "../book-index";
import { missesFactor } from "../register-ui";
import type { ReportInputs } from "../report-inputs";
import { fixture, K } from "./report-fixture";

const LIVE = new Set([K.thep, K.betong, K.nhanCong, K.may]);
const GONE = "dong-dt-khong-con|ca|MTC";

describe("missesFactor", () => {
  it("is true only for a non-Ngoài DT alias on a live DT line with no factor", () => {
    expect(missesFactor({ status: "xac_nhan", dtKey: K.betong, factor: null }, LIVE)).toBe(true);
    expect(missesFactor({ status: "de_xuat", dtKey: K.betong, factor: null }, LIVE)).toBe(true);
    expect(missesFactor({ status: "xac_nhan", dtKey: K.betong, factor: 1 }, LIVE)).toBe(false);
    expect(missesFactor({ status: "ngoai_dt", dtKey: K.betong, factor: null }, LIVE)).toBe(false);
    expect(missesFactor({ status: "xac_nhan", dtKey: GONE, factor: null }, LIVE)).toBe(false);
    expect(missesFactor({ status: "xac_nhan", dtKey: null, factor: null }, LIVE)).toBe(false);
    expect(missesFactor(null, LIVE)).toBe(false);
  });
});

/** Biến thể của công trình mẫu để phủ đủ các nhánh xếp dòng của báo cáo. */
function variants(): [string, ReportInputs][] {
  const withAliases = (edit: (a: ReportInputs["aliases"][number]) => ReportInputs["aliases"][number]) => {
    const inp = fixture();
    inp.aliases = inp.aliases.map(edit);
    return inp;
  };
  return [
    ["the base fixture", fixture()],
    ["a factor-less alias whose DT line no longer exists", withAliases((a) => (a.source === "hd" && a.dtKey === K.betong ? { ...a, dtKey: GONE } : a))],
    ["a factor-less đề xuất on a live DT line", withAliases((a) => (a.source === "tt" && a.dtKey === K.thep ? { ...a, status: "de_xuat", factor: null } : a))],
    ["a Ngoài DT alias that still names a DT line", withAliases((a) => (a.source === "hd" && a.dtKey === K.may ? { ...a, status: "ngoai_dt", factor: null } : a))],
  ];
}

describe("missesFactor agrees with how the report places invoice and receipt lines", () => {
  it.each(variants())("%s", (_name, inp) => {
    const index = buildBookIndex(inp);
    const live = new Set(inp.dtLines.map((l) => l.key));
    let checked = 0;
    for (const alias of inp.aliases) {
      if (alias.source === "dt") continue;
      const p = (alias.source === "hd" ? index.placeInvoice : index.placeReceipt)(alias.itemKey);
      const engine = p.kind === "dt_line" && p.factor === null;
      expect(missesFactor(alias, live), `${alias.source} ${alias.itemKey}`).toBe(engine);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("the base fixture has exactly the bê tông invoice key without a factor", () => {
    const inp = fixture();
    const live = new Set(inp.dtLines.map((l) => l.key));
    expect(inp.aliases.filter((a) => a.source !== "dt" && missesFactor(a, live)).map((a) => `${a.source}:${a.dtKey}`)).toEqual([`hd:${K.betong}`]);
  });
});

describe("Ánh xạ filter (the landing predicate Tổng quan counts with)", () => {
  const view = (over: Partial<AliasView>): AliasView => ({ id: 1, groupCodeId: null, dtKey: null, factor: null, kind: null, status: "xac_nhan", note: null, ...over });
  const row = (itemKey: string, alias: AliasView | null, extra: Partial<AliasKeyRow> = {}): AliasKeyRow => ({
    source: "hd", itemKey, itemName: itemKey, unit: "kg", lineCount: 1, amount: 1, parties: "Đại Ngàn", lineKind: null, alias, ...extra,
  });
  const rows = [
    row("a", null),
    row("b", view({ dtKey: GONE })), // alias trỏ Dòng DT không còn, không Mã nhóm → chưa gán
    row("c", view({ dtKey: K.betong })), // trên dòng DT còn, chưa có hệ số
    row("d", view({ dtKey: K.thep, factor: 1 })),
    row("e", view({ status: "de_xuat", groupCodeId: 101 })),
    row("f", view({ status: "ngoai_dt" })),
  ];
  const keys = (list: AliasKeyRow[]) => list.map((r) => r.itemKey);

  it("counts stale aliases as chưa gán in both the status filter and the tab count", () => {
    expect(keys(filterAnhXaRows(rows, { status: "chua_gan" }, LIVE))).toEqual(["a", "b"]);
    expect(keys(unmappedRows(rows, LIVE))).toEqual(["a", "b"]);
  });

  it("filters Chưa có hệ số with missesFactor, other statuses with the effective status", () => {
    expect(keys(filterAnhXaRows(rows, { status: "thieu_he_so" }, LIVE))).toEqual(["c"]);
    expect(keys(filterAnhXaRows(rows, { status: "de_xuat" }, LIVE))).toEqual(["e"]);
    expect(keys(filterAnhXaRows(rows, { status: "ngoai_dt" }, LIVE))).toEqual(["f"]);
    expect(keys(filterAnhXaRows(rows, { status: "xac_nhan" }, LIVE))).toEqual(["c", "d"]);
    expect(keys(filterAnhXaRows([row("g", view({ dtKey: K.betong }), { source: "dt" })], { status: "thieu_he_so" }, LIVE))).toEqual([]);
  });

  it("applies the search box and the exact key on top of the status", () => {
    expect(keys(filterAnhXaRows(rows, { q: "  ĐẠI ngàn " }, LIVE))).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(keys(filterAnhXaRows(rows, { q: "zzz" }, LIVE))).toEqual([]);
    expect(keys(filterAnhXaRows(rows, { key: "c" }, LIVE))).toEqual(["c"]);
    expect(keys(filterAnhXaRows(rows, { key: "c", status: "chua_gan" }, LIVE))).toEqual([]);
  });
});
