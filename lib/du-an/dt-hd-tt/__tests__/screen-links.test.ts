import { describe, expect, it } from "vitest";
import { buildQueryString, parseTableQuery } from "@/lib/table/query-params";
import type { ResourceSpec } from "@/lib/table/types";
import { canonicalJson, parseGridQuery, writeGridQuery, type GridFilters } from "../grid-url-codec";
import { kindOfCategoryCode } from "../keys";
import {
  anhXaQuery, ANH_XA_QUERY_MAX, CHI_THUC_TE_GRID_SPEC, chiThucTeQuery, DAU_MOI_COUNTERPARTY_GRID_SPEC, DAU_MOI_PAGE_SPEC,
  DAU_MOI_SUPPLIER_GRID_SPEC, dauMoiQuery, DT_HD_OPEN_MAX, DT_HD_URL, dtHdQuery, duToanQuery, HOA_DON_GRID_SPEC, hoaDonQuery,
  kindlessEstimateIds, parseAnhXaQuery, parseDtHdQuery, parseDuToanQuery, patchAnhXaQuery, patchDtHdQuery, READY_TARGETS, screenHref,
  THUC_TE_NHAP_GRID_SPEC, thucTeNhapQuery, type AnhXaParams, type DtHdParams,
} from "../screen-links";

/** "Thép" viết bằng dấu tổ hợp (NFD), khác chuỗi dựng sẵn (NFC). */
const COMBINING = "Thép tròn – Bê tông".normalize("NFD");
const SPECIAL = "A&B #1 + 50% =?";

describe("screenHref", () => {
  it("carries the query and hash on ready targets", () => {
    expect(screenHref(4, "dau-moi", { query: dauMoiQuery({ counterpartyId: 0 }), hash: "ncc" })).toBe(
      "/du-an/4/dt-hd-tt/dau-moi?filter.counterpartyId=0#ncc",
    );
    expect(screenHref(4, "du-toan", { query: duToanQuery({ loai: "thieu" }) })).toBe("/du-an/4/du-toan?loai=thieu");
    expect(screenHref(4, "anh-xa")).toBe("/du-an/4/dt-hd-tt/anh-xa");
  });

  it("returns the bare page path for a target that is not ready yet", () => {
    expect(READY_TARGETS).not.toContain("cai-dat");
    expect(screenHref(4, "cai-dat", { query: "a=1" })).toBe("/du-an/4/cai-dat");
    if (!READY_TARGETS.includes("dt-tt")) expect(screenHref(4, "dt-tt", { hash: "phan-iii" })).toBe("/du-an/4/dt-hd-tt/dt-tt");
  });

  it("DT-HĐ is ready: its links carry their state", () => {
    expect(READY_TARGETS).toContain("dt-hd");
    expect(screenHref(4, "dt-hd", { query: dtHdQuery({ dauMoi: 12 }) })).toBe("/du-an/4/dt-hd-tt/dt-hd?dauMoi=12");
    expect(screenHref(4, "dt-hd", { query: dtHdQuery({ dauMoi: "none" }) })).toBe("/du-an/4/dt-hd-tt/dt-hd?dauMoi=none");
  });
});

describe("DT-HĐ parameters", () => {
  const cases: DtHdParams[] = [
    {},
    { mo: [12] },
    { mo: [12, "none", 7] },
    { mo: [] },
    { dauMoi: 3, loc: "vuot" },
    { dauMoi: "none", loc: "thieu-he-so", hd: true },
    { mo: [5], loc: "con-thieu", hd: true },
    { loc: "chua-co-hd" },
  ];

  it.each(cases)("build then parse returns %o", (params) => {
    expect(parseDtHdQuery(dtHdQuery(params))).toEqual(params);
    expect(DT_HD_URL.parse(`?${DT_HD_URL.write(params, "")}`)).toEqual(params);
  });

  it("builds the contract's parameter names with URLSearchParams", () => {
    expect(dtHdQuery({ mo: [12, "none"], dauMoi: 12, loc: "vuot", hd: true })).toBe("mo=12%2Cnone&dauMoi=12&loc=vuot&hd=1");
    expect(dtHdQuery({ mo: [] })).toBe("mo=");
    expect(dtHdQuery({})).toBe("");
  });

  it("drops unknown values, keeps the valid ids of mo, and treats mo= as everything closed", () => {
    expect(parseDtHdQuery("mo=abc&dauMoi=0&loc=du&hd=true")).toEqual({});
    expect(parseDtHdQuery("dauMoi=-1&loc=Vượt&hd=0")).toEqual({});
    expect(parseDtHdQuery("mo=abc,12,,none,12,0")).toEqual({ mo: [12, "none"] });
    expect(parseDtHdQuery("mo=")).toEqual({ mo: [] });
    expect(parseDtHdQuery("mo=1234567890")).toEqual({});
    expect(parseDtHdQuery("dauMoi=none&mo=%20none%20")).toEqual({ dauMoi: "none", mo: ["none"] });
  });

  it("caps mo at 30 open blocks, keeping the last ones", () => {
    const ids = Array.from({ length: DT_HD_OPEN_MAX + 5 }, (_, i) => i + 1);
    expect(parseDtHdQuery(`mo=${ids.join(",")}`).mo).toEqual(ids.slice(-DT_HD_OPEN_MAX));
    expect(parseDtHdQuery(dtHdQuery({ mo: ids })).mo).toEqual(ids.slice(-DT_HD_OPEN_MAX));
  });

  it("patches only its own parameters", () => {
    expect(patchDtHdQuery("?foo=1&loc=vuot&mo=3", { mo: [4], hd: true })).toBe("foo=1&mo=4&hd=1");
    expect(DT_HD_URL.write({}, "?x=y&dauMoi=4")).toBe("x=y");
  });
});

describe("book grid specs round-trip through the lib/table codec", () => {
  const cases: [string, ResourceSpec, GridFilters][] = [
    ["hoa-don", HOA_DON_GRID_SPEC, {
      supplierId: { kind: "equals", value: "12" }, invoiceNo: { kind: "text", value: SPECIAL }, mapping: { kind: "text", value: "chưa gán" },
    }],
    ["thuc-te-nhap", THUC_TE_NHAP_GRID_SPEC, {
      counterpartyId: { kind: "equals", value: "none" }, mapping: { kind: "text", value: "chưa gán" }, itemName: { kind: "text", value: COMBINING },
    }],
    ["chi-thuc-te", CHI_THUC_TE_GRID_SPEC, {
      supplierId: { kind: "equals", value: "none" }, counterpartyId: { kind: "equals", value: "7" }, content: { kind: "text", value: SPECIAL },
    }],
    ["dau-moi (đầu mối)", DAU_MOI_COUNTERPARTY_GRID_SPEC, { name: { kind: "text", value: COMBINING }, actual: { kind: "equals", value: "chua-chot" } }],
    ["dau-moi (NCC)", DAU_MOI_SUPPLIER_GRID_SPEC, { supplierName: { kind: "text", value: SPECIAL }, counterpartyId: { kind: "equals", value: "0" } }],
  ];

  it.each(cases)("%s: buildQueryString → parseTableQuery returns the same filters", (_name, spec, filters) => {
    const query = buildQueryString({ filters, page: 1, pageSize: spec.defaultPageSize }, spec);
    expect(parseTableQuery(new URLSearchParams(query), spec).filters).toEqual(filters);
    expect(parseGridQuery(`?${query}`, spec)).toEqual(filters);
  });

  it("keeps the none sentinel non-empty so the codec does not drop it", () => {
    expect(thucTeNhapQuery({ counterpartyId: "none" })).toBe("filter.counterpartyId=none");
    expect(parseGridQuery("filter.counterpartyId=none", THUC_TE_NHAP_GRID_SPEC)).toEqual({ counterpartyId: { kind: "equals", value: "none" } });
  });
});

describe("book link builders", () => {
  it("build the contract's parameter names", () => {
    expect(hoaDonQuery({ supplierId: 12, invoiceNo: "0001", mapping: "chưa gán" })).toBe(
      "filter.supplierId=12&filter.invoiceNo=0001&filter.mapping=ch%C6%B0a+g%C3%A1n",
    );
    expect(chiThucTeQuery({ supplierId: "none", counterpartyId: 3 })).toBe("filter.supplierId=none&filter.counterpartyId=3");
    expect(dauMoiQuery({ actual: "chua-chot" })).toBe("filter.actual=chua-chot");
  });

  it("round-trip special characters and Vietnamese with combining marks", () => {
    for (const value of [SPECIAL, COMBINING, "100%", "a+b", "#"]) {
      expect(parseGridQuery(hoaDonQuery({ invoiceNo: value }), HOA_DON_GRID_SPEC)).toEqual({ invoiceNo: { kind: "text", value } });
      expect(parseGridQuery(thucTeNhapQuery({ itemName: value }), THUC_TE_NHAP_GRID_SPEC)).toEqual({ itemName: { kind: "text", value } });
    }
  });

  it("drop unknown columns and values that are not ids, none or the column's options", () => {
    expect(parseGridQuery("filter.supplierId=abc&filter.unknown=1&filter.invoiceNo=", HOA_DON_GRID_SPEC)).toEqual({});
    expect(parseGridQuery("filter.actual=123&filter.counterpartyId=x", DAU_MOI_PAGE_SPEC)).toEqual({});
    expect(dauMoiQuery({ counterpartyId: 0 })).toBe("filter.counterpartyId=0");
  });

  it("Đầu mối: one grid rewrites only its own columns and keeps the other grid's", () => {
    const live = "?filter.name=abc&filter.counterpartyId=0";
    const counterpartyIds = Object.keys(DAU_MOI_COUNTERPARTY_GRID_SPEC.filterable);
    const next = writeGridQuery(live, DAU_MOI_PAGE_SPEC, counterpartyIds, { actual: { kind: "equals", value: "chua-chot" } });
    expect(parseGridQuery(next, DAU_MOI_PAGE_SPEC)).toEqual({
      actual: { kind: "equals", value: "chua-chot" }, counterpartyId: { kind: "equals", value: "0" },
    });
    expect(Object.keys(DAU_MOI_PAGE_SPEC.filterable).sort()).toEqual(["actual", "counterpartyId", "name", "supplierName"]);
  });
});

describe("Ánh xạ parameters", () => {
  const cases: AnhXaParams[] = [
    { tab: "hd", status: "chua_gan" },
    { tab: "tt", status: "thieu_he_so", q: SPECIAL, key: "be tong m300|m3" },
    { tab: "dt", q: COMBINING },
    { status: "ngoai_dt" },
    {},
  ];

  it.each(cases)("build then parse returns %o", (params) => {
    expect(parseAnhXaQuery(anhXaQuery(params))).toEqual(params);
  });

  it("drops unknown values and empty parameters", () => {
    expect(parseAnhXaQuery("tab=xx&status=foo&q=&key=")).toEqual({});
    expect(parseAnhXaQuery("tab=hd&status=all")).toEqual({ tab: "hd" });
  });

  it("cuts q to its first 100 characters when built", () => {
    const name = "đ".repeat(ANH_XA_QUERY_MAX + 1);
    expect(parseAnhXaQuery(anhXaQuery({ q: name })).q).toBe("đ".repeat(ANH_XA_QUERY_MAX));
    expect(parseAnhXaQuery(`q=${encodeURIComponent(name)}`).q).toHaveLength(ANH_XA_QUERY_MAX);
  });

  it("patches only its own parameters", () => {
    expect(patchAnhXaQuery("?foo=1&tab=dt&q=x", { tab: "hd", status: "de_xuat" })).toBe("foo=1&tab=hd&status=de_xuat");
  });
});

describe("Dự toán loai=thieu", () => {
  it("round-trips and drops unknown values", () => {
    expect(parseDuToanQuery(duToanQuery({ loai: "thieu" }))).toEqual({ loai: "thieu" });
    expect(parseDuToanQuery("loai=khac")).toEqual({});
    expect(duToanQuery({})).toBe("");
  });

  it("kindlessEstimateIds agrees with the report's dtWithoutKindValue, including a soft-deleted category", () => {
    // Hạng mục 3 không có hậu tố loại; hạng mục 4 đã xóa mềm (không còn trong danh sách đang dùng);
    // dòng 6 trỏ tới hạng mục không tồn tại.
    const liveCategories = [{ id: 1, code: "HM1-VL" }, { id: 2, code: "HM1-NC" }, { id: 3, code: "HM1-CPC" }, { id: 5, code: "HM2-MAY" }];
    const estimates = [
      { id: 1, categoryId: 1, totalVnd: 100 }, { id: 2, categoryId: 2, totalVnd: 200 }, { id: 3, categoryId: 3, totalVnd: 300 },
      { id: 4, categoryId: 4, totalVnd: 400 }, { id: 5, categoryId: 5, totalVnd: 500 }, { id: 6, categoryId: 99, totalVnd: 600 },
    ];

    // Đúng biểu thức của report-service: mã hạng mục đang còn `?? ""`, rồi kindOfCategoryCode === null.
    const categoryCode = new Map(liveCategories.map((c) => [c.id, c.code]));
    const dtWithoutKindValue = estimates
      .map((e) => ({ ...e, categoryCode: categoryCode.get(e.categoryId) ?? "" }))
      .filter((e) => kindOfCategoryCode(e.categoryCode) === null)
      .reduce((a, e) => a + e.totalVnd, 0);

    const ids = kindlessEstimateIds(estimates, liveCategories);
    expect(ids).toEqual([3, 4, 6]);
    expect(estimates.filter((e) => ids.includes(e.id)).reduce((a, e) => a + e.totalVnd, 0)).toBe(dtWithoutKindValue);
  });
});

describe("canonicalJson", () => {
  it("does not depend on key order and skips undefined fields", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: undefined } })).toBe(canonicalJson({ a: { d: 2 }, b: 1 }));
  });
});
