/**
 * Khi nào S (thực tế riêng NCC) giữ được kiểm Σ T của HĐ-TT — lý do của quy tắc `canTypeSplit`:
 *   - S đè mọi quy tắc chia (hd-tt-report.ts), NCC đầu của đầu mối nhiều NCC nhận phần còn lại, đầu mối một NCC
 *     lấy thực tế đầu mối, đầu mối chưa chốt → T tạm = E, NCC không thuộc đầu mối → T = 0;
 *   - nên S chỉ an toàn ở NCC SAU của đầu mối nhiều NCC đã chốt thực tế; ở mọi chỗ khác Σ T ✗, và
 *     `splitBlockers` chỉ đúng dòng đó để dòng kiểm của màn hình nêu tên.
 * Công trình mẫu: đầu mối 13 (chốt tay) gộp NCC 3 (đầu) và NCC 4 (sau); đầu mối 11 chỉ có NCC 1; NCC 5 chưa gắn.
 */

import { describe, expect, it } from "vitest";
import { buildHdTtReport, type HdTtReport } from "../hd-tt-report";
import { buildScreenRows, canTypeSplit, isActualCheck, splitBlock, splitBlockers } from "../hd-tt-screen-model";
import type { ReportInputs } from "../report-inputs";
import { fixture } from "./report-fixture";

const actualCheck = (r: HdTtReport) => r.checks.find(isActualCheck)!;
const blockerNames = (r: HdTtReport) => splitBlockers(buildScreenRows(r.rows)).map((x) => x.supplierName);

function withSplit(linkId: number, split: number, edit?: (inp: ReportInputs) => void): HdTtReport {
  const inp = fixture();
  inp.counterpartySuppliers = inp.counterpartySuppliers.map((l) => (l.id === linkId ? { ...l, splitActualVnd: split } : l));
  edit?.(inp);
  return buildHdTtReport(inp);
}

describe("S and the Σ T check", () => {
  it("the fixture's Σ T check is the second check and is ✓ with no S anywhere", () => {
    const r = buildHdTtReport(fixture());
    expect(r.checks.map(isActualCheck)).toEqual([false, true]);
    expect(actualCheck(r).ok).toBe(true);
    expect(blockerNames(r)).toEqual([]);
  });

  it("✓ S on a later NCC of a settled multi-NCC đầu mối: the first NCC takes the remainder", () => {
    const r = withSplit(204, 500_000);
    const row = (id: number) => r.rows.find((x) => x.supplierId === id)!;
    expect(row(4).actual).toBe(500_000);
    expect(row(3).actual).toBe(8_500_000);
    expect(actualCheck(r).ok).toBe(true);
    expect(canTypeSplit(buildScreenRows(r.rows).find((x) => x.supplierId === 4)!)).toBe(true);
    expect(blockerNames(r)).toEqual([]);
  });

  it("✗ S on a row without a đầu mối: T = S but no đầu mối actual expects it", () => {
    const r = withSplit(205, 1_000_000, (inp) => {
      inp.counterpartySuppliers.push({ id: 205, counterpartyId: null, supplierId: 5, splitActualVnd: 1_000_000, paidOverrideVnd: null, recoveredVnd: null, todoNote: null });
    });
    expect(r.rows.find((x) => x.supplierId === 5)!.actual).toBe(1_000_000);
    expect(actualCheck(r).ok).toBe(false);
    expect(blockerNames(r)).toEqual(["Máy Lộc Tài"]);
    expect(splitBlock(buildScreenRows(r.rows).find((x) => x.supplierId === 5)!)).toBe("no-counterparty");
  });

  it("✗ S on the first NCC: it no longer takes the remainder, so the đầu mối actual is not met", () => {
    const r = withSplit(203, 2_000_000);
    expect(r.rows.find((x) => x.supplierId === 3)!.actual).toBe(2_000_000);
    expect(actualCheck(r).ok).toBe(false);
    expect(blockerNames(r)).toEqual(["Sobek"]);
  });

  it("✗ S under an unsettled đầu mối: the check counts only the temporary T = E", () => {
    const r = withSplit(204, 500_000, (inp) => {
      inp.counterparties = inp.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c));
    });
    expect(r.rows.find((x) => x.supplierId === 3)).toMatchObject({ actualIsTemporary: true, actual: 2_160_000 });
    expect(actualCheck(r).ok).toBe(false);
    expect(blockerNames(r)).toEqual(["Chương Dương"]);
    expect(splitBlock(buildScreenRows(r.rows).find((x) => x.supplierId === 4)!)).toBe("unsettled");
  });

  it("✗ S on the only NCC of a đầu mối: T = S instead of the đầu mối actual", () => {
    const r = withSplit(201, 1_000_000);
    expect(actualCheck(r).ok).toBe(false);
    expect(blockerNames(r)).toEqual(["Đại Ngàn"]);
  });
});
