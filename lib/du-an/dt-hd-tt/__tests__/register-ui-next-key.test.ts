/**
 * `nextOpenKey` — khóa mà "Lưu và sang dòng kế" mở tiếp trên Ánh xạ: khóa kế trong danh sách theo bộ lọc
 * trước lần lưu, bỏ qua khóa người dùng không mở được, hết danh sách thì null (không quay vòng).
 */

import { describe, expect, it } from "vitest";
import { nextOpenKey } from "../register-ui";

const KEYS = ["cat vang|m3", "da 1x2|m3", "gach the|vien", "thep d10|kg", "xi mang|tan"];
const all = () => true;

describe("nextOpenKey", () => {
  it("returns the key right after the current one", () => {
    expect(nextOpenKey(KEYS, "cat vang|m3", all)).toBe("da 1x2|m3");
    expect(nextOpenKey(KEYS, "thep d10|kg", all)).toBe("xi mang|tan");
  });

  it("skips keys the user cannot open", () => {
    const createOnly = new Set(["cat vang|m3", "thep d10|kg"]); // chỉ khóa chưa có alias
    expect(nextOpenKey(KEYS, "cat vang|m3", (k) => createOnly.has(k))).toBe("thep d10|kg");
  });

  it("returns null at the end of the list, and when no later key can be opened (no wrap-around)", () => {
    expect(nextOpenKey(KEYS, "xi mang|tan", all)).toBeNull();
    expect(nextOpenKey(KEYS, "gach the|vien", (k) => k === "cat vang|m3")).toBeNull();
    expect(nextOpenKey([], "cat vang|m3", all)).toBeNull();
  });

  it("starts from the top when the current key is not in the list", () => {
    expect(nextOpenKey(KEYS, "khong co|cai", all)).toBe("cat vang|m3");
    expect(nextOpenKey(KEYS, "khong co|cai", (k) => k !== "cat vang|m3")).toBe("da 1x2|m3");
  });

  it("never returns the current key", () => {
    expect(nextOpenKey(["cat vang|m3"], "cat vang|m3", all)).toBeNull();
  });

  it("works on the list as filtered before the save: the saved key leaving the filter does not lose the next one", () => {
    // Trước lần lưu, bộ lọc "chưa gán" có ba khóa; lưu khóa đầu → khóa đó rời bộ lọc, nhưng khóa kế lấy
    // từ danh sách trước lần lưu nên vẫn là khóa thứ hai.
    const beforeSave = ["cat vang|m3", "da 1x2|m3", "gach the|vien"];
    expect(nextOpenKey(beforeSave, "cat vang|m3", all)).toBe("da 1x2|m3");
  });
});
