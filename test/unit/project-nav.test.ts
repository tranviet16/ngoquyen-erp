import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectNavView } from "@/components/du-an/project-nav";
import { PROJECT_NAV_GROUPS, resolveProjectNav, tabHref } from "@/lib/du-an/project-nav";

const BASE = "/du-an/4";
/** 14 trang cũ của công trình (Dashboard là index). URL không được đổi. */
const OLD_HREFS = [
  "", "/tien-do", "/nghiem-thu", "/du-toan", "/du-toan-dieu-chinh", "/phat-sinh", "/dinh-muc", "/giao-dich",
  "/can-doi-vat-tu", "/dt-hd-tt", "/hop-dong", "/dong-tien-3-ben", "/cong-no", "/cai-dat",
].map((h) => `${BASE}${h}`);
const SEGMENTS: (string | null)[] = [null, ...OLD_HREFS.slice(1).map((h) => h.slice(BASE.length + 1))];

const render = (segment: string | null, bookNote?: string) =>
  renderToStaticMarkup(createElement(ProjectNavView, { basePath: BASE, segment, bookNote }));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("project nav model", () => {
  it("has 7 groups and lists every old tab href exactly once", () => {
    expect(PROJECT_NAV_GROUPS).toHaveLength(7);
    const hrefs = PROJECT_NAV_GROUPS.flatMap((g) => g.tabs.map((t) => tabHref(BASE, t)));
    expect([...hrefs].sort()).toEqual([...OLD_HREFS].sort());
  });

  it.each(SEGMENTS)("segment %s resolves to exactly one group and its own tab", (segment) => {
    const { group, tab } = resolveProjectNav(segment);
    expect(group).not.toBeNull();
    expect(tab?.segment).toBe(segment);
    expect(PROJECT_NAV_GROUPS.filter((g) => g.tabs.some((t) => t.segment === segment))).toHaveLength(1);
  });
});

describe("ProjectNavView markup", () => {
  it.each(SEGMENTS)("segment %s: one active group, at most one active tab, no horizontal scroll", (segment) => {
    const html = render(segment);
    expect(count(html, 'aria-current="true"')).toBe(1);
    expect(count(html, 'aria-current="page"')).toBeLessThanOrEqual(1);
    expect(html).not.toContain("overflow-x-auto");
    expect(html).toContain('data-nav-row="groups"');
  });

  it("Cài đặt keeps an empty tab row so the bar height does not jump", () => {
    const html = render("cai-dat");
    const row = html.slice(html.indexOf('data-nav-row="tabs"'));
    expect(row).not.toContain("<a ");
  });

  it("Đối chiếu DT-HĐ-TT leaves row 2 to its own sub-nav", () => {
    expect(render("dt-hd-tt")).not.toContain('data-nav-row="tabs"');
  });

  it("shows the book note only inside the Vật tư & công nợ group", () => {
    expect(render("giao-dich", "GHI-CHU-SO")).toContain("GHI-CHU-SO");
    expect(render("du-toan", "GHI-CHU-SO")).not.toContain("GHI-CHU-SO");
  });

  it("group links go to the first tab of the group", () => {
    const html = render(null);
    expect(html).toContain(`href="${BASE}/giao-dich"`);
    expect(html).toContain(`href="${BASE}/tien-do"`);
  });
});
