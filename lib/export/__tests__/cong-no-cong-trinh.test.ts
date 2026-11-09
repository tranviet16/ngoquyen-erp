import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import type { DetailRow } from "@/lib/cong-no-vt/balance-report-service";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccess: vi.fn(),
  findUser: vi.fn(),
  findEntities: vi.fn(),
  queryDetailReport: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/acl", () => ({ canAccess: mocks.canAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser }, entity: { findMany: mocks.findEntities } },
}));
vi.mock("@/lib/cong-no-vt/balance-report-service", () => ({ queryDetailReport: mocks.queryDetailReport }));
vi.mock("@/lib/export/templates/cong-no-monthly", () => ({ buildCongNoMonthlyExcel: vi.fn() }));
vi.mock("@/lib/export/templates/cong-no-tong-hop", () => ({ buildCongNoTongHopExcel: vi.fn() }));
vi.mock("@/lib/export/templates/doi-chieu", () => ({ buildDoiChieuExcel: vi.fn() }));
vi.mock("@/lib/export/templates/du-toan", () => ({ buildDuToanExcel: vi.fn() }));
vi.mock("@/lib/export/templates/sl-dt", () => ({ buildSlDtExcel: vi.fn() }));

import {
  CONG_NO_CONG_TRINH_SHEET,
  CONG_NO_CONG_TRINH_TOTAL_LABEL,
  buildCongNoCongTrinhExcel,
  type CongNoCongTrinhParams,
} from "@/lib/export/templates/cong-no-cong-trinh";
import { POST } from "@/app/api/export/excel/route";

function row(
  entityId: number,
  party: [number, string],
  project: [number, string],
  tt: [number, number, number],
  hd: [number, number, number] = [0, 0, 0],
): DetailRow {
  return {
    entityId,
    entityName: `Cty ${entityId}`,
    partyId: party[0],
    partyName: party[1],
    projectId: project[0],
    projectName: project[1],
    openingTt: String(tt[0]),
    phatSinhTt: String(tt[1]),
    daTraTt: String(tt[2]),
    cuoiKyTt: String(tt[0] + tt[1] - tt[2]),
    openingHd: String(hd[0]),
    phatSinhHd: String(hd[1]),
    daTraHd: String(hd[2]),
    cuoiKyHd: String(hd[0] + hd[1] - hd[2]),
  };
}

const NAM_HUONG: [number, string] = [10, "Nam Hương"];
const QUANG_MINH: [number, string] = [20, "Quang Minh"];
const TRAI_CHUOI: [number, string] = [100, "Trại Chuối"];
const DCX: [number, string] = [200, "DCX"];

const ROWS: DetailRow[] = [
  row(1, NAM_HUONG, TRAI_CHUOI, [59_868_420, 17_000_000, 5_000_000], [50_000_000, 0, 0]),
  row(2, NAM_HUONG, DCX, [0, 3_000_000, 1_000_000]),
  row(2, QUANG_MINH, DCX, [159_360_000, 20_000_000, 30_000_000], [150_000_000, 0, 30_000_000]),
];

const params = (over: Partial<CongNoCongTrinhParams> = {}): CongNoCongTrinhParams => ({
  from: "2026-01-01",
  to: "2026-12-31",
  groupBy: "ncc",
  entityIds: [],
  ...over,
});

async function load(p: CongNoCongTrinhParams) {
  const wb = XLSX.read(await buildCongNoCongTrinhExcel(p), { type: "buffer", cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { wb, ws, aoa: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.queryDetailReport.mockResolvedValue({ rows: ROWS, subtotals: [], periodEnd: null });
  mocks.findEntities.mockResolvedValue([
    { id: 2, name: "Cty B" },
    { id: 1, name: "Cty A" },
  ]);
  mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
  mocks.canAccess.mockResolvedValue(true);
  mocks.findUser.mockResolvedValue({ role: "user" });
});

describe("buildCongNoCongTrinhExcel", () => {
  it("dựng header 2 hàng gộp ô dưới hàng tiêu đề (chế độ kỳ)", async () => {
    const { wb, ws, aoa } = await load(params());
    expect(wb.SheetNames).toEqual([CONG_NO_CONG_TRINH_SHEET]);
    expect(String(aoa[0][0])).toBe("Công nợ vật tư theo công trình (NCC → công trình) — 01/01/2026 – 31/12/2026");
    expect(aoa[1]).toEqual(["Nhà cung cấp", "Công trình", "Thực tế (TT)", "", "", "", "Hóa đơn (HĐ)", "", "", ""]);
    expect(aoa[2]).toEqual([
      "", "", "Đầu kỳ", "PS tăng", "PS giảm", "Cuối kỳ", "Đầu kỳ", "PS tăng", "PS giảm", "Cuối kỳ",
    ]);
    const merges = ws["!merges"]!.map((m) => XLSX.utils.encode_range(m)).sort();
    expect(merges).toEqual(["A1:J1", "A2:A3", "B2:B3", "C2:F2", "G2:J2"]);
    expect(ws["C4"].z).toBe("#,##0");
  });

  it("chế độ Toàn bộ dùng nhãn lũy kế và tiêu đề Toàn bộ", async () => {
    const { aoa } = await load(params({ from: null, to: null, groupBy: "cong-trinh" }));
    expect(String(aoa[0][0])).toBe("Công nợ vật tư theo công trình (Công trình → NCC) — Toàn bộ");
    expect(aoa[1].slice(0, 2)).toEqual(["Công trình", "Nhà cung cấp"]);
    expect(aoa[2].slice(2, 6)).toEqual(["Số dư chuyển sang", "LH lũy kế", "Đã trả lũy kế", "Còn nợ"]);
    expect(mocks.queryDetailReport).toHaveBeenCalledWith(
      expect.not.objectContaining({ from: expect.anything() }),
    );
  });

  it("ghi dòng nhóm rồi dòng con theo chiều NCC → công trình, và dòng TỔNG CỘNG", async () => {
    const { aoa } = await load(params());
    const body = aoa.slice(3);
    expect(body.map((r) => [r[0], r[1]])).toEqual([
      ["Nam Hương", ""],
      ["", "DCX"],
      ["", "Trại Chuối"],
      ["Quang Minh", ""],
      ["", "DCX"],
      [CONG_NO_CONG_TRINH_TOTAL_LABEL, ""],
    ]);
    // Nhóm Nam Hương = Σ dòng con
    expect(body[0].slice(2)).toEqual([59_868_420, 20_000_000, 6_000_000, 73_868_420, 50_000_000, 0, 0, 50_000_000]);
    const total = body[body.length - 1].slice(2);
    expect(total).toEqual([
      219_228_420, 40_000_000, 36_000_000, 223_228_420, 200_000_000, 0, 30_000_000, 170_000_000,
    ]);
  });

  it("tổng chung giống nhau ở hai chiều nhóm", async () => {
    const byNcc = await load(params());
    const byProject = await load(params({ groupBy: "cong-trinh" }));
    expect(byProject.aoa.slice(3).map((r) => [r[0], r[1]])).toEqual([
      ["DCX", ""],
      ["", "Nam Hương"],
      ["", "Quang Minh"],
      ["Trại Chuối", ""],
      ["", "Nam Hương"],
      [CONG_NO_CONG_TRINH_TOTAL_LABEL, ""],
    ]);
    expect(byProject.aoa[byProject.aoa.length - 1]).toEqual(byNcc.aoa[byNcc.aoa.length - 1]);
  });

  it("gọi queryDetailReport một lần với cửa sổ đã parse và Chủ thể; tiêu đề ghi tên Chủ thể", async () => {
    const { aoa } = await load(params({ from: "2025-12-27", to: "2026-01-26", entityIds: [2, 1] }));
    expect(mocks.queryDetailReport).toHaveBeenCalledTimes(1);
    expect(mocks.queryDetailReport).toHaveBeenCalledWith({
      ledgerType: "material",
      from: new Date(Date.UTC(2025, 11, 27)),
      to: new Date(Date.UTC(2026, 0, 26)),
      entityIds: [2, 1],
      showZero: false,
    });
    expect(String(aoa[0][0])).toContain("Chủ thể: Cty A, Cty B");
  });

  it("từ chối cửa sổ ngược thay vì xuất", async () => {
    await expect(buildCongNoCongTrinhExcel(params({ from: "2026-06-01", to: "2026-05-01" }))).rejects.toThrow();
    expect(mocks.queryDetailReport).not.toHaveBeenCalled();
  });
});

function request(p: Record<string, unknown>) {
  return new Request("http://localhost/api/export/excel", {
    method: "POST",
    body: JSON.stringify({ template: "cong-no-cong-trinh", params: p }),
  }) as never;
}

describe("POST /api/export/excel (cong-no-cong-trinh)", () => {
  it("cho người không phải admin có quyền đọc cong-no-vt tải file", async () => {
    const res = await POST(request({ from: "2026-01-01", to: "2026-12-31", groupBy: "cong-trinh", entityIds: [1] }));
    expect(res.status).toBe(200);
    expect(mocks.canAccess).toHaveBeenCalledWith("u1", "cong-no-vt", { minLevel: "read", scope: "module" });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.queryDetailReport).toHaveBeenCalledTimes(1);
    expect(res.headers.get("Content-Disposition")).toContain(
      "cong-no-cong-trinh-cong-trinh-2026-01-01-2026-12-31.xlsx",
    );
    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
    expect(wb.SheetNames).toEqual([CONG_NO_CONG_TRINH_SHEET]);
  });

  it("đặt tên toan-bo / den-nay cho cửa sổ không giới hạn", async () => {
    const res = await POST(request({ from: null, to: null, groupBy: "ncc" }));
    expect(res.headers.get("Content-Disposition")).toContain("cong-no-cong-trinh-ncc-toan-bo-den-nay.xlsx");
  });

  it("từ chối khi không có quyền đọc", async () => {
    mocks.canAccess.mockResolvedValue(false);
    expect((await POST(request({ from: null, to: null, groupBy: "ncc" }))).status).toBe(403);
    expect(mocks.queryDetailReport).not.toHaveBeenCalled();
  });

  it("từ chối khi chưa đăng nhập", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request({ from: null, to: null, groupBy: "ncc" }))).status).toBe(401);
    expect(mocks.queryDetailReport).not.toHaveBeenCalled();
  });

  it.each([
    { from: "2026-13-40", to: null, groupBy: "ncc" },
    { from: "2026-06-01", to: "2026-05-01", groupBy: "ncc" },
    { from: null, to: null },
    { from: null, to: null, groupBy: "chu-the" },
    { from: null, to: null, groupBy: "ncc", entityIds: ["x"] },
    { from: null, to: null, groupBy: "ncc", entityIds: "1" },
  ])("trả 400 chung chung cho tham số sai %j", async (p) => {
    const res = await POST(request(p));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tham số xuất không hợp lệ" });
    expect(mocks.queryDetailReport).not.toHaveBeenCalled();
  });

  it("không lộ chi tiết lỗi khi 500", async () => {
    mocks.queryDetailReport.mockRejectedValue(new Error("relation ledger_transactions secret"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request({ from: null, to: null, groupBy: "ncc" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Export failed" });
  });
});
