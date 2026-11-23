/**
 * Tiêu chí 2 — mỗi số của Tổng quan BẰNG ĐÚNG ô báo cáo mà nó mang tên (bảng so sánh nguyên văn, trên
 * nhiều biến thể dữ liệu), chênh Phần III đi qua `phanIIIDiff` (kể cả khi thực tế null), danh sách đầu mối
 * vượt chỉ là Phần II A + B có chênh < 0, và kiểm tổng gom đủ các dòng đối soát của ba báo cáo.
 */

import { describe, expect, it } from "vitest";
import {
  buildOverview, collectChecks, FIGURE_IDS, OVER_BUDGET_MAX, phanIIIDiff, phanIIITotalRow, selectBudgetHeadline, selectOverBudget, type FigureId,
} from "../overview";
import { HD_TT_LOC_PREDICATES, hdTtLocQuery, linkHref } from "../overview-todos";
import { buildReports, type DtHdTtReports } from "../reports";
import { DEFAULT_RATES, type ReportInputs } from "../report-inputs";
import { READY_TARGETS, screenPath } from "../screen-links";
import { boardOf, linksOf, overBudgetInputs, todoScenario } from "./overview-fixture";
import { fixture, K } from "./report-fixture";

const total = (r: DtHdTtReports) => r.phanIII.rows.find((x) => x.key === "total")!;

/** Bảng nguyên văn: số của Tổng quan ↔ ô báo cáo cùng tên. */
const FIELD_OF: Record<FigureId, (r: DtHdTtReports) => number | null> = {
  "gxd-estimate": (r) => total(r).estimate,
  "gxd-actual": (r) => total(r).actual,
  "gxd-diff": (r) => phanIIIDiff(total(r)),
  "sigma-e": (r) => r.hdTt.totals.invoiceTotal,
  "sigma-t": (r) => r.hdTt.totals.actual,
  "sigma-u": (r) => r.hdTt.totals.actualMinusInvoice,
  "sigma-i": (r) => r.hdTt.totals.paid,
  "sigma-v": (r) => r.hdTt.totals.debt,
  "sigma-y": (r) => r.hdTt.totals.stillToRecover,
};

function unsettledAndDefaults(): ReportInputs {
  const inp = fixture();
  inp.settings = { ...DEFAULT_RATES, missing: true };
  inp.counterparties = inp.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c));
  return inp;
}

function staleKey(): ReportInputs {
  const inp = fixture();
  inp.aliases = inp.aliases.map((a) => (a.source === "hd" && a.dtKey === K.may ? { ...a, dtKey: "dong-dt-khong-con|ca|MTC" } : a));
  return inp;
}

const VARIANTS: [string, () => ReportInputs][] = [
  ["base", fixture],
  ["default rates, unsettled counterparty", unsettledAndDefaults],
  ["stale DT key", staleKey],
  ["many over budget", overBudgetInputs],
  ["every to-do due", () => todoScenario().inp],
];

const overviewOf = (inp: ReportInputs) => {
  const r = buildReports(inp);
  return { r, o: buildOverview(r, boardOf(inp), linksOf(inp)) };
};

describe("Tổng quan figures equal the report fields they name", () => {
  it.each(VARIANTS)("%s", (_name, make) => {
    const { r, o } = overviewOf(make());
    expect(Object.keys(o.figures).sort()).toEqual([...FIGURE_IDS].sort());
    for (const id of FIGURE_IDS) expect(o.figures[id].value, id).toBe(FIELD_OF[id](r));
    // Viết thẳng từng ô, như đề bài yêu cầu.
    expect(o.figures["gxd-estimate"].value).toBe(total(r).estimate);
    expect(o.figures["gxd-actual"].value).toBe(total(r).actual);
    expect(o.figures["gxd-diff"].value).toBe(total(r).estimate - total(r).actual!);
    expect(o.figures["sigma-e"].value).toBe(r.hdTt.totals.invoiceTotal);
    expect(o.figures["sigma-t"].value).toBe(r.hdTt.totals.actual);
    expect(o.figures["sigma-u"].value).toBe(r.hdTt.totals.actualMinusInvoice);
    expect(o.figures["sigma-i"].value).toBe(r.hdTt.totals.paid);
    expect(o.figures["sigma-v"].value).toBe(r.hdTt.totals.debt);
    expect(o.figures["sigma-y"].value).toBe(r.hdTt.totals.stillToRecover);
  });

  it("selectBudgetHeadline is the Phần III Gxd row", () => {
    const r = buildReports(fixture());
    const h = selectBudgetHeadline(r);
    expect(phanIIITotalRow(r)).toBe(total(r));
    expect([h.estimate.value, h.actual.value, h.diff.value]).toEqual([total(r).estimate, total(r).actual, phanIIIDiff(total(r))]);
  });

  it("phanIIIDiff leaves the cell empty when thực tế is null, like the print view", () => {
    expect(phanIIIDiff({ estimate: 10, actual: null })).toBeNull();
    expect(phanIIIDiff({ estimate: 10, actual: 4 })).toBe(6);
    expect(phanIIIDiff({ estimate: 4, actual: 10 })).toBe(-6);

    // Dòng Gxd có thực tế null (không xảy ra với báo cáo hiện tại, nhưng chênh vẫn phải trống chứ không = dự toán).
    const r = buildReports(fixture());
    const nulled: DtHdTtReports = {
      ...r,
      phanIII: { ...r.phanIII, rows: r.phanIII.rows.map((x) => (x.key === "total" ? { ...x, actual: null } : x)) },
    };
    const o = buildOverview(nulled, boardOf(fixture()), linksOf(fixture()));
    expect(o.figures["gxd-actual"].value).toBeNull();
    expect(o.figures["gxd-diff"].value).toBeNull();
    // Dòng MTC của Phần III luôn null thực tế: cùng quy tắc.
    expect(phanIIIDiff(r.phanIII.rows.find((x) => x.key === "mtc")!)).toBeNull();
  });

  it("labels the two thực tế figures apart and says Σ U nets across NCC", () => {
    const { o } = overviewOf(fixture());
    expect(o.figures["gxd-actual"].label).toBe("Thực tế toàn công trình (Phần III)");
    expect(o.figures["sigma-t"].label).toBe("Thực tế các NCC có HĐ (HĐ-TT Σ T)");
    expect(o.figures["sigma-u"].label).toBe("Còn phải lấy HĐ: Σ T − Σ E, bù trừ giữa các NCC");
    for (const id of FIGURE_IDS) expect(o.figures[id].basis, id).toMatch(id.startsWith("gxd") ? /sau thuế/ : /gồm VAT/);
  });

  it("links each figure to where it lives, filtered only once the target is ready", () => {
    const { o } = overviewOf(fixture());
    const expectHref = (id: FigureId, query?: string, hash?: string) => {
      const f = o.figures[id];
      const bare = screenPath(4, f.link.target);
      const full = `${bare}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
      expect(linkHref(4, f.link), id).toBe(READY_TARGETS.includes(f.link.target) ? full : bare);
    };
    for (const id of ["gxd-estimate", "gxd-actual", "gxd-diff"] as const) expectHref(id, undefined, "phan-iii");
    expectHref("sigma-u", hdTtLocQuery("con-phai-lay-hd"));
    expectHref("sigma-y", hdTtLocQuery("con-phai-lay-ve"));
    for (const id of ["sigma-e", "sigma-t", "sigma-i", "sigma-v"] as const) expectHref(id);
    expect(new URLSearchParams(o.figures["sigma-u"].link.params?.query).get("loc")).toBe("con-phai-lay-hd");
  });

  it("Σ U > 0 always has a row with U > 0 behind its link", () => {
    for (const [, make] of VARIANTS) {
      const r = buildReports(make());
      if (Math.round(r.hdTt.totals.actualMinusInvoice) > 0) expect(r.hdTt.rows.some(HD_TT_LOC_PREDICATES["con-phai-lay-hd"])).toBe(true);
      if (Math.round(r.hdTt.totals.stillToRecover) > 0) expect(r.hdTt.rows.some(HD_TT_LOC_PREDICATES["con-phai-lay-ve"])).toBe(true);
    }
  });
});

describe("đầu mối vượt dự toán", () => {
  it("lists only Phần II A and B rows with chênh < 0, most negative first, at most ten", () => {
    const r = buildReports(overBudgetInputs());
    const ob = selectOverBudget(r);
    const expected = [...r.dtTt.phanII.a, ...r.dtTt.phanII.b].filter((x) => x.diff !== null && x.diff < 0).sort((x, y) => x.diff! - y.diff!);
    expect(expected.length).toBeGreaterThan(OVER_BUDGET_MAX);
    expect(ob.count).toBe(expected.length);
    expect(ob.rows.map((x) => x.counterpartyId)).toEqual(expected.slice(0, OVER_BUDGET_MAX).map((x) => x.counterpartyId));
    expect(ob.rows.every((x) => x.kind !== "khac")).toBe(true);
    // Khối C có chênh âm nhưng không có dự toán: không xét.
    expect(r.dtTt.phanII.c.some((x) => x.diff !== null && x.diff < 0)).toBe(true);
    // Khối B có mặt khi vượt.
    expect(ob.rows.some((x) => x.kind === "to_nhan_cong")).toBe(true);
    for (const row of ob.rows) {
      const src = [...r.dtTt.phanII.a, ...r.dtTt.phanII.b].find((x) => x.counterpartyId === row.counterpartyId)!;
      expect([row.dtInclVat, row.actual, row.diff]).toEqual([src.dtInclVat, src.actual, src.diff]);
      expect(row.link).toEqual({ target: "dt-tt", params: { hash: `dm-${row.counterpartyId}` } });
    }
    expect(ob.allLink).toEqual({ target: "dt-tt", params: { hash: "phan-ii" } });
  });

  it("counts the chưa chốt đầu mối with the same null test as the Đầu mối filter", () => {
    const r = buildReports(unsettledAndDefaults());
    const { a, b, c } = r.dtTt.phanII;
    const ob = selectOverBudget(r);
    expect(ob.unsettled).toBe([...a, ...b, ...c].filter((x) => x.actual === null).length);
    expect(ob.unsettled).toBeGreaterThan(0);
    expect(linkHref(4, ob.unsettledLink)).toBe("/du-an/4/dt-hd-tt/dau-moi?filter.actual=chua-chot");
  });
});

describe("kiểm tổng", () => {
  it("gathers every DT-HĐ block tie-out, the grand check, DT-TT and HĐ-TT checks", () => {
    const r = buildReports(fixture());
    const checks = collectChecks(r);
    expect(checks).toHaveLength(r.dtHd.blocks.length + 1 + r.dtTt.checks.length + r.hdTt.checks.length);
    expect(checks.filter((c) => c.group === "DT-HĐ").map((c) => c.check)).toEqual([...r.dtHd.blocks.map((b) => b.tieOut), r.dtHd.grandCheck]);
    expect(checks.filter((c) => c.group === "DT-TT").map((c) => c.check)).toEqual(r.dtTt.checks);
    expect(checks.filter((c) => c.group === "HĐ-TT").map((c) => c.check)).toEqual(r.hdTt.checks);
    expect(checks.filter((c) => c.scope !== null).map((c) => c.scope)).toEqual(r.dtHd.blocks.map((b) => b.name));
  });
});
