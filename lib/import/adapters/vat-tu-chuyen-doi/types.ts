/**
 * Kiểu dữ liệu đã parse của gói chuyển đổi công nợ vật tư (file tổng, CSV lũy kế,
 * file theo dõi). Mọi dòng, cảnh báo và lỗi đều mang tham chiếu nguồn (file, sheet,
 * ô, chữ gốc). Ngày là Date UTC 00:00 của ngày nghiệp vụ.
 */

import type { CutoverConstantsJson } from "./cutover-constants";

// ─── Tham chiếu nguồn và vấn đề ───────────────────────────────────────────────

export interface SourceRef {
  /** Đường dẫn tương đối của file trong gói. */
  file: string;
  sheet: string;
  /** Địa chỉ ô kiểu A1, ví dụ "B16". */
  cell: string;
  /** Chữ gốc hiển thị của ô (null khi ô trống). */
  raw: string | null;
}

export type IssueLevel = "warning" | "info";

export interface ParseWarning {
  code: string;
  level: IssueLevel;
  message: string;
  ref: SourceRef;
}

export interface BlockingError {
  code: string;
  message: string;
  ref: SourceRef;
}

export type DateDecisionReason =
  | "open-block"
  | "both-in-range"
  | "straddles-cutover"
  | "none-in-range"
  | "neighbors-ambiguous";

/** Ngày mơ hồ cần người dùng chọn trong màn xem trước. */
export interface DateDecision {
  /** `date:<file>:<sheet>!<ô>` — khóa trong bản đồ lựa chọn truyền lại cho parser. */
  key: string;
  ref: SourceRef;
  candidates: Date[];
  reason: DateDecisionReason;
  /** Mô tả ngữ cảnh (khối, biên thực) bằng tiếng Việt. */
  context: string;
  /** Ngày người dùng đã chọn (null khi chưa chọn). */
  chosen: Date | null;
}

/** Lựa chọn ngày của người dùng: khóa quyết định → "yyyy-mm-dd". */
export type DateChoices = Readonly<Record<string, string>>;

export interface ParseIssues {
  warnings: ParseWarning[];
  blockingErrors: BlockingError[];
  dateDecisions: DateDecision[];
}

export interface SkippedSourceRow {
  sourceKey: string;
  ref: SourceRef;
  reason: string;
}

// ─── File tổng: Nhập Liệu và Số Dư Ban Đầu ────────────────────────────────────

export type NhapLieuRawType = "Lấy Hàng" | "Trả Nợ";
export type NhapLieuTransactionType = "lay_hang" | "thue_hd" | "thanh_toan";

/** Một vế tiền (TT hoặc HĐ): amount = round(total / (1 + vatRate), 2), vat = total − amount. */
export interface MoneySide {
  total: number;
  amount: number;
  vat: number;
  /** Tỷ lệ VAT dạng thập phân (0.08). */
  vatRate: number;
}

export interface NhapLieuRow {
  /** `NL#<số dòng Excel>` */
  sourceKey: string;
  rowNumber: number;
  /** Ô ngày (cột A). */
  ref: SourceRef;
  date: Date;
  dateYearFixed: boolean;
  rawType: NhapLieuRawType;
  transactionType: NhapLieuTransactionType;
  entityName: string;
  supplierName: string;
  projectName: string | null;
  itemName: string | null;
  tt: MoneySide | null;
  hd: MoneySide | null;
  invoiceNo: string | null;
  invoiceDate: Date | null;
  content: string | null;
  status: string | null;
  note: string | null;
  /** Ngày > CUTOVER_DATE. */
  afterCutover: boolean;
}

export interface NhapLieuSkippedRow extends SkippedSourceRow {
  rawType: NhapLieuRawType;
}

export interface OpeningBalanceRow {
  /** `SD#<số dòng Excel>` của dòng đầu tiên. */
  sourceKey: string;
  ref: SourceRef;
  entityName: string;
  supplierName: string;
  projectName: string;
  balanceTt: number;
  balanceHd: number;
  /** Luôn là OPENING_AS_OF. */
  asOf: Date;
  /** Các sourceKey đã cộng gộp (≥ 1). */
  mergedFrom: string[];
}

export interface MainFileParseResult extends ParseIssues {
  file: string;
  nhapLieu: {
    rows: NhapLieuRow[];
    skipped: NhapLieuSkippedRow[];
    /** Số dòng dữ liệu đã đọc (gồm dòng bị bỏ). */
    readRowCount: number;
    /** Số dòng Excel của dòng dữ liệu cuối (0 nếu không có). */
    lastDataRowNumber: number;
    dominantYear: number;
  };
  openingBalances: OpeningBalanceRow[];
}

// ─── CSV "Tổng công nợ" ───────────────────────────────────────────────────────

export type CsvRowFlag =
  | "ref-error"
  | "shifted-number"
  | "text-in-amount"
  | "no-project"
  | "tt-mismatch"
  | "hd-mismatch";

export interface CsvLifetimeRow {
  /** `CSV#<số dòng>` */
  sourceKey: string;
  rowNumber: number;
  ref: SourceRef;
  /** Tên NCC (mang xuống từ dòng có tên), giữ nguyên chữ nguồn. */
  supplierName: string;
  /** Cột Q, giữ nguyên chữ nguồn (đã gộp khoảng trắng). */
  projectName: string | null;
  contractNo: string | null;
  contractDate: string | null;
  contractValue: string | null;
  itemName: string | null;
  /** G — Tổng phát sinh (LH TT). */
  lhTt: number;
  /** H — Đã tạm ứng. */
  advanceTt: number;
  /** I — Đã thanh toán. */
  paidTt: number;
  /** H + I */
  paidTotalTt: number;
  /** J — Còn nợ TT. */
  debtTt: number;
  invoiceNo: string | null;
  invoiceDate: string | null;
  /** M — Tổng giá trị HĐ. */
  lhHd: number;
  /** N — Đã chuyển khoản. */
  paidHd: number;
  transferDate: string | null;
  /** P — Còn phải CK. */
  debtHd: number;
  flags: CsvRowFlag[];
}

export interface CsvParseResult extends ParseIssues {
  file: string;
  rows: CsvLifetimeRow[];
  skipped: SkippedSourceRow[];
}

// ─── File theo dõi ─────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Nguồn biên thực của khối: theo nhãn, nhãn đã sửa (đảo ngược), theo chuỗi Tổng nợ,
 * hoặc theo chuỗi nhưng biên cuối kéo dài theo nhãn.
 */
export type BlockRangeSource = "label" | "label-fixed" | "chain" | "chain-label";

export interface ReconciliationBlock {
  sheet: string;
  /** Thứ tự khối trong sheet (0-based). */
  index: number;
  /** Ô tiêu đề "Số công nợ … từ ngày X đến hết ngày Y". */
  ref: SourceRef;
  labelFrom: Date | null;
  labelTo: Date | null;
  range: DateRange;
  rangeSource: BlockRangeSource;
  /** "Dư nợ mang sang" = "Tổng nợ" của khối trước (±1 đồng). */
  chainedToPrevious: boolean;
  /** Khối cuối đang ghi dở (biên thực vượt mốc). */
  open: boolean;
  projectLabel: string | null;
  /** Thành viên nhãn công trình (tách theo "+"). */
  projectMembers: string[];
  itemLabel: string | null;
  /** A — Dư nợ mang sang. */
  carryIn: number | null;
  /** B — Cộng P/S. */
  periodTotal: number | null;
  /** Dòng thuế HĐ trong neo (cộng vào). */
  tax: number;
  /** Dòng chuyển khoản / tạm ứng (trừ ra). */
  payments: number;
  totalDebt: number | null;
  totalDebtRef: SourceRef | null;
}

export type DeliverySource = "doi-chieu" | "vat-tu-ngay";

export interface ProjectHint {
  /** "folder": công trình theo thư mục; "label": theo tiểu mục "Cộng <tên>". */
  kind: "folder" | "label";
  name: string;
  /** Khóa ánh xạ: `project-folder:<thư mục>` hoặc `project-label:<tên>`. */
  mappingKey: string;
}

export interface TrackingDelivery {
  /** Ô ngày của dòng (dòng tiếp nối: ô KL). */
  ref: SourceRef;
  source: DeliverySource;
  file: string;
  sheet: string;
  /** Khối (đối chiếu) hoặc mục (Vật tư ngày) chứa dòng — dùng khi khử trùng. */
  container: number;
  supplierHint: string;
  project: ProjectHint;
  /** null khi ngày đang chờ quyết định. */
  date: Date | null;
  /** Khóa quyết định ngày (khi ngày mơ hồ hoặc đã được người dùng chọn). */
  dateDecisionKey: string | null;
  dateCandidates: Date[];
  itemName: string | null;
  qty: number;
  unit: string | null;
  unitPrice: number | null;
  amount: number | null;
  note: string | null;
  cbVatTu: string | null;
  chiHuyCt: string | null;
  keToan: string | null;
}

export interface TrackingFileParseResult extends ParseIssues {
  file: string;
  /** Thư mục cha (gợi ý công trình). */
  folder: string;
  /** Gợi ý NCC từ tên file. */
  supplierHint: string;
  sheetsRead: string[];
  sheetsSkipped: string[];
  blocks: ReconciliationBlock[];
  /** Phiếu của sheet đối chiếu (chưa khử trùng). */
  deliveries: TrackingDelivery[];
  /** Dòng của sheet "Vật tư ngày" (chưa so với đối chiếu). */
  dailyRows: TrackingDelivery[];
}

// ─── Gói ────────────────────────────────────────────────────────────────────────

export interface BundleFile {
  path: string;
  buffer: Uint8Array | ArrayBuffer;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

/** Phiếu sau khử trùng (bội số lớn nhất) và bổ sung từ "Vật tư ngày". */
export interface CutoverDelivery extends TrackingDelivery {
  /** Nguồn khác bị gộp vào phiếu này vì trùng. */
  duplicates: SourceRef[];
  /** null khi ngày đang chờ quyết định. */
  afterCutover: boolean | null;
}

export interface CutoverBundleParseResult extends ParseIssues {
  constants: CutoverConstantsJson;
  mainFile: MainFileParseResult | null;
  csv: CsvParseResult | null;
  trackingFiles: TrackingFileParseResult[];
  deliveries: CutoverDelivery[];
  skipped: SkippedFile[];
}
