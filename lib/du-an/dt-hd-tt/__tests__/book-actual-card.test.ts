/**
 * Thẻ "Thực tế (sổ DT-HĐ-TT)" của Dashboard: số, dòng phụ và sắc thái so với GIÁ TRỊ VIẾT SẴN (tính tay ở
 * book-card-fixture.ts), cho từng trường hợp làm thực tế của sổ chưa đủ, chênh âm và đủ số liệu.
 */

import { describe, expect, it } from "vitest";
import { BOOK_ACTUAL_LABEL, bookActualCard, selectBudgetHeadline, tongQuanPath } from "../overview";
import { buildReports } from "../reports";
import type { ReportInputs } from "../report-inputs";
import { screenPath } from "../screen-links";
import {
  complete, legacyPlusOneInvoice, noCounterparty, otherCounterpartiesOnly, overBudget, overBudgetWithUntagged, unsettledRow,
  untaggedReceiptsOnly,
} from "./book-card-fixture";
import { fixture } from "./report-fixture";

/** Intl tách số và "₫" bằng khoảng trắng không ngắt; so chữ với khoảng trắng thường. */
const plain = (s: string) => s.replace(/ /g, " ");

function cardOf(inp: ReportInputs) {
  const c = bookActualCard(buildReports(inp));
  return { ...c, value: plain(c.value), sub: plain(c.sub) };
}

const LABEL = "Thực tế (sổ DT-HĐ-TT)";

describe("bookActualCard", () => {
  it("no đầu mối: 0 đ, chênh = Gxd, warning", () => {
    expect(cardOf(noCounterparty())).toEqual({
      label: LABEL, actual: 0, value: "0 ₫",
      sub: "Gxd 295.444.260 ₫ · Chênh DT − TT 295.444.260 ₫ · thực tế chưa đủ",
      tone: "warning", incomplete: true,
    });
    // Chỉ có khoản khác (khối C) thì Phần II A và B vẫn trống: vẫn chưa đủ.
    expect(cardOf(otherCounterpartiesOnly())).toEqual({
      label: LABEL, actual: 5_000_000, value: "5.000.000 ₫",
      sub: "Gxd 295.444.260 ₫ · Chênh DT − TT 290.444.260 ₫ · thực tế chưa đủ",
      tone: "warning", incomplete: true,
    });
  });

  it("untagged receipts only: the receipts basis gives 0, not null, so the warning comes from the untagged amount", () => {
    const r = buildReports(untaggedReceiptsOnly());
    expect(r.dtTt.phanII.a.map((x) => x.actual)).toEqual([0]);
    expect(r.dtTt.untaggedReceipts).toBe(86_670_000);
    expect(cardOf(untaggedReceiptsOnly())).toEqual({
      label: LABEL, actual: 0, value: "0 ₫",
      sub: "Gxd 295.444.260 ₫ · Chênh DT − TT 295.444.260 ₫ · thực tế chưa đủ",
      tone: "warning", incomplete: true,
    });
  });

  it("legacy amountTt plus one book invoice: no Phần II rows, thực tế 0, warning", () => {
    const r = buildReports(legacyPlusOneInvoice());
    const { a, b, c } = r.dtTt.phanII;
    expect([a.length, b.length, c.length]).toEqual([0, 0, 0]);
    expect(cardOf(legacyPlusOneInvoice())).toEqual({
      label: LABEL, actual: 0, value: "0 ₫",
      sub: "Gxd 295.444.260 ₫ · Chênh DT − TT 295.444.260 ₫ · thực tế chưa đủ",
      tone: "warning", incomplete: true,
    });
  });

  it("a Phần II row with actual === null: warning", () => {
    expect(cardOf(unsettledRow())).toEqual({
      label: LABEL, actual: 146_674_000, value: "146.674.000 ₫",
      sub: "Gxd 295.444.260 ₫ · Chênh DT − TT 148.770.260 ₫ · thực tế chưa đủ",
      tone: "warning", incomplete: true,
    });
  });

  it("chênh < 0: danger, and danger wins over an incomplete figure but keeps the chưa đủ hint", () => {
    expect(cardOf(overBudget())).toEqual({
      label: LABEL, actual: 500_674_000, value: "500.674.000 ₫",
      sub: "Gxd 295.444.260 ₫ · Chênh DT − TT -205.229.740 ₫",
      tone: "danger", incomplete: false,
    });
    expect(cardOf(overBudgetWithUntagged())).toEqual({
      label: LABEL, actual: 500_674_000, value: "500.674.000 ₫",
      sub: "Gxd 295.444.260 ₫ · Chênh DT − TT -205.229.740 ₫ · thực tế chưa đủ",
      tone: "danger", incomplete: true,
    });
  });

  it("complete data with chênh ≥ 0: success", () => {
    expect(cardOf(complete())).toEqual({
      label: LABEL, actual: 155_674_000, value: "155.674.000 ₫",
      sub: "Gxd 295.444.260 ₫ · Chênh DT − TT 139.770.260 ₫",
      tone: "success", incomplete: false,
    });
    // Công trình mẫu chưa gắn dòng bê tông (70.200.000): cùng số, nhưng chưa đủ.
    expect(cardOf(fixture())).toMatchObject({ actual: 155_674_000, tone: "warning", incomplete: true });
  });

  it("compares untagged receipts after rounding to the đồng, like the print view", () => {
    const inp = complete();
    inp.receipts = [...inp.receipts, { id: 9, itemKey: inp.receipts[0].itemKey, qty: null, amountVnd: 0.4, counterpartyId: null }];
    expect(buildReports(inp).dtTt.untaggedReceipts).not.toBe(0);
    expect(cardOf(inp)).toMatchObject({ tone: "success", incomplete: false });
  });

  it("shows the same cell as Tổng quan and links to Tổng quan", () => {
    for (const make of [complete, noCounterparty, unsettledRow, overBudget]) {
      const r = buildReports(make());
      const card = bookActualCard(r);
      expect(card.label).toBe(BOOK_ACTUAL_LABEL);
      expect(card.actual).toBe(selectBudgetHeadline(r).actual.value);
    }
    expect(tongQuanPath(4)).toBe("/du-an/4/dt-hd-tt");
    // Mọi màn của tab nằm dưới đường dẫn Tổng quan.
    expect(screenPath(4, "dt-tt").startsWith(`${tongQuanPath(4)}/`)).toBe(true);
  });
});
