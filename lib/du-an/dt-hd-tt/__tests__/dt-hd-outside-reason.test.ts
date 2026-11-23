/**
 * Trường thêm `DtHdInvoiceRow.outsideReason`: dòng HĐ ở Phần B mang lý do "chua_gan" / "ngoai_dt", dòng
 * đã xếp vào dòng DT / nhóm mang null; lý do luôn khớp `effectiveAliasStatus` (định nghĩa "chưa gán" duy
 * nhất của Ánh xạ, huy hiệu và Tổng quan); số liệu báo cáo không đổi (cùng số golden test đang ghim).
 */

import { describe, expect, it } from "vitest";
import { effectiveAliasStatus } from "../alias-board";
import { buildDtHdReport, type DtHdReport } from "../dt-hd-report";
import { itemKeyOf } from "../keys";
import type { ReportInputs } from "../report-inputs";
import { fixture, K } from "./report-fixture";

/** Alias HĐ của "Máy đào" trỏ Dòng DT không còn, không có Mã nhóm → chưa gán, xuống Phần B. */
function staleKey(): ReportInputs {
  const inp = fixture();
  inp.aliases = inp.aliases.map((a) => (a.source === "hd" && a.dtKey === K.may ? { ...a, dtKey: "dong-dt-khong-con|ca|MTC" } : a));
  return inp;
}

/** "Sơn" có alias đề xuất nhưng chưa chọn Dòng DT / Mã nhóm → vẫn là chưa gán. */
function proposedWithoutTarget(): ReportInputs {
  const inp = fixture();
  inp.aliases = [
    ...inp.aliases,
    { source: "hd", itemKey: itemKeyOf("Sơn", "thùng"), groupCodeId: null, kind: null, dtKey: null, factor: null, status: "de_xuat" },
  ];
  return inp;
}

const VARIANTS: [string, () => ReportInputs][] = [
  ["base", fixture],
  ["stale DT key", staleKey],
  ["proposal without a target", proposedWithoutTarget],
];

const inLineRows = (r: DtHdReport) => r.blocks.flatMap((b) => b.groups.flatMap((g) => [...g.lines.flatMap((l) => l.invoices), ...g.groupOnly]));
const partBRows = (r: DtHdReport) => r.partB.flatMap((s) => s.lines);

describe("DtHdInvoiceRow.outsideReason", () => {
  it.each(VARIANTS)("%s: Phần B rows carry the reason effectiveAliasStatus gives, placed rows carry null", (_name, make) => {
    const inp = make();
    const r = buildDtHdReport(inp);
    const live = new Set(inp.dtLines.map((l) => l.key));
    const aliasOf = new Map(inp.aliases.filter((a) => a.source === "hd").map((a) => [a.itemKey, a]));
    const keyOf = new Map(inp.invoiceLines.map((l) => [l.id, l.itemKey]));

    expect(inLineRows(r).length).toBeGreaterThan(0);
    expect(inLineRows(r).every((i) => i.outsideReason === null)).toBe(true);
    expect(partBRows(r).length).toBeGreaterThan(0);
    for (const row of partBRows(r)) {
      const status = effectiveAliasStatus("hd", aliasOf.get(keyOf.get(row.invoiceLineId)!) ?? null, live);
      expect(["chua_gan", "ngoai_dt"], row.itemName).toContain(status);
      expect(row.outsideReason, row.itemName).toBe(status);
    }
    // Mọi dòng HĐ đều có đúng một chỗ: đã xếp hoặc Phần B.
    expect(inLineRows(r).length + partBRows(r).length).toBe(inp.invoiceLines.length);
  });

  it("base fixture: Sơn (no alias) is chưa gán, Sơn lót is Ngoài DT", () => {
    const reasons = Object.fromEntries(partBRows(buildDtHdReport(fixture())).map((i) => [i.itemName, i.outsideReason]));
    expect(reasons).toEqual({ "Sơn": "chua_gan", "Sơn lót": "ngoai_dt" });
  });

  it("an alias pointing at a DT line that no longer exists puts its line in Phần B as chưa gán", () => {
    const row = partBRows(buildDtHdReport(staleKey())).find((i) => i.itemName === "Máy đào");
    expect(row?.outsideReason).toBe("chua_gan");
  });

  it("leaves every figure the golden test pins unchanged", () => {
    const r = buildDtHdReport(fixture());
    expect(r.partBTotal).toBe(3_000_000);
    expect(r.grandCheck).toMatchObject({ expected: 86_500_000, actual: 86_500_000, ok: true });
    const block = (name: string) => r.blocks.find((b) => b.name === name)!;
    expect(block("Đại Ngàn")).toMatchObject({ invoiceTotal: 14_500_000, inOwnGroups: 13_500_000, crossAssigned: 1_000_000 });
    expect(block("Bê tông HP").groups[0].valueHd).toBe(66_000_000);
    expect(block("Sobek").outsideDt).toBe(3_000_000);
    expect(block("Chưa có đầu mối").invoiceTotal).toBe(4_000_000);
  });
});
