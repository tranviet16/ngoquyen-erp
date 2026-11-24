/**
 * Lưới an toàn cho bản in và file Excel của ba báo cáo "Đối chiếu DT-HĐ-TT".
 *
 * Nút "In" in chính DOM đang xem (window.print), nên markup của DtHdView / DtTtView / HdTtView chính là
 * bản in A4. Các màn hình mới được dựng thành component riêng; ba view này phải giữ nguyên từng byte.
 * File snapshot đi kèm được tạo một lần và không bao giờ cập nhật bằng `-u`: snapshot đổi nghĩa là bản in
 * hoặc Excel đã đổi.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DtHdView } from "@/components/du-an/dt-hd-tt/dt-hd-view";
import { DtTtView } from "@/components/du-an/dt-hd-tt/dt-tt-view";
import { HdTtView } from "@/components/du-an/dt-hd-tt/hd-tt-view";
import { buildReports } from "@/lib/du-an/dt-hd-tt/reports";
import { buildSheet, type ExportReport } from "@/lib/du-an/dt-hd-tt/export-sheets";
import { DEFAULT_RATES, type ReportInputs } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { fixture, K } from "@/lib/du-an/dt-hd-tt/__tests__/report-fixture";

/**
 * Công trình mẫu đầy đủ: Phần B đã có một dòng chưa gán (Sơn, không có alias) và một dòng Ngoài DT
 * (Sơn lót), cùng một NCC chưa gắn đầu mối.
 */
const base = (): ReportInputs => fixture();

/** Chưa lưu Cài đặt (tỷ lệ mặc định) và đầu mối Sobek chưa chốt thực tế (số chốt tay để trống). */
function settingsMissingAndUnsettled(): ReportInputs {
  const inp = fixture();
  inp.settings = { ...DEFAULT_RATES, missing: true };
  inp.counterparties = inp.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c));
  return inp;
}

/**
 * Alias HĐ của "Máy đào" trỏ tới một dòng DT không còn (đã đổi tên / xóa) và không có Mã nhóm: báo cáo
 * coi dòng HĐ đó là chưa gán và đưa xuống Phần B.
 */
function staleDtKeyAlias(): ReportInputs {
  const inp = fixture();
  inp.aliases = inp.aliases.map((a) => (a.source === "hd" && a.dtKey === K.may ? { ...a, dtKey: "dong-dt-khong-con|ca|MTC" } : a));
  return inp;
}

const VARIANTS: [string, () => ReportInputs][] = [
  ["base", base],
  ["settings missing, counterparty unsettled", settingsMissingAndUnsettled],
  ["HĐ alias with a stale DT key", staleDtKeyAlias],
];

const REPORTS: ExportReport[] = ["dt-hd", "dt-tt", "hd-tt"];

describe("DT-HĐ-TT print views stay byte-identical", () => {
  it.each(VARIANTS)("DtHdView — %s", (_name, make) => {
    const r = buildReports(make());
    expect(renderToStaticMarkup(createElement(DtHdView, { report: r.dtHd }))).toMatchSnapshot();
  });

  it.each(VARIANTS)("DtTtView — %s", (_name, make) => {
    const r = buildReports(make());
    expect(renderToStaticMarkup(createElement(DtTtView, { report: r.dtTt, phanIII: r.phanIII }))).toMatchSnapshot();
  });

  it.each(VARIANTS)("HdTtView — %s", (_name, make) => {
    const r = buildReports(make());
    expect(renderToStaticMarkup(createElement(HdTtView, { report: r.hdTt }))).toMatchSnapshot();
  });
});

describe("DT-HĐ-TT Excel sheets stay identical", () => {
  for (const report of REPORTS) {
    it.each(VARIANTS)(`${report} — %s`, (_name, make) => {
      const spec = buildSheet(report, buildReports(make()), "CT01 — Mầm Non", "17/11/2026");
      expect(spec).toMatchSnapshot();
    });
  }
});

describe("fixture variants exercise what they claim", () => {
  it("the base fixture has both a chưa gán and a Ngoài DT line in Phần B", () => {
    const partB = buildReports(base()).dtHd.partB.flatMap((s) => s.lines.map((l) => l.itemName));
    expect(partB).toEqual(expect.arrayContaining(["Sơn", "Sơn lót"]));
  });

  it("the stale-key variant moves the Máy đào invoice line into Phần B", () => {
    const partB = buildReports(staleDtKeyAlias()).dtHd.partB.flatMap((s) => s.lines.map((l) => l.itemName));
    expect(partB).toContain("Máy đào");
    const basePartB = buildReports(base()).dtHd.partB.flatMap((s) => s.lines.map((l) => l.itemName));
    expect(basePartB).not.toContain("Máy đào");
  });

  it("the unsettled variant really has a chưa chốt counterparty and default rates", () => {
    const r = buildReports(settingsMissingAndUnsettled());
    expect(r.settings.missing).toBe(true);
    expect(r.dtTt.phanII.a.some((row) => row.actual === null)).toBe(true);
  });
});
