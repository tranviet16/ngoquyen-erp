/**
 * Màn DT-TT, chỉ markup render tĩnh lần đầu (renderToStaticMarkup, không DOM):
 *   - thanh nhảy dính "Phần I · II · III" trỏ tới ba neo có thật; mỗi dòng Phần II mang neo `#dm-{id}`;
 *   - nhóm Phần I đóng sẵn (chỉ dòng tổng nhóm), trừ nhóm có dòng lệch đối soát;
 *   - "chưa chốt", thực tế nhập chưa gắn đầu mối và dự toán chưa có loại là link tới màn sửa đã lọc;
 *   - chênh Phần III bằng `phanIIIDiff`, đúng ô bản in tính.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DtTtScreen } from "@/components/du-an/dt-hd-tt/dt-tt-screen";
import { moneyOrZero } from "@/components/du-an/dt-hd-tt/report-bits";
import { phanIIIDiff } from "@/lib/du-an/dt-hd-tt/overview";
import type { ReportInputs } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { buildReports } from "@/lib/du-an/dt-hd-tt/reports";
import { fixture } from "@/lib/du-an/dt-hd-tt/__tests__/report-fixture";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, "");

function render(inp: ReportInputs = fixture(), patch?: (r: ReturnType<typeof buildReports>) => void) {
  const reports = buildReports(inp);
  patch?.(reports);
  return { reports, html: renderToStaticMarkup(createElement(DtTtScreen, { projectId: 4, report: reports.dtTt, phanIII: reports.phanIII })) };
}

describe("DT-TT screen, navigation", () => {
  const { reports, html } = render();

  it("has a sticky jump bar to the three parts, whose anchors exist", () => {
    const jump = html.slice(html.indexOf("data-dt-tt-jump"), html.indexOf("</nav>"));
    expect(html).toMatch(/<nav [^>]*class="sticky top-0 z-30[^"]*"[^>]*data-dt-tt-jump="">/);
    expect([...jump.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])).toEqual(["phan-i", "phan-ii", "phan-iii"]);
    expect(text(jump)).toContain("Phần I·Phần II·Phần III");
    for (const id of ["phan-i", "phan-ii", "phan-iii"]) expect(count(html, `id="${id}"`)).toBe(1);
  });

  it("anchors every Phần II row at #dm-{id}", () => {
    const { a, b, c } = reports.dtTt.phanII;
    const ids = [...a, ...b, ...c].map((r) => r.counterpartyId);
    expect(ids).toEqual([11, 12, 13, 17, 14, 15, 16]);
    expect(html).toContain(`data-phan-ii-rows="${ids.length}"`);
    expect([...html.matchAll(/id="dm-(\d+)"/g)].map((m) => Number(m[1]))).toEqual(ids);
  });
});

describe("DT-TT screen, Phần I groups", () => {
  it("opens with every group collapsed to its total row", () => {
    const { reports, html } = render();
    expect(reports.dtTt.phanI.map((g) => g.code)).toEqual(["THEP", "BT"]);
    expect(count(html, 'data-dt-tt-group=')).toBe(2);
    expect(count(html, 'aria-expanded="false"')).toBe(2);
    expect(html).not.toContain("Thép tròn D10");
    expect(text(html)).toContain("THEP — Thép");
    expect(text(html)).toContain("Mở tất cả");
    expect(text(html)).toContain("Kiểm tổng khớp — do KL + do đơn giá = chênh ở cả 2 dòng");
  });

  it("opens the group whose row breaks its check, and shows the broken check", () => {
    const { html } = render(fixture(), (r) => {
      r.dtTt.checks = r.dtTt.checks.map((c) => (c.label.includes("Bê tông M300") ? { ...c, actual: c.expected + 1_000, ok: false } : c));
    });
    expect(html).toContain('data-dt-tt-group="102" data-open="true"');
    expect(html).toContain('data-dt-tt-group="101" data-open="false"');
    expect(html).toMatch(/pl-6">Bê tông M300<\/td>/);
    expect(html).not.toMatch(/pl-6">Thép tròn D10<\/td>/);
    expect(text(html)).toContain("Lệch đối soát");
  });
});

describe("DT-TT screen, warnings as links", () => {
  it("links an unsettled đầu mối to the chưa chốt filter of Đầu mối", () => {
    const inp = fixture();
    inp.counterparties = inp.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c));
    const { html } = render(inp);
    const row = html.slice(html.indexOf('id="dm-13"'), html.indexOf("</tr>", html.indexOf('id="dm-13"')));
    expect(row).toContain('href="/du-an/4/dt-hd-tt/dau-moi?filter.actual=chua-chot"');
    expect(text(row)).toContain("chưa chốt");
  });

  it("links untagged receipts to Thực tế nhập filtered on no đầu mối", () => {
    const { reports, html } = render();
    expect(reports.dtTt.untaggedReceipts).toBe(70_200_000);
    const warning = html.slice(html.indexOf('data-dt-tt-warning="untagged"'));
    expect(text(warning)).toContain("Thực tế nhập chưa gắn đầu mối: 70.200.000");
    expect(warning).toContain('href="/du-an/4/dt-hd-tt/thuc-te-nhap?filter.counterpartyId=none"');
  });

  it("links the no-kind estimate warning to Dự toán loai=thieu, and shows nothing when there is none", () => {
    const inp = fixture();
    inp.dtWithoutKindValue = 1_500_000;
    const { html } = render(inp);
    const warning = html.slice(html.indexOf('data-dt-tt-warning="kindless"'));
    expect(text(warning)).toContain("Có 1.500.000 dự toán chưa xác định loại VL / NC / MTC");
    expect(warning).toContain('href="/du-an/4/du-toan?loai=thieu"');
    expect(render().html).not.toContain('data-dt-tt-warning="kindless"');
  });
});

describe("DT-TT screen, Phần III", () => {
  it("computes chênh with phanIIIDiff and leaves it empty where thực tế is empty", () => {
    const { reports, html } = render();
    const part = html.slice(html.indexOf('id="phan-iii"'));
    const total = reports.phanIII.rows.find((r) => r.key === "total")!;
    expect(moneyOrZero(phanIIIDiff(total))).toBe("139.770.260");
    expect(text(part)).toContain(`CHI PHÍ XÂY DỰNG SAU THUẾ (Gxd)${moneyOrZero(total.estimate)}${moneyOrZero(total.actual)}${moneyOrZero(phanIIIDiff(total))}`);
    const mtc = reports.phanIII.rows.find((r) => r.key === "mtc")!;
    expect(phanIIIDiff(mtc)).toBeNull();
    // MTC không có thực tế: ô thực tế và ô chênh trống, dòng kế tiếp theo ngay sau số dự toán.
    expect(text(part)).toContain(`Chi phí máy thi công (MTC)${moneyOrZero(mtc.estimate)}CHI PHÍ TRỰC TIẾP`);
  });
});
