/**
 * Workbook "Cân đối vật tư" nhỏ dựng trong bộ nhớ (không phải số liệu thật): đủ 10 sheet bắt buộc,
 * có các trường hợp biên mà bộ đọc phải xử lý — ngày serial / chuỗi / sai, dòng "Cộng" / "TỔNG",
 * ô công thức và ô nhập tay, ba dạng công thức nguồn thực tế. Dùng cho test đơn vị khi CI không có
 * file thật của đội.
 */

import * as XLSX from "xlsx";

type CellValue = string | number | { v: string | number; f: string };
type SheetRows = Record<number, Record<string, CellValue>>;

function toSheet(rows: SheetRows): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxR = 0;
  let maxC = 0;
  for (const [r, cols] of Object.entries(rows)) {
    for (const [col, raw] of Object.entries(cols)) {
      const addr = `${col}${r}`;
      const { v, f } = typeof raw === "object" ? raw : { v: raw, f: undefined };
      ws[addr] = { t: typeof v === "number" ? "n" : "s", v, ...(f ? { f } : {}) } as XLSX.CellObject;
      const { r: ri, c: ci } = XLSX.utils.decode_cell(addr);
      maxR = Math.max(maxR, ri);
      maxC = Math.max(maxC, ci);
    }
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  return ws;
}

export const MST_THEP = "0101234567";
export const MST_XI_MANG = "0202345678";
export const MST_CUA_HANG = "1234567890123";

const RECEIPTS_FORMULA =
  "SUM('Thực Tế Nhập'!$G$3:$G$4)+SUMIFS('Thực Tế Nhập'!$G$6:$G$7,'Thực Tế Nhập'!$L$6:$L$7,\"*kho*\")";

export const SYNTHETIC_SHEETS: Record<string, SheetRows> = {
  "Ánh Xạ DT": {
    1: { A: "STT", B: "Tên", C: "ĐVT", D: "Mã nhóm", E: "KL", G: "Giá trị", H: "Loại" },
    2: { A: "1", B: "Thép D10", C: "kg", D: "THEP", E: 1000, G: 20_000_000, H: "VL" },
    3: { A: "2", B: "Xi măng", C: "tấn", D: "XM", E: 10, G: 15_000_000, H: "vl" },
    4: { A: "3", B: "Nhân công xây", C: "công", E: 100, G: 30_000_000, H: "NC" },
    5: { A: "4", B: "Thép D10", C: "kg", D: "THEP", E: 500, G: 10_000_000, H: "VL" },
    6: { B: "TỔNG CỘNG", G: 75_000_000, H: "VL" },
    7: { A: "5", B: "Không loại", C: "m", E: 1, G: 5, H: "X" },
    8: { A: "6", B: "Không giá trị", C: "m", E: 1, G: "abc", H: "VL" },
  },
  "Ánh Xạ HĐ": {
    1: { A: "STT", B: "Tên hàng", C: "ĐVT", F: "Mã nhóm", G: "Hệ số", K: "STT DT", M: "Độ tin cậy" },
    2: { A: 1, B: "Thép tròn D10", C: "kg", F: "THEP", G: 0, K: "1", M: "Chắc chắn" },
    3: { A: 2, B: "Xi măng PCB40", C: "bao", F: "XM", G: 0.05, K: "2", M: "Đề xuất" },
    4: { A: 3, B: "Dây buộc", C: "kg", F: "NGOAI-DT" },
    5: { A: 4 },
  },
  "Ánh Xạ TT": {
    1: { A: "STT", B: "Tên", C: "ĐVT", G: "Mã nhóm", H: "STT DT", I: "Hệ số", M: "Độ tin cậy" },
    2: { A: 1, B: "Thép D10 công trường", C: "kg", G: "THEP", H: "1", I: 1, M: "Chắc chắn" },
    3: { A: 2, B: "Gạch", C: "viên", M: "ngoài DT" },
  },
  "Đề Xuất NCC": {
    1: { A: "ĐỀ XUẤT NCC" },
    2: { B: "Mã nhóm", C: "Tên nhóm", T: "NCC áp dụng" },
    3: { B: "THEP", C: "Thép", T: "Công ty Thép A" },
    4: { B: "XM", T: "Vật tư phụ" },
    6: { B: "ZZ", C: "Sau dòng trống" },
  },
  "Ánh Xạ Tên NCC": {
    1: { A: "STT", T: "Tên chuẩn", U: "STT DT-TT", Y: "MST", Z: "Nhóm", AA: "Thứ tự" },
    2: { A: 1, T: "Công ty Thép A", U: 1, Y: 101234567, Z: "VL chính", AA: 1 },
    3: { A: 2, T: "Công ty Xi Măng B", U: 2, Y: "0202-345-678", AA: 2 },
    4: { A: 3, T: "Cửa hàng C", Y: MST_CUA_HANG },
    5: { A: 4 },
  },
  "Hóa Đơn": {
    1: { A: "Ngày", B: "Số HĐ", C: "NCC", D: "MST", E: "Tên hàng", I: "Thành tiền", M: "VAT %", O: "Tiền VAT" },
    2: { A: 46023, B: "HD01", C: "Công ty Thép A", D: MST_THEP, E: "Thép tròn D10", F: "kg", G: 1000, H: 20_000, I: 20_000_000, M: 0.08, O: 1_600_000 },
    3: { A: "15/01/2026", B: "HD02", C: "Công ty Xi Măng B", D: 202345678, E: "Xi măng PCB40", F: "bao", G: 200, H: 75_000, I: 15_000_000, M: 0.1 },
    4: { A: "abc", B: "HD03", C: "Cửa hàng C", D: MST_CUA_HANG, E: "Dây buộc", F: "kg", I: "n/a" },
    5: { B: "HD04" },
  },
  "Thực Tế Nhập": {
    1: { A: "THỰC TẾ NHẬP" },
    2: { A: "Khối", B: "Tên vật tư", D: "Ngày", E: "KL", G: "Thành tiền" },
    3: { A: 1, B: "Thép D10 công trường", C: "kg", D: "05/01/2026", E: 500, F: 20_000, G: 10_000_000, L: "Đại Ngàn" },
    4: { C: "kg", E: 300, F: 20_000, G: 6_000_000, M: "đợt 2" },
    5: { B: "Cộng", E: 800, G: 16_000_000 },
    6: { A: 2, B: "Gạch", C: "viên", D: 46030, E: 1000, F: 1000, G: 1_000_000, L: "Kho" },
    7: { B: "Gạch", C: "viên", D: "xx/yy", E: 500, F: 1000, G: 500_000 },
    8: { B: "Ghi chú" },
  },
  "Chi Thực Tế": {
    1: { A: "SỔ CHI" },
    3: { B: "Ngày", C: "Nội dung", D: "CK", E: "TM", H: "Mục", I: "Đầu mối chuẩn" },
    4: { B: "10/01/2026", C: "Trả tiền thép", D: 5_000_000, F: "ghi chú", H: "I", I: "Công ty Thép A" },
    5: { B: "PC03 Đoàn; 14/01/2026", C: "Tạm ứng", E: 2_000_000, H: "II", I: "Tổ Đoàn" },
    6: { D: 1_000_000, H: "III" },
    7: { C: "Cộng mục I", D: 8_000_000 },
    8: { C: "Không số" },
  },
  "In A4 – DT-TT": {
    1: { A: "BẢNG DT-TT" },
    2: { A: "A. Nhà cung cấp" },
    3: { A: 1, B: "Công ty Thép A", H: { v: 21_600_000, f: `(SUMIFS('Hóa Đơn'!$I$2:$I$9,'Hóa Đơn'!$D$2:$D$9,"101234567"))*(1+$E$3)` } },
    4: { A: 2, B: "Vật tư phụ", H: { v: 17_000_000, f: RECEIPTS_FORMULA } },
    5: { A: 3, B: "Đại Ngàn", H: 7_000_000 },
    6: { B: "TỔNG A", H: 45_600_000 },
    7: { A: "B. Tổ nhân công" },
    8: { A: 1, B: "Tổ Đoàn", H: { v: 2_000_000, f: `SUMIFS('Chi Thực Tế'!$K$4:$K$9,'Chi Thực Tế'!$H$4:$H$9,"II")` } },
    9: { B: "TỔNG B", H: 2_000_000 },
    10: { A: "C. Khác" },
    11: { A: 1, B: "Chi khác", H: { v: 300_000, f: "ROUND(300000,0)" } },
    12: { A: 2 },
    13: { B: "TỔNG DỰ TOÁN", H: 47_900_000 },
    14: { A: "PHẦN III" },
    15: { B: "CHI PHÍ TRỰC TIẾP", E: 75_000_000 },
    16: { B: "Chi phí chung", D: 0.065 },
    17: { B: "Chi phí nhà tạm", D: 0.01 },
    18: { B: "Chi phí một số công việc không xác định", D: 0.02 },
    19: { B: "Thu nhập chịu thuế tính trước", D: 0.055 },
    20: { B: "Thuế GTGT", D: 0.08 },
    21: { B: "GIÁ TRỊ DỰ TOÁN SAU THUẾ", E: 99_000_000 },
  },
  "In A4 – HĐ-TT": {
    1: { A: "Nhà cung cấp" },
    2: { A: "Công ty Thép A", E: 21_600_000, H: 20_000_000, I: 20_000_000, S: { v: 0, f: "0*1" }, T: 21_600_000, X: 500_000, Z: "Đòi hóa đơn" },
    3: { A: "Công ty Xi Măng B", E: 16_500_000, H: { v: 5_000_000, f: "G3" }, I: 5_000_000, T: 0, Z: { v: "xong", f: `IF(1,"xong","")` } },
    5: { A: "TỔNG NHÀ CUNG CẤP", E: 38_100_000, I: 25_000_000, T: 21_600_000, X: 500_000 },
  },
};

/** Ghi workbook ra buffer .xlsx; `omit` bỏ bớt sheet để thử thông báo thiếu sheet. */
export function syntheticWorkbookBuffer(omit: readonly string[] = []): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(SYNTHETIC_SHEETS)) {
    if (!omit.includes(name)) XLSX.utils.book_append_sheet(wb, toSheet(rows), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
