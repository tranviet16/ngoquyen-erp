/**
 * Chạy parser trên thư mục thật `Quản Lý Công Nợ/` (không có trong git): bỏ qua khi
 * thư mục không tồn tại. Số kỳ vọng đã đối chiếu với file bằng openpyxl ngày 06/11/2026.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseCutoverBundle } from "../cutover-bundle-parser";
import type { BundleFile, CutoverBundleParseResult } from "../types";

const ROOT = join(process.cwd(), "Quản Lý Công Nợ");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function loadBundle(): BundleFile[] {
  return walk(ROOT).map((p) => ({ path: relative(ROOT, p).split(sep).join("/"), buffer: readFileSync(p) }));
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe.skipIf(!existsSync(ROOT))("parser chuyển đổi trên thư mục thật", () => {
  let r: CutoverBundleParseResult;
  beforeAll(() => {
    r = parseCutoverBundle(loadBundle());
  });

  it("Nhập Liệu: 922 dòng (773 Lấy Hàng, 149 Trả Nợ), dừng trước dòng ma, năm lạ được sửa", () => {
    const nl = r.mainFile?.nhapLieu;
    expect(nl?.readRowCount).toBe(922);
    expect(nl?.lastDataRowNumber).toBe(926);
    const types = [...(nl?.rows ?? []), ...(nl?.skipped ?? [])].map((x) => x.rawType);
    expect(types.filter((t) => t === "Lấy Hàng")).toHaveLength(773);
    expect(types.filter((t) => t === "Trả Nợ")).toHaveLength(149);
    expect(nl?.skipped.map((s) => s.sourceKey)).toEqual(["NL#816", "NL#831", "NL#832"]);
    expect(nl?.rows.filter((x) => x.dateYearFixed).map((x) => `${x.sourceKey} ${iso(x.date)}`)).toEqual([
      "NL#5 2026-08-15",
      "NL#6 2026-08-26",
      "NL#7 2026-10-26",
    ]);
    expect(nl?.rows.filter((x) => x.transactionType === "thue_hd")).toHaveLength(2);
    expect(nl?.rows.filter((x) => x.afterCutover).map((x) => x.tt?.total)).toEqual([
      28_980_000, 2_800_000, 1_400_000, 7_290_000, 7_290_000, 20_275_200, 20_275_200, 1_800_000, 1_800_000, 3_600_000, 1_800_000,
    ]);
    expect(r.mainFile?.openingBalances).toHaveLength(73);
  });

  it("CSV: Nam Hương CDC tách theo J / P đúng số Số Dư", () => {
    const rows = r.csv?.rows ?? [];
    const tanLoc = rows.find((x) => x.supplierName.includes("Nam Hương") && x.projectName === "Tân lộc CDC");
    const dvp = rows.find((x) => x.supplierName.includes("Nam Hương") && x.projectName === "ĐVP -CDC");
    expect(tanLoc).toMatchObject({ lhTt: 1_039_650_000, paidTt: 930_313_300, debtTt: 109_336_700, lhHd: 1_380_713_400, paidHd: 1_380_713_400 });
    expect(dvp).toMatchObject({ debtTt: 44_600_000, debtHd: 27_734_400 });
    const cdc = r.mainFile?.openingBalances.find((o) => o.supplierName === "Nam Hương" && o.projectName === "CDC");
    expect((tanLoc?.debtTt ?? 0) + (dvp?.debtTt ?? 0)).toBe(cdc?.balanceTt);
    expect((tanLoc?.debtHd ?? 0) + (dvp?.debtHd ?? 0)).toBe(cdc?.balanceHd);
  });

  it("đọc được cả 23 file theo dõi (gói có 23 file, không phải 24); mọi ngày được giải, thành quyết định hoặc lỗi chặn có vị trí", () => {
    expect(r.trackingFiles).toHaveLength(23);
    expect(r.skipped.every((s) => s.path.startsWith(".claude/"))).toBe(true);
    for (const d of r.deliveries) {
      if (d.date) continue;
      expect(d.dateDecisionKey).toMatch(/^date:/);
      const known =
        r.dateDecisions.some((x) => x.key === d.dateDecisionKey) ||
        r.blockingErrors.some((e) => `date:${e.ref.file}:${e.ref.sheet}!${e.ref.cell}` === d.dateDecisionKey);
      expect(known).toBe(true);
    }
    expect(r.blockingErrors.every((e) => e.ref.file && e.ref.sheet && e.ref.cell)).toBe(true);
    expect(r.blockingErrors.map((e) => e.code).sort()).toEqual(["date-invalid", "date-missing"]);
    expect(r.dateDecisions.every((x) => x.reason === "straddles-cutover")).toBe(true);
  });

  it("neo khối 27/09→26/10 của Bê tông HP × Trại Chuối = 509.563.111, Quang Minh DCX khối mở = 159.360.000", () => {
    const bt = r.trackingFiles.find((t) => t.file.endsWith("Trại Chuối/Bê tông Hải Phòng.xlsx"));
    const btLast = bt?.blocks.find((b) => iso(b.range.from) === "2026-09-27");
    expect(btLast).toMatchObject({ totalDebt: 509_563_111, open: false });
    const qm = r.trackingFiles.find((t) => t.file.endsWith("Dải Cây Xanh/Quang Minh - DCX.xlsx"));
    expect(qm?.blocks.at(-1)).toMatchObject({ open: true, totalDebt: 159_360_000 });
  });

  it("phiếu 27–31/10 khớp 11 dòng Nhập Liệu sau mốc (KL × đơn giá)", () => {
    const after = r.deliveries.filter((d) => d.afterCutover === true);
    const amounts = after.map((d) => d.amount).sort((a, b) => (a ?? 0) - (b ?? 0));
    const nlAmounts = (r.mainFile?.nhapLieu.rows ?? []).filter((x) => x.afterCutover).map((x) => x.tt?.total ?? 0).sort((a, b) => a - b);
    expect(amounts).toEqual(nlAmounts);
    expect(after.every((d) => d.unitPrice !== null && d.source === "doi-chieu")).toBe(true);
    const qmDcx = after.filter((d) => d.file.endsWith("Quang Minh - DCX.xlsx")).map((d) => d.qty).sort((a, b) => a - b);
    expect(qmDcx).toEqual([4, 4, 8]);
    const nhDcx = after.filter((d) => d.file.endsWith("Gạch Nam Hương - DCX.xlsx") && d.unit === "m2");
    expect(nhDcx.map((d) => [d.qty, d.unitPrice])).toEqual([[230.4, 88_000], [230.4, 88_000]]);
    const mn2 = after.filter((d) => d.file.endsWith("Lộc Tài - MN2.xlsx"));
    expect(mn2).toHaveLength(1);
    expect(mn2[0].duplicates).toHaveLength(1);
  });

  it("chọn ngày cho mọi quyết định rồi parse lại thì không còn phiếu chờ quyết định", () => {
    const dateChoices = Object.fromEntries(r.dateDecisions.map((d) => [d.key, iso(d.candidates[0]) as string]));
    const again = parseCutoverBundle(loadBundle(), { dateChoices });
    expect(again.dateDecisions.every((d) => d.chosen !== null)).toBe(true);
    const pending = again.deliveries.filter((d) => d.date === null);
    expect(pending.every((d) => again.blockingErrors.some((e) => `date:${e.ref.file}:${e.ref.sheet}!${e.ref.cell}` === d.dateDecisionKey))).toBe(true);
  });
});
