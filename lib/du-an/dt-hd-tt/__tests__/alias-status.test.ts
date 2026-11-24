import { describe, expect, it } from "vitest";
import { aliasQueueSummary, effectiveAliasStatus, type AliasQueueEntry } from "../alias-board";
import { buildBookIndex } from "../book-index";
import type { AliasSource } from "../register-ui";
import { fixture, K } from "./report-fixture";

const LIVE = new Set([K.thep, K.betong, K.nhanCong, K.may]);
const alias = (over: Partial<{ status: "xac_nhan" | "de_xuat" | "ngoai_dt"; dtKey: string | null; groupCodeId: number | null }> = {}) => ({
  status: "xac_nhan" as const, dtKey: null, groupCodeId: null, ...over,
});

describe("effectiveAliasStatus", () => {
  it("treats a key without alias as chưa gán in every source", () => {
    for (const source of ["dt", "hd", "tt"] as AliasSource[]) expect(effectiveAliasStatus(source, null, LIVE)).toBe("chua_gan");
  });

  it("keeps the stored status when the alias points at a live DT line or a group, or is Ngoài DT", () => {
    expect(effectiveAliasStatus("hd", alias({ dtKey: K.thep }), LIVE)).toBe("xac_nhan");
    expect(effectiveAliasStatus("tt", alias({ status: "de_xuat", groupCodeId: 101 }), LIVE)).toBe("de_xuat");
    expect(effectiveAliasStatus("hd", alias({ status: "ngoai_dt" }), LIVE)).toBe("ngoai_dt");
  });

  it("turns an hd / tt alias whose DT line is gone and that has no group into chưa gán", () => {
    expect(effectiveAliasStatus("hd", alias({ dtKey: "dong-dt-khong-con|ca|MTC" }), LIVE)).toBe("chua_gan");
    expect(effectiveAliasStatus("tt", alias({ status: "de_xuat", dtKey: "dong-dt-khong-con|ca|MTC" }), LIVE)).toBe("chua_gan");
    // Còn Mã nhóm thì báo cáo vẫn xếp vào nhóm, không phải chưa gán.
    expect(effectiveAliasStatus("hd", alias({ dtKey: "dong-dt-khong-con|ca|MTC", groupCodeId: 104 }), LIVE)).toBe("xac_nhan");
  });

  it("never rewrites a dt alias", () => {
    expect(effectiveAliasStatus("dt", alias({ status: "de_xuat", dtKey: "x" }), LIVE)).toBe("de_xuat");
  });
});

describe("effectiveAliasStatus agrees with how the report places invoice and receipt lines", () => {
  it.each([
    ["the base fixture", fixture()],
    ["an invoice alias whose DT line no longer exists", (() => {
      const inp = fixture();
      inp.aliases = inp.aliases.map((a) => (a.source === "hd" && a.dtKey === K.may ? { ...a, dtKey: "dong-dt-khong-con|ca|MTC" } : a));
      return inp;
    })()],
  ])("%s", (_name, inp) => {
    const index = buildBookIndex(inp);
    const live = new Set(inp.dtLines.map((l) => l.key));
    const aliasOf = (source: AliasSource, key: string) => inp.aliases.find((a) => a.source === source && a.itemKey === key) ?? null;
    const check = (source: "hd" | "tt", keys: string[], place: (k: string) => ReturnType<typeof index.placeInvoice>) => {
      for (const key of new Set(keys)) {
        const p = place(key);
        const engineChuaGan = p.kind === "outside" && p.reason === "chua_gan";
        expect(effectiveAliasStatus(source, aliasOf(source, key), live) === "chua_gan", `${source} ${key}`).toBe(engineChuaGan);
      }
    };
    check("hd", inp.invoiceLines.map((l) => l.itemKey), index.placeInvoice);
    check("tt", inp.receipts.map((r) => r.itemKey), index.placeReceipt);
  });
});

describe("aliasQueueSummary", () => {
  it("counts chưa gán and đề xuất per source through the same definition", () => {
    const entries: AliasQueueEntry[] = [
      { source: "dt", itemKey: K.thep, alias: alias() },
      { source: "dt", itemKey: "dt-moi", alias: null },
      { source: "hd", itemKey: "a", alias: null },
      { source: "hd", itemKey: "b", alias: alias({ dtKey: "dong-dt-khong-con" }) },
      { source: "hd", itemKey: "c", alias: alias({ status: "de_xuat", dtKey: K.thep }) },
      { source: "tt", itemKey: "d", alias: alias({ status: "ngoai_dt" }) },
    ];
    expect(aliasQueueSummary(entries, LIVE)).toEqual({
      chuaGan: { dt: 1, hd: 2, tt: 0 },
      deXuat: { dt: 0, hd: 1, tt: 0 },
      chuaGanTotal: 3,
    });
  });
});
