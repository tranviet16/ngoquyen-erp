/**
 * Markup của trang Tổng quan (renderToStaticMarkup, không cần DOM): đủ chín thẻ số có hook
 * `data-figure` / `data-value` và nhãn cơ sở VAT, việc bằng 0 không có dòng, link mang bộ lọc chỉ khi màn
 * đích sẵn sàng, kiểm tổng một dòng "n/n khớp" trong `<details>`, lối tắt ba báo cáo không tự in, không
 * emoji. Kèm các mảnh màn hình mới của report-bits và `StatCard` tách khỏi Dashboard (markup giữ nguyên).
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActiveFilterLine, CollapsibleSection, FilterChip } from "@/components/du-an/dt-hd-tt/report-bits";
import { TongQuanView } from "@/components/du-an/dt-hd-tt/tong-quan-view";
import { StatCard } from "@/components/du-an/stat-card";
import { buildOverview, FIGURE_IDS, OVER_BUDGET_SHOWN, type Overview } from "@/lib/du-an/dt-hd-tt/overview";
import { linkHref } from "@/lib/du-an/dt-hd-tt/overview-todos";
import { buildReports } from "@/lib/du-an/dt-hd-tt/reports";
import type { ReportInputs } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { READY_TARGETS, screenPath } from "@/lib/du-an/dt-hd-tt/screen-links";
import { boardOf, linksOf, overBudgetInputs, todoScenario } from "@/lib/du-an/dt-hd-tt/__tests__/overview-fixture";
import { fixture } from "@/lib/du-an/dt-hd-tt/__tests__/report-fixture";

const overviewOf = (inp: ReportInputs): Overview => buildOverview(buildReports(inp), boardOf(inp), linksOf(inp));
const render = (o: Overview) => renderToStaticMarkup(createElement(TongQuanView, { projectId: 4, projectLabel: "CT01 — Mầm Non", overview: o }));
/** `&` trong href được escape thành `&amp;` trong markup. */
const attr = (s: string) => s.replace(/&/g, "&amp;");
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("Tổng quan markup", () => {
  it("renders the nine figures with data-figure, a rounded data-value and a VAT-basis line", () => {
    const o = overviewOf(fixture());
    const html = render(o);
    expect(html).toContain('data-tong-quan="4"');
    for (const id of FIGURE_IDS) {
      const value = o.figures[id].value;
      expect(html, id).toContain(`data-figure="${id}" data-value="${value === null ? "" : Math.round(value)}"`);
      const card = html.slice(html.indexOf(`data-figure="${id}"`), html.indexOf("</a>", html.indexOf(`data-figure="${id}"`)));
      expect(card, id).toMatch(id.startsWith("gxd") ? /sau thuế/ : /gồm VAT/);
      expect(card, id).toContain(`href="${attr(linkHref(4, o.figures[id].link))}"`);
    }
    expect(count(html, "data-figure=")).toBe(FIGURE_IDS.length);
  });

  it("lists exactly the due to-dos, each with its count hook and filtered link", () => {
    const { inp } = todoScenario();
    const o = overviewOf(inp);
    const html = render(o);
    expect(count(html, "data-todo=")).toBe(o.todos.length);
    for (const t of o.todos) {
      const at = html.indexOf(`data-todo="${t.id}"`);
      expect(at, t.id).toBeGreaterThan(-1);
      const li = html.slice(at, html.indexOf("</li>", at));
      if (t.count !== null) expect(li, t.id).toContain(`data-todo-count="${t.count}"`);
      else expect(li, t.id).not.toContain("data-todo-count");
      const href = linkHref(4, t.link);
      expect(li, t.id).toContain(`href="${attr(href)}"`);
      if (!READY_TARGETS.includes(t.link.target)) expect(href, t.id).toBe(screenPath(4, t.link.target));
    }
  });

  it("has no row for a to-do whose count is zero, and says so when nothing is left", () => {
    const o = overviewOf(fixture());
    const html = render(o);
    expect(html).not.toContain('data-todo="chua-gan-dt"');
    expect(html).not.toContain('data-todo="chua-cai-dat"');
    const empty = render({ ...o, todos: [] });
    expect(empty).not.toContain("data-todo=");
    expect(empty).toContain("Không còn việc nào cần làm.");
  });

  it("shows five over-budget rows and the rest, up to ten, behind Xem thêm", () => {
    const o = overviewOf(overBudgetInputs());
    const html = render(o);
    expect(count(html, "data-over-budget=")).toBe(o.overBudget.rows.length);
    expect(o.overBudget.rows.length).toBe(10);
    const details = html.indexOf(`Xem thêm ${o.overBudget.rows.length - OVER_BUDGET_SHOWN} đầu mối`);
    expect(details).toBeGreaterThan(-1);
    expect(count(html.slice(0, details), "data-over-budget=")).toBe(OVER_BUDGET_SHOWN);
    expect(html).toContain(`${o.overBudget.count} đầu mối vượt`);
    expect(html).toContain(`href="${screenPath(4, "dt-tt")}${READY_TARGETS.includes("dt-tt") ? "#phan-ii" : ""}"`);
  });

  it("links the chưa chốt count to the Đầu mối filter", () => {
    const inp = fixture();
    inp.counterparties = inp.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c));
    const html = render(overviewOf(inp));
    const tag = html.match(/<a [^>]*data-unsettled="1"[^>]*>/)?.[0] ?? "";
    expect(tag).toContain('href="/du-an/4/dt-hd-tt/dau-moi?filter.actual=chua-chot"');
    expect(html).toContain("1 đầu mối chưa chốt thực tế");
  });

  it("puts Kiểm tổng on one n/n khớp line inside <details>, with Δ and a fix link for a failing check", () => {
    const o = overviewOf(fixture());
    const okHtml = render(o);
    const total = o.checks.length;
    const ok = o.checks.filter((c) => c.check.ok).length;
    const section = okHtml.slice(okHtml.indexOf('data-section="kiem-tong"'));
    expect(section).toMatch(/^[^>]*><details[^>]*><summary/);
    const summary = section.slice(section.indexOf("<summary"), section.indexOf("</summary>"));
    expect(summary.replace(/<[^>]+>/g, "")).toContain(`Kiểm tổng: ${ok}/${total} khớp`);

    const broken: Overview = {
      ...o,
      checks: o.checks.map((c, i) => (i === 0 ? { ...c, check: { ...c.check, actual: c.check.expected + 1_500, ok: false } } : c)),
    };
    const html = render(broken);
    const failing = html.slice(html.indexOf("data-check-failing="));
    expect(failing).toContain("lệch <span class=\"tabular-nums\">1.500</span>");
    expect(failing).toContain(`href="${attr(linkHref(4, broken.checks[0].fix))}"`);
    expect(html).toContain("1 dòng lệch");
  });

  it("offers Mở and Xuất Excel for the three reports and never auto-prints", () => {
    const html = render(overviewOf(fixture()));
    for (const report of ["dt-hd", "dt-tt", "hd-tt"] as const) {
      expect(html).toContain(`href="${screenPath(4, report)}"`);
      expect(html).toContain(`href="/api/du-an/4/dt-hd-tt/export?report=${report}"`);
    }
    expect(html).not.toMatch(/[?&]in=1/);
    expect(html).not.toContain("window.print");
  });

  it("uses no emoji or check-mark glyphs", () => {
    const o = overviewOf(todoScenario().inp);
    const html = render({ ...o, checks: o.checks.map((c, i) => (i === 0 ? { ...c, check: { ...c.check, ok: false } } : c)) });
    expect(html).not.toMatch(/[✅❌✓✔✗✘]|\p{Extended_Pictographic}/u);
  });
});

describe("shared screen pieces", () => {
  it("StatCard keeps the Dashboard markup", () => {
    expect(renderToStaticMarkup(createElement(StatCard, { label: "Dự toán gốc", value: "1.000", sub: "Tổng dự toán" }))).toBe(
      '<div class="rounded-lg border bg-card p-4 shadow-sm space-y-1 border-border">'
        + '<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Dự toán gốc</p>'
        + '<p class="text-2xl font-bold tabular-nums">1.000</p>'
        + '<p class="text-xs text-muted-foreground">Tổng dự toán</p></div>',
    );
    expect(renderToStaticMarkup(createElement(StatCard, { label: "Trễ hạn", value: "2", tone: "danger" }))).toBe(
      '<div class="rounded-lg border bg-card p-4 shadow-sm space-y-1 border-red-300 dark:border-red-500/40">'
        + '<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Trễ hạn</p>'
        + '<p class="text-2xl font-bold tabular-nums">2</p></div>',
    );
  });

  it("FilterChip is a link with an href and a pressed button without one", () => {
    const link = renderToStaticMarkup(createElement(FilterChip, { label: "Vượt", count: 6, active: true, href: "/x?loc=vuot" }));
    expect(link).toMatch(/^<a [^>]*href="\/x\?loc=vuot"/);
    expect(link).toContain('aria-current="true"');
    expect(link).toContain(">6</span>");
    const button = renderToStaticMarkup(createElement(FilterChip, { label: "Còn thiếu" }));
    expect(button).toMatch(/^<button type="button" aria-pressed="false"/);
  });

  it("ActiveFilterLine shows 'đang lọc: hiện n / m dòng' only while filtering", () => {
    expect(renderToStaticMarkup(createElement(ActiveFilterLine, { active: false, shown: 3, total: 10 }))).toBe("");
    const html = renderToStaticMarkup(createElement(ActiveFilterLine, { active: true, shown: 3, total: 10, clearHref: "/x" }));
    expect(html).toContain('data-active-filter="3/10"');
    expect(html.replace(/<[^>]+>/g, "")).toBe("Đang lọc: hiện 3 / 10 dòng · Bỏ lọc");
  });

  it("CollapsibleSection is a native <details> with its open state", () => {
    type Props = Parameters<typeof CollapsibleSection>[0];
    const section = (props: Omit<Props, "children">, child: string) => renderToStaticMarkup(createElement(CollapsibleSection, props as Props, child));
    const closed = section({ id: "dm-1", title: "Đại Ngàn", summary: "3 nhóm" }, "nội dung");
    expect(closed).toMatch(/^<details id="dm-1" class="group scroll-mt-4 ">/);
    expect(closed).toContain("<summary");
    expect(closed).toContain("nội dung");
    expect(section({ title: "x", open: true }, "y")).toMatch(/^<details open=""/);
  });
});
