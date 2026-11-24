import { describe, expect, it } from "vitest";
import {
  aliasCreateSchema, aliasMappingSchema, groupForDtLine, isBulkConfirmable, kindOfDtKey, normalizeFactor, placementSignature,
  resolveAliasMapping, type AliasMappingInput,
} from "../alias-rules";
import { effectiveGroupResolver } from "../alias-board";
import { dtLineKeyOf, itemKeyOf } from "../keys";

const DT_KEY = dtLineKeyOf("Cát vàng", "m3", "VL");
const HD_KEY = itemKeyOf("Cát vàng", "m³");
const mapping = (over: Partial<AliasMappingInput> = {}) =>
  aliasMappingSchema.parse({ groupCodeId: null, dtKey: null, factor: null, kind: null, status: "de_xuat", note: null, ...over });

describe("normalizeFactor", () => {
  it("treats blank and zero as value-tracked (null)", () => {
    expect(normalizeFactor(null)).toBeNull();
    expect(normalizeFactor(0)).toBeNull();
  });

  it("keeps a positive factor rounded to 6 decimals", () => {
    expect(normalizeFactor(1.5)).toBe(1.5);
    expect(normalizeFactor(0.1234567)).toBe(0.123457);
    expect(normalizeFactor(0.0000006)).toBe(0.000001);
  });

  it("refuses a positive factor too small to survive rounding instead of storing null", () => {
    expect(() => normalizeFactor(0.0000001)).toThrow(/Hệ số quá nhỏ/);
  });

  it("refuses a negative factor with a Vietnamese message", () => {
    expect(() => normalizeFactor(-1)).toThrow(/Hệ số phải lớn hơn 0/);
  });
});

describe("kindOfDtKey", () => {
  it("reads the cost kind suffix of a DT line key", () => {
    expect(kindOfDtKey(DT_KEY)).toBe("VL");
    expect(kindOfDtKey(dtLineKeyOf("Nhân công lắp dựng", "công", "NC"))).toBe("NC");
  });

  it("returns null for a key without a kind", () => {
    expect(kindOfDtKey(HD_KEY)).toBeNull();
  });
});

describe("resolveAliasMapping on hd / tt keys", () => {
  it("confirming needs a DT line or a group code", () => {
    expect(() => resolveAliasMapping("hd", HD_KEY, mapping({ status: "xac_nhan" }))).toThrow(/Chọn Dòng DT hoặc Mã nhóm/);
    expect(resolveAliasMapping("hd", HD_KEY, mapping({ status: "xac_nhan", dtKey: DT_KEY })).status).toBe("xac_nhan");
    expect(resolveAliasMapping("tt", HD_KEY, mapping({ status: "xac_nhan", groupCodeId: 3 })).groupCodeId).toBe(3);
  });

  it("a proposal may stay without a target", () => {
    expect(resolveAliasMapping("hd", HD_KEY, mapping())).toMatchObject({ status: "de_xuat", dtKey: null, groupCodeId: null });
  });

  it("Ngoài DT clears group, DT line and factor", () => {
    const out = resolveAliasMapping("hd", HD_KEY, mapping({ status: "ngoai_dt", groupCodeId: 3, dtKey: DT_KEY, factor: 2 }));
    expect(out).toEqual({ groupCodeId: null, dtKey: null, factor: null, kind: null, status: "ngoai_dt", note: null });
  });

  it("factor 0 is stored as null; kind is dropped", () => {
    const out = resolveAliasMapping("tt", HD_KEY, mapping({ status: "xac_nhan", dtKey: DT_KEY, factor: 0, kind: "NC" }));
    expect(out.factor).toBeNull();
    expect(out.kind).toBeNull();
  });
});

describe("resolveAliasMapping on dt keys", () => {
  it("defaults the kind to the DT line's own kind and drops DT line / factor", () => {
    const out = resolveAliasMapping("dt", DT_KEY, mapping({ status: "xac_nhan", groupCodeId: 5, dtKey: "x", factor: 3 }));
    expect(out).toEqual({ groupCodeId: 5, dtKey: null, factor: null, kind: "VL", status: "xac_nhan", note: null });
  });

  it("keeps an explicit kind (a group may mix NC and MTC)", () => {
    expect(resolveAliasMapping("dt", DT_KEY, mapping({ kind: "MTC" })).kind).toBe("MTC");
  });

  it("refuses Ngoài DT on an estimate line", () => {
    expect(() => resolveAliasMapping("dt", DT_KEY, mapping({ status: "ngoai_dt" }))).toThrow(/không đánh dấu Ngoài DT/);
  });
});

describe("groupForDtLine", () => {
  it("always stores the DT line's current group when no group was picked in this write", () => {
    expect(groupForDtLine(undefined, 7)).toBe(7);
    expect(groupForDtLine(null, 7)).toBe(7);
    expect(groupForDtLine(undefined, null)).toBeNull();
  });

  it("refuses only an explicitly picked group that differs from the DT line's group", () => {
    expect(() => groupForDtLine(4, 7)).toThrow(/thuộc Mã nhóm khác/);
    expect(() => groupForDtLine(4, null)).toThrow(/chưa có Mã nhóm/);
    expect(groupForDtLine(7, 7)).toBe(7);
  });
});

describe("placementSignature", () => {
  const base = { status: "de_xuat", dtKey: DT_KEY, factor: 1.5, groupCodeId: 3 };

  it("ignores note and proposal / confirmation changes", () => {
    expect(placementSignature({ ...base, status: "xac_nhan" })).toBe(placementSignature(base));
  });

  it("changes with DT line, factor, group and moves to / from Ngoài DT or chưa gán", () => {
    const sig = placementSignature(base);
    expect(placementSignature({ ...base, dtKey: null })).not.toBe(sig);
    expect(placementSignature({ ...base, factor: null })).not.toBe(sig);
    expect(placementSignature({ ...base, groupCodeId: 4 })).not.toBe(sig);
    expect(placementSignature({ ...base, status: "ngoai_dt" })).not.toBe(sig);
    expect(placementSignature(null)).not.toBe(sig);
  });
});

describe("effectiveGroupResolver", () => {
  const aliases = [
    { source: "dt", itemKey: DT_KEY, dtKey: null, groupCodeId: 9 },
    { source: "hd", itemKey: HD_KEY, dtKey: DT_KEY, groupCodeId: 3 }, // bản sao nhóm cũ
    { source: "tt", itemKey: "x|m3", dtKey: "mat|m3|VL", groupCodeId: 5 }, // dòng DT đã mất
    { source: "tt", itemKey: "y|m3", dtKey: null, groupCodeId: 6 }, // chỉ gán tới nhóm
  ];
  const groupOf = effectiveGroupResolver(aliases, new Set([DT_KEY]));

  it("uses the DT line's current group for aliases mapped to a live DT line", () => {
    expect(groupOf(aliases[1])).toBe(9);
  });

  it("falls back to the stored group for group-only aliases and vanished DT lines", () => {
    expect(groupOf(aliases[0])).toBe(9);
    expect(groupOf(aliases[2])).toBe(5);
    expect(groupOf(aliases[3])).toBe(6);
  });
});

describe("isBulkConfirmable", () => {
  it("only moves proposals that already point somewhere", () => {
    expect(isBulkConfirmable({ source: "dt", status: "de_xuat", dtKey: null, groupCodeId: null })).toBe(true);
    expect(isBulkConfirmable({ source: "hd", status: "de_xuat", dtKey: DT_KEY, groupCodeId: null })).toBe(true);
    expect(isBulkConfirmable({ source: "tt", status: "de_xuat", dtKey: null, groupCodeId: 2 })).toBe(true);
    expect(isBulkConfirmable({ source: "hd", status: "de_xuat", dtKey: null, groupCodeId: null })).toBe(false);
  });

  it("leaves confirmed and Ngoài DT aliases alone", () => {
    expect(isBulkConfirmable({ source: "hd", status: "xac_nhan", dtKey: DT_KEY, groupCodeId: 1 })).toBe(false);
    expect(isBulkConfirmable({ source: "hd", status: "ngoai_dt", dtKey: null, groupCodeId: null })).toBe(false);
  });
});

describe("aliasCreateSchema", () => {
  it("rejects an unknown status or source", () => {
    expect(() => aliasCreateSchema.parse({ projectId: 1, source: "hd", itemKey: HD_KEY, status: "ok" })).toThrow(/Trạng thái ánh xạ/);
    expect(() => aliasCreateSchema.parse({ projectId: 1, source: "xx", itemKey: HD_KEY, status: "de_xuat" })).toThrow(/Nguồn ánh xạ/);
  });

  it("normalises blank optional fields to null", () => {
    expect(aliasCreateSchema.parse({ projectId: 1, source: "hd", itemKey: HD_KEY, status: "de_xuat", dtKey: "", note: "  " })).toMatchObject({
      dtKey: null, note: null, groupCodeId: null, factor: null, kind: null,
    });
  });
});
