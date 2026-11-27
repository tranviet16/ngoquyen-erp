import { describe, it, expect } from "vitest";
import { resolveTransactionsSource } from "@/lib/du-an/project-ledger/transactions-source";

const visible = (rowCount: number) => ({ rowsVisible: true, rowCount });
const hidden = { rowsVisible: false };

describe("resolveTransactionsSource", () => {
  it("mặc định sổ công nợ khi đọc được và sổ có dòng", () => {
    expect(resolveTransactionsSource(undefined, visible(490))).toBe("so-cong-no");
  });

  it("mặc định sổ dự án khi sổ công nợ không có dòng, không có quyền hoặc đọc lỗi", () => {
    expect(resolveTransactionsSource(undefined, visible(0))).toBe("so-du-an");
    expect(resolveTransactionsSource(undefined, hidden)).toBe("so-du-an");
    expect(resolveTransactionsSource(undefined, null)).toBe("so-du-an");
  });

  it("chọn tường minh được tôn trọng khi hợp lệ", () => {
    expect(resolveTransactionsSource("so-du-an", visible(490))).toBe("so-du-an");
    expect(resolveTransactionsSource("so-cong-no", visible(0))).toBe("so-cong-no");
  });

  it("?nguon=so-cong-no không có quyền dòng sổ hoặc đọc lỗi → sổ dự án", () => {
    expect(resolveTransactionsSource("so-cong-no", hidden)).toBe("so-du-an");
    expect(resolveTransactionsSource("so-cong-no", null)).toBe("so-du-an");
  });

  it("giá trị lạ → mặc định; tham số lặp → phần tử đầu", () => {
    expect(resolveTransactionsSource("abc", visible(3))).toBe("so-cong-no");
    expect(resolveTransactionsSource("abc", hidden)).toBe("so-du-an");
    expect(resolveTransactionsSource(["so-du-an", "so-cong-no"], visible(3))).toBe("so-du-an");
    expect(resolveTransactionsSource([], visible(3))).toBe("so-cong-no");
  });
});
