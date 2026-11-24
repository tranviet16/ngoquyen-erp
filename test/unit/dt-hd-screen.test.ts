/**
 * Màn DT-HĐ, chỉ markup render tĩnh lần đầu (renderToStaticMarkup, không DOM):
 *   - bố cục trang: thanh công cụ, băng cài đặt, màn hình (`print:hidden`), rồi bản in `DtHdView` nguyên
 *     vẹn là con CUỐI (`hidden print:block`, `data-print-view`);
 *   - mở ra mỗi đầu mối một dòng tóm tắt, đóng hết, không có dòng dự toán; `mo` mở khối, bộ lọc mở khối
 *     khớp và ghi "đang lọc: hiện n / m dòng"; `hd=1` hiện dòng "↳";
 *   - Phần B tách Chưa gán / Ngoài DT, link Chưa gán mở đúng khóa ở Ánh xạ, tiền duy nhất là `partBTotal`;
 *   - bảng tóm tắt không bọc `overflow-x-auto`; không emoji.
 * Tương tác (bấm, reload, Back) do lệnh đo `dt-hd` kiểm trên trình duyệt.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DtHdPageContent } from "@/components/du-an/dt-hd-tt/dt-hd-page-content";
import { DtHdScreen } from "@/components/du-an/dt-hd-tt/dt-hd-screen";
import { DtHdView } from "@/components/du-an/dt-hd-tt/dt-hd-view";
import { buildDtHdReport, type DtHdReport } from "@/lib/du-an/dt-hd-tt/dt-hd-report";
import { itemKeyOf } from "@/lib/du-an/dt-hd-tt/keys";
import { DEFAULT_RATES, type ReportInputs } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { anhXaQuery, type DtHdParams } from "@/lib/du-an/dt-hd-tt/screen-links";
import { fixture } from "@/lib/du-an/dt-hd-tt/__tests__/report-fixture";

const SON_KEY = itemKeyOf("Sơn", "thùng");
/** Khóa của dòng HĐ "Sơn" (id 4) — trang đọc từ DB, ở đây viết tay. */
const PART_B_KEYS = { 4: SON_KEY };

const screen = (r: DtHdReport, initialParams: DtHdParams = {}) =>
  renderToStaticMarkup(createElement(DtHdScreen, { projectId: 4, report: r, initialParams, partBKeys: PART_B_KEYS }));
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** `&` trong href được escape thành `&amp;` trong markup. */
const attr = (s: string) => s.replace(/&/g, "&amp;");
const rowOf = (html: string, key: string | number) => {
  const at = html.indexOf(`data-dt-hd-summary-row="${key}"`);
  return html.slice(at, html.indexOf("</tr>", at));
};

/** Sobek có thêm một dòng HĐ chưa gán: Phần B có hai dòng cùng NCC (tổng NCC khác tổng Phần B). */
function twoLinesOneSupplier(): ReportInputs {
  const inp = fixture();
  inp.invoiceLines = [
    ...inp.invoiceLines,
    { id: 7, supplierId: 3, invoiceNo: "7", invoiceDate: null, itemName: "Sơn", unit: "thùng", itemKey: SON_KEY, qty: 1, amountVnd: 500_000, vatVnd: 40_000 },
  ];
  return inp;
}

describe("DT-HĐ page composition", () => {
  const page = (settingsMissing: boolean) => {
    const inp = fixture();
    const r = buildDtHdReport(inp);
    const html = renderToStaticMarkup(
      createElement(DtHdPageContent, {
        projectId: 4, projectLabel: "CT01 — Mầm Non", settings: { ...DEFAULT_RATES, missing: settingsMissing }, report: r, initialParams: {}, partBKeys: PART_B_KEYS,
      }),
    );
    return { html, view: renderToStaticMarkup(createElement(DtHdView, { report: r })) };
  };

  it("renders toolbar, banner, screen, then the untouched print view as the last child", () => {
    const { html, view } = page(true);
    const at = (needle: string) => html.indexOf(needle);
    expect(html.startsWith('<div class="space-y-4">')).toBe(true);
    expect(at("Đối chiếu dự toán – hóa đơn (DT-HĐ)")).toBeGreaterThan(-1);
    expect(at("Đối chiếu dự toán – hóa đơn (DT-HĐ)")).toBeLessThan(at("Công trình chưa cài đặt tỷ lệ"));
    expect(at("Công trình chưa cài đặt tỷ lệ")).toBeLessThan(at('<div class="print:hidden" data-report-screen="">'));
    expect(at('<div class="print:hidden" data-report-screen="">')).toBeLessThan(at("data-dt-hd-screen"));
    expect(html.endsWith(`<div class="hidden print:block" data-print-view="">${view}</div></div>`)).toBe(true);
    expect(count(html, "data-print-view")).toBe(1);
  });

  it("has no banner when the rates are saved, and keeps the print view last", () => {
    const { html, view } = page(false);
    expect(html).not.toContain("Công trình chưa cài đặt tỷ lệ");
    expect(html.endsWith(`<div class="hidden print:block" data-print-view="">${view}</div></div>`)).toBe(true);
  });
});

describe("DT-HĐ screen, first render", () => {
  it("opens on one closed summary row per đầu mối, with no DT lines", () => {
    const r = buildDtHdReport(fixture());
    const html = screen(r);
    expect(count(html, "data-dt-hd-summary-row=")).toBe(r.blocks.length);
    expect(html).toContain(`data-dt-hd-blocks="${r.blocks.length}"`);
    expect(html).toContain('data-dt-hd-state="{}"');
    expect(count(html, 'aria-expanded="false"')).toBe(r.blocks.length);
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).not.toContain("data-dt-hd-line=");
    expect(html).not.toContain("data-dt-hd-block-detail");
    expect(html).not.toContain("data-active-filter");
    expect(html).not.toContain("Lệch đối soát");
    // Mỗi cột là ô của khối, định dạng như bản in.
    const dn = rowOf(html, 11);
    for (const v of ["22.500.000", "14.500.000", "13.500.000", "1.000.000", "15.250.000", "750.000"]) expect(dn).toContain(v);
    expect(dn).toContain('data-statuses="con-thieu"');
    expect(rowOf(html, "none")).toContain('data-statuses="con-thieu chua-co-hd"');
  });

  it("puts the summary table straight under the screen, with no overflow-x-auto box, and uses no emoji", () => {
    const r = buildDtHdReport(fixture());
    for (const html of [screen(r), screen(r, { loc: "con-thieu", hd: true })]) {
      expect(html).not.toContain("overflow-x-auto");
      expect(html).toMatch(/<table class="w-full border-collapse text-xs"><thead>/);
      expect(html).not.toMatch(/[✅❌✓✔✗✘]|\p{Extended_Pictographic}/u);
    }
  });

  it("mo opens that block's groups, still without DT lines", () => {
    const html = screen(buildDtHdReport(fixture()), { mo: [11] });
    expect(rowOf(html, 11)).toContain('data-open="true"');
    expect(count(html, 'aria-expanded="true"')).toBe(1);
    expect(html).toContain('data-dt-hd-block-detail="11"');
    expect(html).toContain("THEP — Thép");
    expect(html).toContain("còn lại 9.000.000");
    expect(html).not.toContain("data-dt-hd-line=");
    expect(html).toContain('data-dt-hd-open="11"');
  });

  it("a loc filter opens the matching blocks and groups, shows only matching lines and says n / m", () => {
    const html = screen(buildDtHdReport(fixture()), { loc: "con-thieu" });
    expect(count(html, "data-dt-hd-summary-row=")).toBe(2);
    expect(html).toContain('data-dt-hd-open="11,none"');
    expect(count(html, 'data-dt-hd-line="con-thieu"')).toBe(2);
    expect(count(html, "data-dt-hd-line=")).toBe(2);
    expect(html).toContain('data-active-filter="2/4"');
    expect(html.replace(/<[^>]+>/g, "")).toContain("Đang lọc: hiện 2 / 4 dòng");
    const chip = html.slice(html.indexOf('data-loc-chip="con-thieu"'));
    expect(chip.slice(0, chip.indexOf("</button>"))).toContain('aria-pressed="true"');
    expect(html).not.toContain("data-dt-hd-invoice");
  });

  it("dauMoi=none shows only Chưa có đầu mối, open, with its groups whole", () => {
    const html = screen(buildDtHdReport(fixture()), { dauMoi: "none" });
    expect(count(html, "data-dt-hd-summary-row=")).toBe(1);
    expect(rowOf(html, "none")).toContain('data-open="true"');
    expect(html).toContain("NC-XAY — Nhân công xây");
    expect(html).toContain("MAY — Máy");
    expect(html).toContain('<option value="none" selected="">');
    expect(html).toContain('data-active-filter="2/4"');
  });

  it("hd=1 shows the ↳ invoice lines under the DT lines, written as in print", () => {
    const html = screen(buildDtHdReport(fixture()), { loc: "con-thieu", hd: true });
    expect(count(html, "data-dt-hd-invoice")).toBe(2);
    expect(html).toContain("↳ Đại Ngàn · HĐ 1 · Thép D10");
    expect(html).toContain("↳ Máy Lộc Tài · HĐ 6 · Máy đào");
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect(screen(buildDtHdReport(fixture()), { loc: "con-thieu" })).not.toMatch(/<input type="checkbox"[^>]*checked=""/);
  });

  it("links an unsettled đầu mối's thực tế to the Đầu mối chưa chốt filter", () => {
    const inp = fixture();
    inp.counterparties = inp.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c));
    const row = rowOf(screen(buildDtHdReport(inp)), 13);
    expect(row).toContain('href="/du-an/4/dt-hd-tt/dau-moi?filter.actual=chua-chot"');
    expect(row).toContain("chưa chốt");
  });

  it("marks a broken block tie-out with a text badge", () => {
    const r = buildDtHdReport(fixture());
    const broken: DtHdReport = { ...r, blocks: r.blocks.map((b, i) => (i === 0 ? { ...b, tieOut: { ...b.tieOut, actual: b.tieOut.expected + 1, ok: false } } : b)) };
    const html = screen(broken);
    expect(rowOf(html, 11)).toContain("Lệch đối soát");
    expect(count(html, "Lệch đối soát")).toBe(1);
  });
});

describe("DT-HĐ screen, Phần B", () => {
  const partB = (html: string) => html.slice(html.indexOf("data-dt-hd-part-b"));

  it("splits chưa gán from Ngoài DT and links each chưa gán line to its exact Ánh xạ key", () => {
    const html = screen(buildDtHdReport(fixture()));
    const b = partB(html);
    expect(b).toMatch(/^data-dt-hd-part-b="1\/1"/);
    expect(b.indexOf("Chưa gán")).toBeLessThan(b.indexOf("Ngoài DT"));
    expect(count(b, "data-part-b-link")).toBe(1);
    expect(b).toContain(`href="${attr(`/du-an/4/dt-hd-tt/anh-xa?${anhXaQuery({ tab: "hd", key: SON_KEY })}`)}"`);
    expect(b).toContain('data-part-b-line="chua_gan"');
    expect(b).toContain('data-part-b-line="ngoai_dt"');
  });

  it("shows partBTotal as the only money total", () => {
    const r = buildDtHdReport(twoLinesOneSupplier());
    expect(r.partBTotal).toBe(3_500_000);
    expect(r.partB.find((s) => s.supplierName === "Sobek")?.total).toBe(2_500_000);
    const b = partB(screen(r));
    expect(count(b, "3.500.000")).toBe(1);
    expect(b).not.toContain("2.500.000");
    expect(b).toMatch(/^data-dt-hd-part-b="2\/1"/);
  });
});
