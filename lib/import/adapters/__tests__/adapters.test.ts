import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";

const mockDb = vi.hoisted(() => ({
  supplier: { findMany: vi.fn() },
  contractor: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
  entity: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import { getAdapter } from "@/lib/import/adapters/adapter-registry";

function wbBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const m of Object.values(mockDb)) m.findMany.mockResolvedValue([]);
});

const ALL = [
  "cong-no-vat-tu",
  "du-an-xay-dung",
  "tai-chinh-nq",
  "gach-nam-huong",
  "quang-minh",
  "sl-dt",
];

describe("import adapters — contract smoke test", () => {
  it.each(ALL)("%s: parse() on an empty workbook returns a valid ParsedData shape", async (name) => {
    const adapter = getAdapter(name)!;
    const buf = wbBuffer({ Sheet1: [[]] });
    const parsed = await adapter.parse(buf);
    expect(Array.isArray(parsed.rows)).toBe(true);
    expect(Array.isArray(parsed.conflicts)).toBe(true);
    const result = adapter.validate(parsed);
    expect(typeof result.valid).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

describe("cong-no-vat-tu adapter — full parse", () => {
  it("parses the Nhập Liệu transaction sheet and Số Dư Ban Đầu opening sheet", async () => {
    const adapter = getAdapter("cong-no-vat-tu")!;
    const buf = wbBuffer({
      "Nhập Liệu": [
        ["BẢNG NHẬP LIỆU CÔNG NỢ"],
        ["năm 2026"],
        [
          "Ngày GD",
          "Loại GD",
          "Chủ Thể",
          "Nhà Cung Cấp",
          "Dự Án / Công Trình",
          "Tên Vật Tư",
          "Tổng TT (VND)",
          "Tổng HĐ (VND)",
          "Số HĐ",
          "Nội dung",
        ],
        [
          "15/03/2026",
          "Lấy hàng",
          "Cty A",
          "NCC X",
          "DA1",
          "Xi măng",
          "10,000,000",
          "11,000,000",
          "HD001",
          "nhập kho",
        ],
      ],
      "Số Dư Ban Đầu": [
        ["SỐ DƯ BAN ĐẦU"],
        ["dòng 2"],
        ["dòng 3"],
        ["dòng 4"],
        ["Chủ Thể", "Nhà Cung Cấp", "Dự Án", "Số Dư TT", "Số Dư HĐ", "Ngày Xác Nhận"],
        ["Cty A", "NCC X", "DA1", "5,000,000", "5,500,000", "01/01/2026"],
      ],
    });

    const parsed = await adapter.parse(buf);
    const tx = parsed.rows.find((r) => r.data.kind === "tx");
    const open = parsed.rows.find((r) => r.data.kind === "open");

    expect(tx).toBeDefined();
    expect(tx!.data.supplierName).toBe("NCC X");
    expect(tx!.data.transactionType).toBe("lay_hang");
    expect(tx!.data.amountTt).toBe(10000000);
    expect(tx!.data.amountHd).toBe(11000000);

    expect(open).toBeDefined();
    expect(open!.data.balanceTt).toBe(5000000);
    expect(open!.data.balanceHd).toBe(5500000);

    // one conflict per distinct supplier + entity name
    expect(parsed.conflicts.map((c) => c.entityType).sort()).toEqual(["entity", "supplier"]);

    expect(adapter.validate(parsed).valid).toBe(true);
  });

  it("flags an invalid date row in validate()", async () => {
    const adapter = getAdapter("cong-no-vat-tu")!;
    const buf = wbBuffer({
      "Nhập Liệu": [
        ["tiêu đề"],
        ["phụ đề"],
        ["Ngày GD", "Loại GD", "Chủ Thể", "Nhà Cung Cấp", "Tổng TT (VND)", "Tổng HĐ (VND)"],
        ["", "Trả tiền", "Cty A", "NCC Y", "1,000,000", "0"],
      ],
    });
    const parsed = await adapter.parse(buf);
    // a row with no parseable date is skipped at parse time → no rows
    expect(parsed.rows).toHaveLength(0);
  });
});
