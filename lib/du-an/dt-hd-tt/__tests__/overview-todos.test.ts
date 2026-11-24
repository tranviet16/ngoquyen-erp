/**
 * Tiêu chí 3, phần Tổng quan — mỗi việc cần làm được đếm bằng đúng vị từ của màn đích:
 *   - số đếm > 0 (hoặc số tiền ≠ 0) ⇒ áp bộ lọc mà link mang vào CÙNG dữ liệu còn ≥ 1 dòng; với việc
 *     đếm dòng, số đếm = số dòng màn đích hiện; việc bằng 0 thì bị ẩn và màn đích cũng không có dòng nào;
 *   - href đọc lại (bằng parser của màn đó) ra đúng tham số đã dựng;
 *   - màn chưa sẵn sàng ⇒ trang trần; ngoại lệ không lọc duy nhất là Cài đặt.
 * Dữ liệu mẫu có một alias HĐ trỏ Dòng DT không còn (chưa gán theo `effectiveAliasStatus`).
 */

import { describe, expect, it } from "vitest";
import { applyFilter } from "@/components/data-grid/apply-filter-sort";
import type { DataGridColumn, SelectOption } from "@/components/data-grid/types";
import { noneFilterable } from "@/components/du-an/dt-hd-tt/none-filter-column";
import type { AliasBoard } from "../alias-board";
import { filterAnhXaRows } from "../anh-xa-filter";
import { buildHdTtView, buildScreenRows } from "../hd-tt-screen-model";
import {
  boardLiveDtKeys, buildOverviewTodos, HD_TT_LOC_PREDICATES, linkHref, overviewTodoCandidates, type HdTtLoc, type OverviewTodo, type SupplierLinkRow,
  type TodoId,
} from "../overview-todos";
import { buildReports, type DtHdTtReports } from "../reports";
import {
  ANH_XA_URL, DAU_MOI_COUNTERPARTY_URL, DAU_MOI_SUPPLIER_URL, HD_TT_URL, kindlessEstimateIds, parseDuToanQuery, READY_TARGETS, screenPath,
  THUC_TE_NHAP_URL, UNSETTLED_ACTUAL,
} from "../screen-links";
import { boardOf, linksOf, STALE_DT_KEY, todoScenario, type TodoScenario } from "./overview-fixture";
import { fixture, K } from "./report-fixture";

const PROJECT = 4;

interface Data extends TodoScenario {
  reports: DtHdTtReports;
  board: AliasBoard;
  links: SupplierLinkRow[];
}

function dataOf(s: TodoScenario): Data {
  return { ...s, reports: buildReports(s.inp), board: boardOf(s.inp), links: linksOf(s.inp) };
}

/** Công trình mẫu gốc: dự toán không có dòng chưa có loại. */
const baseData = (): Data => dataOf({ inp: fixture(), estimates: [], liveCategories: [] });

const split = (href: string) => new URL(href, "http://erp.local");

// ---------------------------------------------------------------------------
// Vị từ của từng màn đích, đọc bộ lọc TỪ HREF bằng parser của màn đó
// ---------------------------------------------------------------------------

type CpGridRow = { id: number; actual: number | null };
type SupplierGridRow = { id: number; counterpartyId: number };
type ReceiptGridRow = { id: number; counterpartyId: number | string };

/** Cột "Thực tế" của lưới đầu mối (dau-moi-client.tsx): null → "chưa chốt". */
const CP_COLUMNS: DataGridColumn<CpGridRow>[] = [
  { id: "actual", title: "Thực tế", kind: "currency", filterAccessor: (r) => (r.actual === null ? UNSETTLED_ACTUAL : String(r.actual)) },
];
/** Cột "Đầu mối" của lưới NCC (dau-moi-suppliers.tsx): đầu mối trống = 0. */
const SUPPLIER_COLUMNS: DataGridColumn<SupplierGridRow>[] = [{ id: "counterpartyId", title: "Đầu mối", kind: "select" }];

function receiptColumns(d: Data): DataGridColumn<ReceiptGridRow>[] {
  const options: SelectOption[] = [{ id: "", name: "(chưa gắn)" }, ...d.inp.counterparties.map((c) => ({ id: c.id, name: c.name }))];
  return [{ id: "counterpartyId", title: "Đầu mối", kind: "select", options, ...noneFilterable<ReceiptGridRow>("counterpartyId", options) }];
}

/** Dòng mà màn đích sẽ hiện khi mở link của việc; null = Cài đặt (ngoại lệ không lọc). */
function landingRows(t: OverviewTodo, d: Data): unknown[] | null {
  const url = split(linkHref(PROJECT, t.link));
  const live = boardLiveDtKeys(d.board);
  switch (t.link.target) {
    case "anh-xa": {
      const p = ANH_XA_URL.parse(url.search);
      return filterAnhXaRows(d.board.tabs[p.tab!], p, live);
    }
    case "thuc-te-nhap": {
      const rows = d.inp.receipts.map((r): ReceiptGridRow => ({ id: r.id, counterpartyId: r.counterpartyId ?? "" }));
      return applyFilter(rows, THUC_TE_NHAP_URL.parse(url.search), receiptColumns(d));
    }
    case "dau-moi": {
      if (url.hash === "#ncc-chua-co-dong") {
        // Nguyên văn thông báo `withoutRow` của dau-moi/page.tsx.
        const linked = new Set(d.links.map((l) => l.supplierId));
        return d.reports.hdTt.rows.filter((r) => !linked.has(r.supplierId)).map((r) => r.supplierName);
      }
      const { a, b, c } = d.reports.dtTt.phanII;
      const actualOf: Record<number, number | null> = Object.fromEntries([...a, ...b, ...c].map((r) => [r.counterpartyId, r.actual]));
      const cpFilters = DAU_MOI_COUNTERPARTY_URL.parse(url.search);
      const supplierFilters = DAU_MOI_SUPPLIER_URL.parse(url.search);
      if (Object.keys(cpFilters).length > 0) {
        const rows = d.inp.counterparties.map((cp): CpGridRow => ({ id: cp.id, actual: actualOf[cp.id] ?? null }));
        return applyFilter(rows, cpFilters, CP_COLUMNS);
      }
      const rows = d.inp.counterpartySuppliers.map((l): SupplierGridRow => ({ id: l.id, counterpartyId: l.counterpartyId ?? 0 }));
      return applyFilter(rows, supplierFilters, SUPPLIER_COLUMNS);
    }
    case "du-toan":
      return parseDuToanQuery(url.search).loai === "thieu" ? kindlessEstimateIds(d.estimates, d.liveCategories) : d.estimates;
    case "hd-tt": {
      // Màn HĐ-TT: đọc `loc` từ href bằng parser của màn, lọc bằng đúng hàm dựng bảng của màn.
      const { loc } = HD_TT_URL.parse(url.search);
      return buildHdTtView(buildScreenRows(d.reports.hdTt.rows), loc).groups.flatMap((g) => g.rows);
    }
    case "cai-dat":
      return null;
    default:
      throw new Error(`chưa có vị từ cho ${t.link.target}`);
  }
}

/** Tham số mà mỗi việc phải mang khi đọc lại (bằng parser của màn đích). */
const EXPECTED: Record<TodoId, { target: string; parse?: (search: string) => unknown; value?: unknown; hash?: string; loc?: HdTtLoc }> = {
  "chua-gan-hd": { target: "anh-xa", parse: ANH_XA_URL.parse, value: { tab: "hd", status: "chua_gan" } },
  "chua-gan-tt": { target: "anh-xa", parse: ANH_XA_URL.parse, value: { tab: "tt", status: "chua_gan" } },
  "chua-gan-dt": { target: "anh-xa", parse: ANH_XA_URL.parse, value: { tab: "dt", status: "chua_gan" } },
  "de-xuat-hd": { target: "anh-xa", parse: ANH_XA_URL.parse, value: { tab: "hd", status: "de_xuat" } },
  "de-xuat-tt": { target: "anh-xa", parse: ANH_XA_URL.parse, value: { tab: "tt", status: "de_xuat" } },
  "de-xuat-dt": { target: "anh-xa", parse: ANH_XA_URL.parse, value: { tab: "dt", status: "de_xuat" } },
  "thieu-he-so-hd": { target: "anh-xa", parse: ANH_XA_URL.parse, value: { tab: "hd", status: "thieu_he_so" } },
  "thieu-he-so-tt": { target: "anh-xa", parse: ANH_XA_URL.parse, value: { tab: "tt", status: "thieu_he_so" } },
  "tt-chua-gan-dau-moi": { target: "thuc-te-nhap", parse: THUC_TE_NHAP_URL.parse, value: { counterpartyId: { kind: "equals", value: "none" } } },
  "dau-moi-chua-chot": { target: "dau-moi", parse: DAU_MOI_COUNTERPARTY_URL.parse, value: { actual: { kind: "equals", value: "chua-chot" } } },
  "ncc-chua-thuoc-dau-moi": { target: "dau-moi", parse: DAU_MOI_SUPPLIER_URL.parse, value: { counterpartyId: { kind: "equals", value: "0" } }, hash: "ncc" },
  "ncc-chua-co-dong": { target: "dau-moi", hash: "ncc-chua-co-dong" },
  "du-toan-chua-co-loai": { target: "du-toan", parse: parseDuToanQuery, value: { loai: "thieu" } },
  "chua-cai-dat": { target: "cai-dat" },
  "ke-toan-co-viec": { target: "hd-tt", parse: HD_TT_URL.parse, value: { loc: "co-viec" }, loc: "co-viec" },
};

describe("to-do counts use their landing screen's predicate", () => {
  it("the scenario really has every to-do due, including a stale DT key counted as chưa gán", () => {
    const d = dataOf(todoScenario());
    expect(buildOverviewTodos(d.reports, d.board, d.links).map((t) => t.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    const stale = d.board.tabs.hd.find((r) => r.alias?.dtKey === STALE_DT_KEY);
    expect(stale && filterAnhXaRows(d.board.tabs.hd, { tab: "hd", status: "chua_gan" }, boardLiveDtKeys(d.board))).toContain(stale);
  });

  it.each([
    ["every to-do due", () => dataOf(todoScenario())],
    ["base fixture", baseData],
  ])("%s: count > 0 ⇔ the landing filter shows ≥ 1 row, and counts equal the landing rows", (_name, make) => {
    const d = make();
    for (const { todo, due } of overviewTodoCandidates(d.reports, d.board, d.links)) {
      const rows = landingRows(todo, d);
      if (rows === null) {
        expect(todo.id).toBe("chua-cai-dat");
        expect(due).toBe(d.reports.settings.missing);
        continue;
      }
      if (todo.count !== null) {
        expect(todo.count, todo.id).toBe(rows.length);
        expect(due, todo.id).toBe(rows.length > 0);
      } else if (due) {
        expect(rows.length, todo.id).toBeGreaterThan(0);
      }
    }
  });

  it("hides every to-do whose count is zero", () => {
    const d = baseData();
    const shown = buildOverviewTodos(d.reports, d.board, d.links);
    const candidates = overviewTodoCandidates(d.reports, d.board, d.links);
    expect(shown.map((t) => t.id)).toEqual(candidates.filter((c) => c.due).map((c) => c.todo.id));
    expect(shown.length).toBeLessThan(candidates.length);
    for (const t of shown) expect(t.count === null || t.count > 0, t.id).toBe(true);
  });

  it("the untagged-receipts amount is exactly the receipts the landing filter shows", () => {
    const d = dataOf(todoScenario());
    const t = buildOverviewTodos(d.reports, d.board, d.links).find((x) => x.id === "tt-chua-gan-dau-moi")!;
    const rows = landingRows(t, d) as ReceiptGridRow[];
    const amount = d.inp.receipts.filter((r) => rows.some((x) => x.id === r.id)).reduce((a, r) => a + r.amountVnd, 0);
    expect(t.amount).toEqual({ value: amount, basis: "gồm VAT" });
    expect(amount).toBe(d.reports.dtTt.untaggedReceipts);
  });

  it("the kindless estimate amount is exactly the estimates the Dự toán filter shows", () => {
    const d = dataOf(todoScenario());
    const t = buildOverviewTodos(d.reports, d.board, d.links).find((x) => x.id === "du-toan-chua-co-loai")!;
    const ids = landingRows(t, d) as number[];
    expect(d.estimates.filter((e) => ids.includes(e.id)).reduce((a, e) => a + e.totalVnd, 0)).toBe(t.amount?.value);
    expect(t.amount?.value).toBe(d.reports.phanIII.dtWithoutKind);
  });
});

describe("to-do links", () => {
  const d = dataOf(todoScenario());
  const todos = buildOverviewTodos(d.reports, d.board, d.links);

  it("every href parses back to the parameters it was built with", () => {
    for (const t of todos) {
      const e = EXPECTED[t.id];
      const href = linkHref(PROJECT, t.link);
      const url = split(href);
      expect(t.link.target, t.id).toBe(e.target);
      expect(url.pathname, t.id).toBe(screenPath(PROJECT, t.link.target));
      if (READY_TARGETS.includes(t.link.target)) {
        if (e.parse) expect(e.parse(url.search), t.id).toEqual(e.value);
        else expect(url.search, t.id).toBe("");
        expect(url.hash, t.id).toBe(e.hash ? `#${e.hash}` : "");
      }
      if (e.loc) expect(new URLSearchParams(t.link.params?.query).get("loc"), t.id).toBe(e.loc);
    }
  });

  it("a target that is not ready yields the bare path", () => {
    for (const t of todos) {
      if (READY_TARGETS.includes(t.link.target)) continue;
      expect(linkHref(PROJECT, t.link), t.id).toBe(screenPath(PROJECT, t.link.target));
    }
    // HĐ-TT đã sẵn sàng: việc Z mở HĐ-TT lọc sẵn `loc=co-viec`.
    const z = todos.find((t) => t.id === "ke-toan-co-viec")!;
    expect(READY_TARGETS).toContain("hd-tt");
    expect(linkHref(PROJECT, z.link)).toBe("/du-an/4/dt-hd-tt/hd-tt?loc=co-viec");
  });

  it("only Cài đặt is allowed to open unfiltered", () => {
    const unfiltered = todos.filter((t) => !t.link.params?.query && !t.link.params?.hash).map((t) => t.link.target);
    expect(unfiltered).toEqual(["cai-dat"]);
  });

  it("orders the to-dos as the spec table", () => {
    expect(todos.map((t) => t.id)).toEqual([
      "chua-gan-hd", "chua-gan-tt", "chua-gan-dt", "de-xuat-hd", "de-xuat-tt", "de-xuat-dt", "thieu-he-so-hd", "thieu-he-so-tt",
      "tt-chua-gan-dau-moi", "dau-moi-chua-chot", "ncc-chua-thuoc-dau-moi", "ncc-chua-co-dong", "du-toan-chua-co-loai", "chua-cai-dat",
      "ke-toan-co-viec",
    ]);
  });
});

describe("HĐ-TT loc predicates", () => {
  it("match the U, Y and Z columns", () => {
    const rows = buildReports(fixture()).hdTt.rows;
    expect(rows.filter(HD_TT_LOC_PREDICATES["con-phai-lay-hd"]).every((r) => Math.round(r.actualMinusInvoice) > 0)).toBe(true);
    expect(rows.filter(HD_TT_LOC_PREDICATES["con-phai-lay-ve"]).every((r) => Math.round(r.stillToRecover) > 0)).toBe(true);
    expect(rows.filter(HD_TT_LOC_PREDICATES["co-viec"]).map((r) => r.todo)).toEqual(["Lấy thêm HĐ"]);
    expect(HD_TT_LOC_PREDICATES["co-viec"]({ ...rows[0], todo: "   " })).toBe(false);
  });

  it("the base fixture's live DT keys are the board's", () => {
    expect([...boardLiveDtKeys(boardOf(fixture()))].sort()).toEqual([K.betong, K.may, K.nhanCong, K.thep].sort());
  });
});
