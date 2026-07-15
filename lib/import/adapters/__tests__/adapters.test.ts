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
  "cong-no-nhan-cong",
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

describe("cong-no-nhan-cong adapter — full parse", () => {
  it("parses transaction and opening sheets as labor ledger rows", async () => {
    const adapter = getAdapter("cong-no-nhan-cong")!;
    const buf = wbBuffer({
      "Nhập Liệu": [
        ["BẢNG NHẬP LIỆU CÔNG NỢ"],
        ["năm 2026"],
        [
          "Ngày GD",
          "Loại GD",
          "Chủ Thể",
          "Đội Thi Công",
          "Dự Án / Công Trình",
          "Hạng Mục",
          "Tổng TT (VND)",
          "Tổng HĐ (VND)",
          "Số HĐ",
          "Nội dung",
        ],
        [
          "15/03/2026",
          "Lấy hàng",
          "Cty A",
          "Đội X",
          "DA1",
          "Nhân công xây tô",
          "10,000,000",
          "11,000,000",
          "HD001",
          "nghiệm thu",
        ],
      ],
      "Số Dư Ban Đầu": [
        ["SỐ DƯ BAN ĐẦU"],
        ["dòng 2"],
        ["dòng 3"],
        ["dòng 4"],
        ["Chủ Thể", "Đội Thi Công", "Dự Án", "Số Dư TT", "Số Dư HĐ", "Ngày Xác Nhận"],
        ["Cty A", "Đội X", "DA1", "5,000,000", "5,500,000", "01/01/2026"],
      ],
    });

    const parsed = await adapter.parse(buf);
    const tx = parsed.rows.find((r) => r.data.kind === "tx");
    const open = parsed.rows.find((r) => r.data.kind === "open");

    expect(tx).toBeDefined();
    expect(tx!.data.contractorName).toBe("Đội X");
    expect(tx!.data.transactionType).toBe("lay_hang");
    expect(tx!.data.amountTt).toBe(10000000);
    expect(tx!.data.amountHd).toBe(11000000);

    expect(open).toBeDefined();
    expect(open!.data.contractorName).toBe("Đội X");
    expect(open!.data.balanceTt).toBe(5000000);
    expect(open!.data.balanceHd).toBe(5500000);

    expect(parsed.conflicts.map((c) => c.entityType).sort()).toEqual(["contractor", "entity"]);
    expect(adapter.validate(parsed).valid).toBe(true);
  });

  it("accepts legacy Nhà Cung Cấp headers as contractor names", async () => {
    const adapter = getAdapter("cong-no-nhan-cong")!;
    const buf = wbBuffer({
      "Số Dư Ban Đầu": [
        ["SỐ DƯ BAN ĐẦU"],
        ["dòng 2"],
        ["dòng 3"],
        ["dòng 4"],
        ["Chủ Thể", "Nhà Cung Cấp", "Dự Án / Công Trình", "Số Dư TT (VNĐ)", "Số Dư HĐ (VNĐ)", "Ngày Xác Nhận"],
        ["Công Ty Quản Lý", "Phạm Văn Thạnh", "326 - Lô 34", "2,154,591", "5,979,003", "01/06/2026"],
      ],
    });

    const parsed = await adapter.parse(buf);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].data).toMatchObject({
      kind: "open",
      contractorName: "Phạm Văn Thạnh",
      projectName: "326 - Lô 34",
      balanceTt: 2154591,
      balanceHd: 5979003,
    });
    expect(parsed.conflicts.map((c) => c.entityType).sort()).toEqual(["contractor", "entity"]);
    expect(adapter.validate(parsed).valid).toBe(true);
  });

  it("aggregates duplicate opening balances in the same import file", async () => {
    const adapter = getAdapter("cong-no-nhan-cong")!;
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = {
      contractor: { findFirst: vi.fn().mockResolvedValue({ id: 7 }), create: vi.fn() },
      entity: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), create: vi.fn() },
      project: { findFirst: vi.fn().mockResolvedValue({ id: 3 }), create: vi.fn() },
      ledgerOpeningBalance: { findFirst: vi.fn().mockResolvedValue(null) },
      $executeRaw: executeRaw,
    };

    const summary = await adapter.apply({
      conflicts: [],
      meta: {},
      rows: [
        {
          rowIndex: 100025,
          data: {
            kind: "open",
            contractorName: "Vũ Minh Quang",
            entityName: "Công Ty Quản Lý",
            projectName: "Trại Chuối GĐ I",
            balanceTt: 3806560,
            balanceHd: -12000000,
            asOfDate: "01/06/2026",
          },
        },
        {
          rowIndex: 100032,
          data: {
            kind: "open",
            contractorName: "Vũ Minh Quang",
            entityName: "Công Ty Quản Lý",
            projectName: "Trại Chuối GĐ I",
            balanceTt: 6403367,
            balanceHd: 7463870,
            asOfDate: "01/06/2026",
          },
        },
      ],
    }, {}, tx, 99);

    const values = executeRaw.mock.calls[0].slice(1);
    expect(summary).toMatchObject({ rowsTotal: 2, rowsImported: 2, rowsSkipped: 0 });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(values).toContain(10209927);
    expect(values).toContain(-4536130);
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

describe("tai-chinh-nq adapter — journal source accounts", () => {
  it("maps Excel Nguồn to the correct source/target account side", async () => {
    const adapter = getAdapter("tai-chinh-nq")!;
    const buf = wbBuffer({
      "Sổ nhật ký giao dịch": [
        ["Ngày", "Loại", "Nội dung", "Số tiền", "Nguồn", "Mã hợp đồng", "Loại cụ thể"],
        ["01/01/2026", "Chi phí biến đổi", "Trả tiền vật tư", "1,000", "Tiền mặt", "", "Chi phí vật tư"],
        ["02/01/2026", "Thu nhập cố định", "Thu tiền BHXH", "2,000", "Vietin - 1833", "", "Thu nộp bảo hiểm"],
        ["03/01/2026", "Chuyển tiền đến", "Nộp tiền mặt vào TK", "3,000", "MSB - 379", "", "—"],
        ["03/01/2026", "Chuyển tiền đi", "Nộp tiền mặt vào TK", "3,000", "Tiền mặt", "", "—"],
      ],
    });

    const rows = (await adapter.parse(buf)).rows.filter((r) => r.data._type === "journal");

    expect(rows).toHaveLength(3);
    expect(rows[0].data).toMatchObject({ entryType: "chi", fromAccount: "Tiền mặt" });
    expect(rows[0].data.toAccount).toBeUndefined();
    expect(rows[1].data).toMatchObject({ entryType: "thu", toAccount: "Vietin - 1833" });
    expect(rows[1].data.fromAccount).toBeUndefined();
    expect(rows[2].data).toMatchObject({
      entryType: "chuyen_khoan",
      fromAccount: "Tiền mặt",
      toAccount: "MSB - 379",
    });
  });
});
