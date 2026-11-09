/**
 * Unit: lưới sổ dùng chung chuẩn hoá kết quả action — sổ vật tư trả `{ ok, row | rows }`, sổ nhân
 * công trả thẳng dữ liệu; `ok: false` ném Error ở client với đúng thông điệp nghiệp vụ.
 */
import { describe, expect, it } from "vitest";
import { unwrapActionResult } from "@/components/ledger-grid/unwrap-action-result";

describe("unwrapActionResult", () => {
  it("ok: true → lấy row / rows; không có key → undefined", () => {
    expect(unwrapActionResult({ ok: true, row: { id: 1 } }, "row")).toEqual({ id: 1 });
    expect(unwrapActionResult({ ok: true, rows: [{ id: 1 }] }, "rows")).toEqual([{ id: 1 }]);
    expect(unwrapActionResult({ ok: true })).toBeUndefined();
  });

  it("ok: false → ném Error mang nguyên thông điệp (toast của DataGrid hiện được)", () => {
    expect(() => unwrapActionResult({ ok: false, message: "Ngày 20/10/2026 thuộc giai đoạn đã chuyển đổi" }, "row")).toThrow(
      "Ngày 20/10/2026 thuộc giai đoạn đã chuyển đổi",
    );
    expect(() => unwrapActionResult({ ok: false })).toThrow("Thao tác thất bại");
  });

  it("dữ liệu thô của sổ nhân công (dòng, mảng, void) được trả nguyên", () => {
    const row = { id: 3, amountTt: "1" };
    expect(unwrapActionResult(row, "row")).toBe(row);
    const rows = [row];
    expect(unwrapActionResult(rows, "rows")).toBe(rows);
    expect(unwrapActionResult(undefined)).toBeUndefined();
  });
});
