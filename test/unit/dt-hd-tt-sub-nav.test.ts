import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DT_HD_TT_SECTIONS, DtHdTtSubNavView, invoiceBookHref, subNavGroups } from "@/components/du-an/dt-hd-tt/dt-hd-tt-sub-nav";

const BASE = "/du-an/4/dt-hd-tt";
const render = (active: string | null, badge?: string) => renderToStaticMarkup(createElement(DtHdTtSubNavView, { basePath: BASE, active, badge }));

describe("DT-HĐ-TT sub-nav", () => {
  it("keeps all nine existing sections and shows the Tổng quan index entry, active on the index route", () => {
    expect(DT_HD_TT_SECTIONS.filter((s) => s.segment !== null).map((s) => s.segment)).toEqual([
      "dt-hd", "dt-tt", "hd-tt", "hoa-don", "thuc-te-nhap", "chi-thuc-te", "anh-xa", "dau-moi", "ma-nhom",
    ]);
    const index = DT_HD_TT_SECTIONS.find((s) => s.segment === null);
    expect(index).toMatchObject({ label: "Tổng quan", ready: true });
    const indexLink = (html: string) => html.split("<a ").find((a) => a.includes(`href="${BASE}"`)) ?? "";
    const html = render(null);
    expect(indexLink(html)).toContain(">Tổng quan</a>");
    expect(indexLink(html)).toContain('aria-current="page"');
    expect(html.split('aria-current="page"')).toHaveLength(2);
    expect(indexLink(render("dt-hd"))).not.toContain("aria-current");
  });

  it("groups the ready sections as Tổng quan · Báo cáo · Nhập sổ · Thiết lập", () => {
    expect(subNavGroups().map((g) => [g.group, g.sections.map((s) => s.label)])).toEqual([
      ["Tổng quan", ["Tổng quan"]],
      ["Báo cáo", ["DT-HĐ", "DT-TT", "HĐ-TT"]],
      ["Nhập sổ", ["Hóa đơn", "Thực tế nhập", "Chi thực tế"]],
      ["Thiết lập", ["Ánh xạ", "Đầu mối", "Mã nhóm"]],
    ]);
  });

  it("marks only the open section and carries the row hook", () => {
    const html = render("hoa-don");
    expect(html.split('aria-current="page"')).toHaveLength(2);
    expect(html).toContain('data-nav-row="dt-hd-tt"');
    expect(html).toContain(`href="${BASE}/hoa-don"`);
  });

  it("puts the chưa gán badge on Ánh xạ only", () => {
    const html = render("dt-hd", "BADGE-7");
    expect(html.split("BADGE-7")).toHaveLength(2);
    const anhXa = html.slice(html.indexOf(`href="${BASE}/anh-xa"`));
    expect(anhXa.slice(0, anhXa.indexOf("</a>"))).toContain("BADGE-7");
  });

  it("still sends invoice edits to the Hóa đơn book", () => {
    expect(invoiceBookHref(4)).toBe("/du-an/4/dt-hd-tt/hoa-don");
  });
});
