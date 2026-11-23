/**
 * Màn HĐ-TT, chỉ markup render tĩnh lần đầu (renderToStaticMarkup, không DOM):
 *   - người chỉ có quyền đọc: không nút nhập, không ô nhập; người có quyền sửa: có nút, chế độ nhập tắt sẵn;
 *   - chế độ nhập: đúng 4 ô nhập (H, S, X, Z) mỗi dòng có link, dòng không link chỉ link "Thêm dòng NCC ở Đầu mối";
 *     ô S khóa kèm lý do ở dòng `canTypeSplit` sai;
 *   - đủ 13 đầu cột tiền, lớp dính của đầu bảng, cột NCC và dòng tổng; tên NCC `line-clamp-2` + `title`;
 *   - `loc` lọc dòng nhưng dòng tổng vẫn là tổng cả bảng, ghi "Tổng cộng (cả bảng)"; E / G là link sổ; huy hiệu;
 *   - Σ T lệch vì S ngoài quy tắc → dòng kiểm nêu tên NCC, link tới lưới NCC của Đầu mối.
 * Gõ, lưu, Enter / Tab / Esc do lệnh đo và phiên thủ công kiểm trên trình duyệt.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/du-an/dt-hd-tt/counterparty-service", () => ({ updateCounterpartySupplier: vi.fn() }));

import { HdTtScreen } from "@/components/du-an/dt-hd-tt/hd-tt-screen";
import { HdTtScreenTable, type HdTtEditController } from "@/components/du-an/dt-hd-tt/hd-tt-screen-table";
import { buildHdTtReport, type HdTtReport } from "@/lib/du-an/dt-hd-tt/hd-tt-report";
import { buildHdTtView, buildScreenRows } from "@/lib/du-an/dt-hd-tt/hd-tt-screen-model";
import type { HdTtParams } from "@/lib/du-an/dt-hd-tt/screen-links";
import { fixture } from "@/lib/du-an/dt-hd-tt/__tests__/report-fixture";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const attr = (s: string) => s.replace(/&/g, "&amp;");
const rowOf = (html: string, supplierId: number) => {
  const at = html.indexOf(`data-hd-tt-row="${supplierId}"`);
  return html.slice(at, html.indexOf("</tr>", at));
};
const text = (html: string) => html.replace(/<[^>]+>/g, "");

const screen = (report: HdTtReport, canEdit: boolean, initialParams: HdTtParams = {}) =>
  renderToStaticMarkup(createElement(HdTtScreen, { projectId: 4, report, initialParams, canEdit }));

const NOOP_EDIT: HdTtEditController = { drafts: {}, saving: new Set(), change: () => {}, commit: () => {}, revert: () => {}, register: () => {} };

function table(report: HdTtReport, edit: HdTtEditController | null) {
  const view = buildHdTtView(buildScreenRows(report.rows), undefined);
  return renderToStaticMarkup(createElement(HdTtScreenTable, { projectId: 4, groups: view.groups, totals: report.totals, filtering: false, edit }));
}

describe("HĐ-TT screen, read and edit rights", () => {
  const report = buildHdTtReport(fixture());

  it("a read user sees no edit toggle and no input", () => {
    const html = screen(report, false);
    expect(html).toContain('data-can-edit="false"');
    expect(html).not.toContain("data-hd-tt-edit-toggle");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Nhập H / S / X / Z");
  });

  it("an edit user gets the toggle, with edit mode off on first render", () => {
    const html = screen(report, true);
    expect(html).toContain('data-can-edit="true"');
    expect(html).toContain('data-editing="false"');
    expect(count(html, "data-hd-tt-edit-toggle")).toBe(1);
    expect(html).toContain("Nhập H / S / X / Z");
    expect(html).not.toContain("<input");
  });
});

describe("HĐ-TT table, edit mode", () => {
  const report = buildHdTtReport(fixture());
  const html = table(report, NOOP_EDIT);

  it("shows four inputs per linked row and none on the row without a link", () => {
    expect(count(html, "<input")).toBe(16);
    for (const [supplierId, linkId] of [[1, 201], [2, 202], [3, 203], [4, 204]]) {
      const row = rowOf(html, supplierId);
      expect(count(row, "<input")).toBe(4);
      for (const field of ["H", "S", "X", "Z"]) expect(row).toContain(`data-edit-cell="${linkId}:${field}"`);
    }
    const unlinked = rowOf(html, 5);
    expect(count(unlinked, "<input")).toBe(0);
    expect(unlinked).toContain(`href="/du-an/4/dt-hd-tt/dau-moi#ncc"`);
    expect(unlinked).toContain("Thêm dòng NCC ở Đầu mối");
  });

  it("disables S with its reason where canTypeSplit is false, and leaves it open on the later NCC of a settled đầu mối", () => {
    const sOf = (supplierId: number, linkId: number) => {
      const row = rowOf(html, supplierId);
      const at = row.lastIndexOf("<input", row.indexOf(`data-edit-cell="${linkId}:S"`));
      return row.slice(at, row.indexOf(">", at));
    };
    expect(sOf(1, 201)).toContain('disabled=""');
    expect(sOf(1, 201)).toContain('title="Đầu mối chỉ có một NCC"');
    expect(sOf(3, 203)).toContain('title="NCC đầu tiên nhận phần còn lại — nhập S ở NCC sau"');
    expect(sOf(4, 204)).not.toContain("disabled");
    expect(sOf(4, 204)).not.toContain("title=");
  });

  it("shows stored values in the inputs as plain digits, and adds the H and S input columns", () => {
    expect(rowOf(html, 2)).toContain('value="50000000"');
    expect(rowOf(html, 2)).toContain('value="Lấy thêm HĐ"');
    expect(rowOf(html, 3)).toContain('value="1000000"');
    expect(html).toContain('data-edit-col="H"');
    expect(html).toContain('data-edit-col="S"');
    expect(count(html, "data-money-col=")).toBe(13);
  });
});

describe("HĐ-TT table, columns and sticky axes", () => {
  const report = buildHdTtReport(fixture());
  const html = table(report, null);

  it("has the 13 money headers under four groups, with the file's letter as a code and the formula as a tooltip", () => {
    expect(count(html, "data-money-col=")).toBe(13);
    expect(count(html, "data-col-group=")).toBe(4);
    expect(html).not.toContain("data-edit-col");
    expect(html).toContain('title="J = max(0, E − I)" data-money-col="toPay"');
    expect(text(html)).toContain("HĐ gồm VAT · E");
    expect(text(html)).toContain("Còn phải lấy về · Y");
  });

  it("makes the header, the NCC column and the total row sticky inside one bounded box", () => {
    expect(count(html, "data-hd-tt-box")).toBe(1);
    expect(html).toMatch(/<div class="[^"]*max-h-\[70vh\][^"]*overflow-auto[^"]*" data-hd-tt-box="">/);
    expect(html).toMatch(/<thead class="sticky top-0 z-20" data-hd-tt-head="">/);
    expect(html).toMatch(/<th [^>]*class="[^"]*sticky left-0 z-40[^"]*"[^>]*>Nhà cung cấp<\/th>/);
    expect(count(html, "data-ncc-cell=")).toBe(5);
    expect(html).toMatch(/<td class="[^"]*sticky left-0 z-10 bg-card" data-ncc-cell="">/);
    expect(html).toMatch(/<tfoot class="sticky bottom-0 z-20 bg-muted font-semibold" data-hd-tt-total="">/);
    expect(html).toContain('<div class="line-clamp-2 w-48 whitespace-normal break-words" title="Chương Dương" data-ncc-name="">Chương Dương</div>');
  });

  it("groups rows under their đầu mối, unlinked suppliers last", () => {
    expect([...html.matchAll(/data-hd-tt-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["11", "12", "13", "none"]);
    expect(html.indexOf('data-hd-tt-row="3"')).toBeLessThan(html.indexOf('data-hd-tt-row="4"'));
  });

  it("links E to the supplier's invoices and G to its payments", () => {
    const daiNgan = rowOf(html, 1);
    expect(daiNgan).toContain(`href="${attr("/du-an/4/dt-hd-tt/hoa-don?filter.supplierId=1")}"`);
    expect(daiNgan).toContain(`href="${attr("/du-an/4/dt-hd-tt/chi-thuc-te?filter.supplierId=1")}"`);
    expect(text(daiNgan)).toContain("15.660.000");
    // Chương Dương chưa trả gì: không có link sổ chi trên ô trống.
    expect(rowOf(html, 4)).not.toContain("chi-thuc-te");
  });

  it("turns the (H), (tạm = HĐ) and (tách) markers into badges", () => {
    expect(text(rowOf(html, 2))).toContain("50.000.000H");
    const inp = fixture();
    inp.counterparties = inp.counterparties.map((c) => (c.id === 11 ? { ...c, actualBasis: "manual" as const } : c));
    inp.counterpartySuppliers = inp.counterpartySuppliers.map((l) => (l.id === 204 ? { ...l, splitActualVnd: 500_000 } : l));
    const marked = table(buildHdTtReport(inp), null);
    expect(text(rowOf(marked, 1))).toContain("15.660.000tạm = HĐ");
    expect(text(rowOf(marked, 4))).toContain("500.000tách");
    expect(marked).not.toContain("(tạm = HĐ)");
  });
});

describe("HĐ-TT screen, loc filter and the total row", () => {
  const report = buildHdTtReport(fixture());

  it("loc keeps only the matching rows while the total row stays the whole table's", () => {
    const html = screen(report, false, { loc: "co-viec" });
    expect(html).toContain('data-hd-tt-state="{&quot;loc&quot;:&quot;co-viec&quot;}"');
    expect(html).toContain('data-visible-rows="1"');
    expect(count(html, "data-hd-tt-row=")).toBe(1);
    expect(html).toContain('data-active-filter="1/5"');
    const total = html.slice(html.indexOf("data-hd-tt-total"));
    expect(text(total)).toContain("Tổng cộng (cả bảng)");
    expect(text(total)).toContain("93.420.000");
    const chip = html.slice(html.indexOf('data-loc-chip="co-viec"'));
    expect(chip.slice(0, chip.indexOf("</button>"))).toContain('aria-pressed="true"');
  });

  it("without a filter the total row reads TỔNG CỘNG and every chip shows its count", () => {
    const html = screen(report, false);
    expect(text(html.slice(html.indexOf("data-hd-tt-total")))).toContain("TỔNG CỘNG");
    expect(html).not.toContain("Tổng cộng (cả bảng)");
    expect(html).toContain('data-loc-chip="con-phai-lay-hd" data-count="2"');
    expect(html).toContain('data-loc-chip="con-phai-lay-ve" data-count="1"');
    expect(html).toContain('data-loc-chip="co-viec" data-count="1"');
  });
});

describe("HĐ-TT screen, Σ T check line", () => {
  it("names the row whose stored S breaks Σ T and links it to the Đầu mối grid", () => {
    const inp = fixture();
    inp.counterpartySuppliers = inp.counterpartySuppliers.map((l) => (l.id === 203 ? { ...l, splitActualVnd: 2_000_000 } : l));
    const html = screen(buildHdTtReport(inp), false);
    const checks = html.slice(html.indexOf("data-hd-tt-checks"));
    expect(checks).toContain('data-split-blockers="1"');
    expect(text(checks)).toContain("do S ở dòng Sobek");
    expect(checks).toContain(`href="${attr("/du-an/4/dt-hd-tt/dau-moi?filter.supplierName=Sobek#ncc")}"`);
    expect(text(checks)).toContain("Lệch đối soát");
  });

  it("says nothing about S while the checks hold", () => {
    const html = screen(buildHdTtReport(fixture()), false);
    expect(html).not.toContain("data-split-blockers");
    expect(text(html)).toContain("Kiểm tổng khớp — Σ E = sổ Hóa Đơn gồm VAT: 93.420.000");
  });
});
