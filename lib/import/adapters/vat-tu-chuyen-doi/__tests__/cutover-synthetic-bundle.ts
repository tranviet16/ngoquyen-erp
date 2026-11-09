/**
 * Gói chuyển đổi tổng hợp nhỏ (file tổng, CSV, 3 file theo dõi) theo bố cục file thật — dùng cho
 * test lập kế hoạch (thuần) và test tích hợp của adapter `vat-tu-chuyen-doi`.
 *
 * 1 NCC "Bê tông Hải Phòng" × 3 công trình:
 *   - Trại Chuối (Công Ty Quản Lý): Số Dư 100.000.000 / 90.000.000, CSV khớp → mặc định lũy kế;
 *     phiếu 18/10 (18 m³) và 27/10 (2 m³, lặp ở khối đang mở → khử trùng còn 1, ghép "Lấy Hàng"
 *     27/10 sau mốc); file cũ "- T3" khối 27/02→26/03.
 *   - "CDC" (Công Ty Quản Lý) 20.000.000 / 0 → tách theo CSV sang Tân Lộc CDC (chỉ có Số Dư).
 *   - Dải Cây Xanh (Lê Văn Huyên): Số Dư 5.000.000, không có CSV → ròng; "Trả Nợ" 28/10 sau mốc
 *     không có thanh toán ERP → ghi.
 * Neo V1: Trại Chuối 138.300.000 (= 135.080.000 + 3.220.000 dòng 27/10), file T3 106.100.000,
 * Dải Cây Xanh 20.300.000.
 */

import { excelDate, workbookBuffer, type FixtureCell } from "./fixture-builders";

export const SYNTHETIC = {
  entities: { quanLy: "Công Ty Quản Lý", huyen: "Lê Văn Huyên" },
  supplier: "Bê tông Hải Phòng",
  csvSupplier: "Công ty CP bê tông Hải Phòng",
  projects: { traiChuoi: "Trại Chuối", daiCayXanh: "Dải Cây Xanh", tanLocCdc: "Tân Lộc CDC" },
  csvTraiChuoi: "Ngô quyền Trại chuối",
  items: { m300: "BT M300", m250: "BT M250" },
  opening: { traiChuoi: { tt: 100_000_000, hd: 90_000_000 }, cdc: { tt: 20_000_000, hd: 0 }, daiCayXanh: { tt: 5_000_000, hd: 0 } },
  csv: {
    traiChuoi: { g: 500_000_000, hi: 361_700_000, m: 300_000_000, n: 210_000_000 },
    tanLoc: { g: 50_000_000, hi: 30_000_000, m: 0, n: 0 },
  },
  anchors: { traiChuoi: 138_300_000, traiChuoiT3: 106_100_000, daiCayXanh: 20_300_000 },
  postCutoverPickup: 3_220_000,
  postCutoverPayment: 5_000_000,
} as const;

const MAIN_HEADER: FixtureCell[] = [
  "Ngày GD", "Loại GD", "Chủ Thể", null, null, "Tên Vật Tư",
  "Trước VAT\n(VNĐ)", "VAT%", "Tiền VAT\n(VNĐ)", "Tổng TT\n(VNĐ)",
  "Trước VAT\n(VNĐ)", "VAT%", "Tiền VAT\n(VNĐ)", "Tổng HĐ\n(VNĐ)",
  "Số HĐ", "Ngày HĐ", "Nội dung", "Trạng Thái", "Ghi Chú",
];

function nl(date: FixtureCell, type: string, entity: string, project: string, item: string | null, tt: number): FixtureCell[] {
  return [date, type, entity, SYNTHETIC.supplier, project, item, tt, 0, 0, tt, null, null, 0, 0, null, null, null, null, null];
}

const GHOST: FixtureCell[] = [null, null, null, null, null, null, null, null, 0, 0, null, null, 0, 0];

function mainWorkbook(): Uint8Array {
  const { quanLy, huyen } = SYNTHETIC.entities;
  const { traiChuoi, daiCayXanh } = SYNTHETIC.projects;
  const d = (y: number, m: number, day: number) => excelDate(y, m, day, "dd/mm/yyyy");
  const nhapLieu: FixtureCell[][] = [
    [0],
    ["THÔNG TIN GIAO DỊCH", null, null, null, null, null, "GIÁ TRỊ THỰC TẾ (TT)", null, null, null, "GIÁ TRỊ HÓA ĐƠN (HĐ)"],
    MAIN_HEADER,
    [],
    nl(d(2026, 3, 15), "Lấy Hàng", quanLy, traiChuoi, SYNTHETIC.items.m300, 16_100_000),
    nl(d(2026, 3, 20), "Trả Nợ", quanLy, traiChuoi, null, 10_000_000),
    nl(d(2026, 10, 18), "Lấy Hàng", quanLy, traiChuoi, SYNTHETIC.items.m300, 28_980_000),
    nl(d(2026, 10, 15), "Lấy Hàng", huyen, daiCayXanh, SYNTHETIC.items.m250, 15_300_000),
    nl(d(2026, 10, 27), "Lấy Hàng", quanLy, traiChuoi, SYNTHETIC.items.m300, SYNTHETIC.postCutoverPickup),
    nl(d(2026, 10, 28), "Trả Nợ", huyen, daiCayXanh, null, SYNTHETIC.postCutoverPayment),
    GHOST,
    GHOST,
  ];
  const { opening } = SYNTHETIC;
  const soDu: FixtureCell[][] = [
    ["SỐ DƯ CÔNG NỢ BAN ĐẦU"],
    ["Nhập số dư công nợ còn lại tại ngày bắt đầu sử dụng hệ thống."],
    ["Ngày bắt đầu sử dụng hệ thống:", null, d(2026, 1, 1)],
    [],
    ["Chủ Thể", "Nhà Cung Cấp", "Dự Án / Công Trình", "Số Dư TT (VNĐ)", "Số Dư HĐ (VNĐ)", "Ngày Xác Nhận", "Ghi Chú"],
    [quanLy, SYNTHETIC.supplier, traiChuoi, opening.traiChuoi.tt, opening.traiChuoi.hd],
    [quanLy, SYNTHETIC.supplier, "CDC", opening.cdc.tt, opening.cdc.hd],
    [huyen, SYNTHETIC.supplier, daiCayXanh, opening.daiCayXanh.tt, opening.daiCayXanh.hd],
  ];
  return workbookBuffer({ "Nhập Liệu": nhapLieu, "Số Dư Ban Đầu": soDu });
}

function csvLine(cells: (string | null)[]): string {
  const padded = [...cells, ...Array(Math.max(0, 20 - cells.length)).fill(null)];
  return padded.map((c) => (c === null ? "" : /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
}

const money = (n: number) => n.toLocaleString("en-US");

/** CSV "Tổng công nợ"; `extra` thêm vào dòng tiêu đề để đổi nội dung (đổi hash gói) mà không đổi số. */
export function csvText(extra = ""): string {
  const { traiChuoi: tc, tanLoc: tl } = SYNTHETIC.csv;
  const lines: (string | null)[][] = [
    [`BẢNG THEO DÕI TỔNG HỢP CÔNG NỢ CÁC NHÀ CUNG CẤP${extra}`],
    [],
    ["TT", "Tên công ty", "Hợp đồng", null, null, "Tên vật tư", "Hàng hóa", null, null, null, "Hóa đơn", null, "Giá thành", null, null, null, "Ghi chú ( tên công trình)"],
    [null, null, "Số ", "Ngày", "Giá trị ", null, "Tổng phát sinh", "Đã tạm ứng", null, "Còn nợ", "Số", "Ngày tháng", "Tổng giá trị", "Đã chuyển khoản", "Ngày chuyển khoản", "Còn phải CK ", null],
    ["1", SYNTHETIC.csvSupplier, "03/HĐNT", "1/1/2025", "HĐNT", "Bê tông", money(tc.g), null, money(tc.hi), money(tc.g - tc.hi), null, null,
      money(tc.m), money(tc.n), null, money(tc.m - tc.n), SYNTHETIC.csvTraiChuoi],
    [null, null, "03.01/HĐNT", null, null, null, money(tl.g), null, money(tl.hi), money(tl.g - tl.hi), null, null, "-", "-", null, "-", "Tân lộc CDC"],
    [null, " Cộng ", null, null, null, null, money(tc.g + tl.g)],
    [null, " Tổng cộng ", null, null, null, null, money(tc.g + tl.g)],
  ];
  return lines.map(csvLine).join("\n");
}

const HEADER7: FixtureCell[] = ["STT", "Ngày/tháng/năm", "Loại vật tư", "Khối\n lượng", "ĐVT", "Đơn giá", "Thành tiền"];

function blockHead(project: string, title: string): FixtureCell[][] {
  return [
    ["CÔNG TY CP XÂY DỰNG NGÔ QUYỀN"], ["BẢNG ĐỐI CHIẾU CÔNG NỢ"], [`Công trình: ${project}`], ["Tên vật tư: Bê tông"],
    [title], [], HEADER7, [null, null, null, null, null, null, "Nợ", "Có"],
  ];
}

const SIGNATURE: FixtureCell[][] = [["Kính đề nghị quý Công ty kiểm tra và ký xác nhận đối chiếu công nợ"], [], []];

function traiChuoiWorkbook(): Uint8Array {
  const title = (from: string, to: string) => `Số công nợ bê tông từ ngày ${from} đến hết ngày ${to} như sau:`;
  const sheet: FixtureCell[][] = [
    ...blockHead("Trại Chuối", title("27/09/2026", "26/10/2026")),
    [null, "A", "Dư nợ mang sang: Hết 26/9/2026:", null, null, null, 106_100_000],
    [1, "18/10/2026", SYNTHETIC.items.m300, 18, "m3", 1_610_000, 28_980_000],
    [2, "27/10/2026", SYNTHETIC.items.m300, 2, "m3", 1_610_000, 3_220_000],
    [null, "B", "Cộng P/S", null, null, null, 32_200_000],
    [null, "A+B-C", "Tổng nợ", null, null, null, SYNTHETIC.anchors.traiChuoi],
    ...SIGNATURE,
    ...blockHead("Trại Chuối", title("27/10/2026", "26/11/2026")),
    [null, "A", "Dư nợ mang sang: Hết 26/10/2026:", null, null, null, SYNTHETIC.anchors.traiChuoi],
    [1, "27/10/2026", SYNTHETIC.items.m300, 2, "m3", 1_610_000, 3_220_000],
    [null, "B", "Cộng P/S", null, null, null, 3_220_000],
    [null, "A+B-C", "Tổng nợ", null, null, null, SYNTHETIC.anchors.traiChuoi + 3_220_000],
    ...SIGNATURE,
  ];
  return workbookBuffer({ "Đối chiếu công nợ": sheet });
}

function traiChuoiT3Workbook(): Uint8Array {
  const sheet: FixtureCell[][] = [
    ...blockHead("Trại Chuối", "Số công nợ bê tông từ ngày 27/02/2026 đến hết ngày 26/03/2026 như sau:"),
    [null, "A", "Dư nợ mang sang: Hết 26/2/2026:", null, null, null, 100_000_000],
    [1, "15/03/2026", SYNTHETIC.items.m300, 10, "m3", 1_610_000, 16_100_000],
    [null, "B", "Cộng P/S", null, null, null, 16_100_000],
    [null, "C", "CK (20/03/2026)", null, null, null, 10_000_000],
    [null, "A+B-C", "Tổng nợ", null, null, null, SYNTHETIC.anchors.traiChuoiT3],
    ...SIGNATURE,
  ];
  return workbookBuffer({ "Đối chiếu công nợ": sheet });
}

function daiCayXanhWorkbook(): Uint8Array {
  const sheet: FixtureCell[][] = [
    ...blockHead("Dải Cây Xanh", "Số công nợ bê tông từ ngày 27/09/2026 đến hết ngày 26/10/2026 như sau:"),
    [null, "A", "Dư nợ mang sang: Hết 26/9/2026:", null, null, null, 5_000_000],
    [1, "15/10/2026", SYNTHETIC.items.m250, 10, "m3", 1_530_000, 15_300_000],
    [null, "B", "Cộng P/S", null, null, null, 15_300_000],
    [null, "A+B-C", "Tổng nợ", null, null, null, SYNTHETIC.anchors.daiCayXanh],
    ...SIGNATURE,
  ];
  return workbookBuffer({ "Đối chiếu công nợ": sheet });
}

export interface SyntheticFile {
  path: string;
  data: Uint8Array;
}

/** Gói tổng hợp (đường dẫn có thư mục gốc như khi chọn thư mục trên trình duyệt). */
export function syntheticCutoverBundle(opts: { csvExtra?: string } = {}): SyntheticFile[] {
  const root = "Quản Lý Công Nợ";
  return [
    { path: `${root}/Quản Lý Công Nợ Vật Tư.xlsx`, data: mainWorkbook() },
    { path: `${root}/Tong Cong No - Tổng công nợ đến 26.10.26.csv`, data: new TextEncoder().encode(csvText(opts.csvExtra)) },
    { path: `${root}/Theo Dõi Vật Tư/Trại Chuối/Bê tông Hải Phòng.xlsx`, data: traiChuoiWorkbook() },
    { path: `${root}/Theo Dõi Vật Tư/Trại Chuối/Bê tông Hải Phòng - T3.xlsx`, data: traiChuoiT3Workbook() },
    { path: `${root}/Theo Dõi Vật Tư/Dải Cây Xanh/Bê tông Hải Phòng - DCX.xlsx`, data: daiCayXanhWorkbook() },
  ];
}
