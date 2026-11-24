import { describe, expect, it } from "vitest";
import { findSimilarNames, normalizeRecordName } from "@/lib/master-data/name-match";

describe("normalizeRecordName", () => {
  it("bỏ dấu tiếng Việt (kể cả đ), hoa thường và khoảng trắng thừa", () => {
    expect(normalizeRecordName("  Thép   Hoà Phát ")).toBe("thep hoa phat");
    expect(normalizeRecordName("ĐỘI Đức")).toBe("doi duc");
  });

  it("dạng Unicode tổ hợp và dựng sẵn cho cùng một khoá", () => {
    expect(normalizeRecordName("Hòa")).toBe(normalizeRecordName("Hòa"));
  });
});

describe("findSimilarNames", () => {
  const rows = [
    { id: 1, name: "Thép Hòa Phát" },
    { id: 2, name: "Xi măng Hoàng Thạch" },
    { id: 3, name: "thep hoa  phat" },
  ];

  it("trả mọi bản ghi trùng gần đúng", () => {
    expect(findSimilarNames("THÉP HOÀ PHÁT", rows).map((r) => r.id)).toEqual([1, 3]);
  });

  it("không khớp tên khác hay tên rỗng", () => {
    expect(findSimilarNames("Thép Việt Đức", rows)).toEqual([]);
    expect(findSimilarNames("   ", rows)).toEqual([]);
  });
});
