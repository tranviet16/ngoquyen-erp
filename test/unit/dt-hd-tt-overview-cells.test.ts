/**
 * Tiêu chí 2 — số trên Tổng quan nằm đúng trong ô của bản in: dựng TongQuanView và các view báo cáo
 * KHÔNG SỬA (DtTtView, HdTtView) bằng renderToStaticMarkup rồi so chữ:
 *   - ba số Gxd ↔ dòng "CHI PHÍ XÂY DỰNG SAU THUẾ (Gxd)" của Phần III;
 *   - sáu số Σ ↔ dòng TỔNG CỘNG của HĐ-TT, đúng cột theo `HD_TT_MONEY_COLS`;
 *   - mỗi đầu mối vượt ↔ dòng của nó ở Phần II (dự toán gồm VAT, thực tế, chênh).
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DtTtView } from "@/components/du-an/dt-hd-tt/dt-tt-view";
import { HdTtView } from "@/components/du-an/dt-hd-tt/hd-tt-view";
import { moneyOrZero } from "@/components/du-an/dt-hd-tt/report-bits";
import { TongQuanView } from "@/components/du-an/dt-hd-tt/tong-quan-view";
import { HD_TT_MONEY_COLS } from "@/lib/du-an/dt-hd-tt/export-sheet-hd-tt";
import { buildOverview, type FigureId } from "@/lib/du-an/dt-hd-tt/overview";
import { buildReports } from "@/lib/du-an/dt-hd-tt/reports";
import type { ReportInputs } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { boardOf, linksOf, overBudgetInputs, todoScenario } from "@/lib/du-an/dt-hd-tt/__tests__/overview-fixture";
import { fixture } from "@/lib/du-an/dt-hd-tt/__tests__/report-fixture";

/** Chữ của các ô `<td>` trong dòng `<tr>` chứa `marker`. */
function rowCells(html: string, marker: string): string[] {
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`không thấy dòng ${marker}`);
  const row = html.slice(html.lastIndexOf("<tr", at), html.indexOf("</tr>", at));
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
}

/** Số đang hiện trên thẻ `data-figure` của Tổng quan. */
function figureText(html: string, id: FigureId): string {
  const m = html.match(new RegExp(`data-figure="${id}"[^>]*>[\\s\\S]*?<p class="text-2xl font-bold tabular-nums">([^<]*)</p>`));
  if (!m) throw new Error(`không thấy thẻ ${id}`);
  return m[1];
}

/** Ô `data-cell` của dòng đầu mối vượt trên Tổng quan. */
function overBudgetCell(html: string, counterpartyId: number, cell: string): string {
  const at = html.indexOf(`data-over-budget="${counterpartyId}"`);
  const row = html.slice(at, html.indexOf("</tr>", at));
  const m = row.match(new RegExp(`data-cell="${cell}"[^>]*>([^<]*)<`));
  if (!m) throw new Error(`không thấy ô ${cell} của ${counterpartyId}`);
  return m[1];
}

const SIGMA_COLUMN: Record<Exclude<FigureId, `gxd-${string}`>, (typeof HD_TT_MONEY_COLS)[number]["key"]> = {
  "sigma-e": "invoiceTotal",
  "sigma-t": "actual",
  "sigma-u": "actualMinusInvoice",
  "sigma-i": "paid",
  "sigma-v": "debt",
  "sigma-y": "stillToRecover",
};

const VARIANTS: [string, () => ReportInputs][] = [
  ["base", fixture],
  ["many over budget", overBudgetInputs],
  ["every to-do due", () => todoScenario().inp],
];

describe("Tổng quan figures appear in the matching cells of the untouched print views", () => {
  it.each(VARIANTS)("%s", (_name, make) => {
    const inp = make();
    const r = buildReports(inp);
    const o = buildOverview(r, boardOf(inp), linksOf(inp));
    const tq = renderToStaticMarkup(createElement(TongQuanView, { projectId: 4, projectLabel: "CT01 — Mầm Non", overview: o }));
    const dtTt = renderToStaticMarkup(createElement(DtTtView, { report: r.dtTt, phanIII: r.phanIII }));
    const hdTt = renderToStaticMarkup(createElement(HdTtView, { report: r.hdTt }));

    // Phần III, dòng Gxd: [nhãn, tỷ lệ, dự toán, thực tế, chênh].
    const gxd = rowCells(dtTt, ">CHI PHÍ XÂY DỰNG SAU THUẾ (Gxd)</td>");
    expect(figureText(tq, "gxd-estimate")).toBe(gxd[2]);
    expect(figureText(tq, "gxd-actual")).toBe(gxd[3]);
    expect(figureText(tq, "gxd-diff")).toBe(gxd[4]);
    expect(gxd[2]).toBe(moneyOrZero(o.figures["gxd-estimate"].value));

    // HĐ-TT, dòng TỔNG CỘNG: [TỔNG CỘNG, 13 cột tiền theo HD_TT_MONEY_COLS, I / E, việc].
    const totals = rowCells(hdTt, ">TỔNG CỘNG</td>");
    for (const [id, key] of Object.entries(SIGMA_COLUMN) as [FigureId, string][]) {
      const cell = totals[1 + HD_TT_MONEY_COLS.findIndex((c) => c.key === key)];
      expect(figureText(tq, id), id).toBe(cell);
      expect(cell, id).toBe(moneyOrZero(o.figures[id].value));
    }

    // Mỗi đầu mối vượt: [tên, DT chưa VAT, DT gồm VAT, thực tế, chênh] ở Phần II.
    for (const row of o.overBudget.rows) {
      const cells = rowCells(dtTt, `>${row.name}</td>`);
      expect(overBudgetCell(tq, row.counterpartyId, "dtInclVat"), row.name).toBe(cells[2]);
      expect(overBudgetCell(tq, row.counterpartyId, "actual"), row.name).toBe(cells[3]);
      expect(overBudgetCell(tq, row.counterpartyId, "diff"), row.name).toBe(cells[4]);
    }
  });

  it("the many-over-budget variant really lists Phần II rows", () => {
    const inp = overBudgetInputs();
    expect(buildOverview(buildReports(inp), boardOf(inp), linksOf(inp)).overBudget.rows.length).toBeGreaterThan(5);
  });
});
