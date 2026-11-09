/**
 * Hình dạng `reviewJson.payload` của adapter `vat-tu-chuyen-doi` — hợp đồng giữa `review-builder.ts`
 * (server) và `cutover-review.tsx` (client). Chỉ khai báo kiểu, tuần tự hóa được bằng JSON
 * (ngày là chuỗi "yyyy-mm-dd", tiền là số đồng).
 */

import type { MappingValue } from "../adapter-types";
import type { NameKind } from "./mapping-keys";

export interface MoneyPair {
  tt: number;
  hd: number;
}

export interface SummaryView {
  files: { main: string | null; csv: string | null; tracking: number; skipped: { path: string; reason: string }[] };
  nhapLieu: {
    read: number;
    layHang: number;
    thueHd: number;
    thanhToan: number;
    afterCutover: number;
    skipped: { sourceKey: string; reason: string }[];
  };
  openingRows: number;
  csvRows: number;
  csvSkipped: { sourceKey: string; reason: string }[];
  deliveries: { kept: number; duplicatesMerged: number; fromDailySheet: number; pendingDate: number };
  dateFixes: number;
  warnings: { code: string; level: string; message: string; where: string }[];
}

export interface BlockingGroupView {
  group: string;
  messages: string[];
}

export interface CandidateView {
  id: number;
  name: string;
  score: number;
}

export interface MappingEntryView {
  key: string;
  kind: NameKind;
  /** Tên nguồn hiển thị (lần gặp đầu tiên). */
  display: string;
  /** Các cách viết khác của cùng khóa. */
  variants: string[];
  /** Nơi xuất hiện: "Nhập Liệu", "Số Dư", "CSV", "File theo dõi", "Neo V1". */
  sources: string[];
  uses: number;
  /** Giá trị đã lưu (undefined = chưa chọn). */
  stored: MappingValue | undefined;
  /** Giá trị đang áp dụng (đã lưu, hoặc tự điền). */
  effective: MappingValue | undefined;
  /** Giá trị đang áp dụng là tự điền (trùng tên khít / mặc định tạo mới vật tư). */
  auto: boolean;
  allowSkip: boolean;
  allowSplit: boolean;
  /** Chủ thể của khóa `project:` (tên nguồn). */
  entityName: string | null;
  /** ĐVT của vật tư (từ phiếu). */
  unit: string | null;
  candidates: CandidateView[];
  /** Lỗi / cảnh báo của khóa (null = ổn). */
  issue: string | null;
}

export interface CatalogView {
  entities: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
  projects: { id: number; name: string; code: string; entityName: string | null }[];
  items: { id: number; name: string; unit: string }[];
  /** Công trình sẽ tạo trong lần chạy này (để chọn cho khóa CSV / thư mục / nhãn). */
  newProjects: { name: string; entityName: string | null }[];
}

export interface CdcTargetView {
  csvLabel: string;
  projectName: string;
  tt: number;
  hd: number;
}

export interface CdcView {
  sourceKey: string;
  entityName: string;
  supplierName: string;
  balance: MoneyPair;
  targets: CdcTargetView[];
  diff: MoneyPair;
  /** "mismatch": tổng tách khác Số Dư; "missing-csv": CSV không có dòng CDC của NCC. */
  reason: "mismatch" | "missing-csv" | null;
  decisionKey: string;
  decisionValue: MappingValue | undefined;
  decisionProjectName: string | null;
  ackCode: string | null;
  acked: boolean;
}

export interface PairView {
  key: string;
  decisionKey: string;
  supplierName: string;
  projectName: string;
  entityName: string | null;
  hasOpeningRow: boolean;
  s: MoneyPair;
  csv: {
    lhTt: number;
    paidTt: number;
    lhHd: number;
    paidHd: number;
    contracts: string[];
    sourceKeys: string[];
  } | null;
  nl2026: { lhTt: number; paidTt: number; lhHd: number; paidHd: number };
  /** (G − LH26) − (H+I − Trả26) và tương tự HĐ; null khi CSV thiếu. */
  computed: MoneyPair | null;
  diff: MoneyPair | null;
  matchTt: boolean;
  matchHd: boolean;
  defaultDecision: 0 | 1;
  decision: 0 | 1;
  lockReasons: string[];
  consequence: string | null;
  ackCode: string | null;
  acked: boolean;
}

export interface CsvUnusedView {
  sourceKey: string;
  supplierName: string;
  projectName: string | null;
  debt: MoneyPair;
  reason: string;
}

export interface DateDecisionView {
  key: string;
  file: string;
  sheet: string;
  cell: string;
  raw: string | null;
  context: string;
  candidates: string[];
  chosen: string | null;
  /** "decision": chọn trong ứng viên; "invalid"/"missing": ô không đọc được / trống — nhập ngày. */
  kind: "decision" | "invalid" | "missing";
  message: string;
}

export interface V1RowView {
  file: string;
  supplierName: string;
  members: string[];
  y: string;
  erpDebt: number;
  linesAfter: number;
  unpricedAfter: number;
  totalDebt: number;
  diff: number;
  ok: boolean;
  ackCode: string | null;
  acked: boolean;
}

export interface V2RowView {
  pairKey: string;
  supplierName: string;
  projectName: string;
  expected: MoneyPair;
  actual: MoneyPair;
  note: string | null;
}

export interface V3RowView {
  pairKey: string;
  supplierName: string;
  projectName: string;
  expectedLh: MoneyPair;
  actualLh: MoneyPair;
  expectedPaid: MoneyPair;
  actualPaid: MoneyPair;
}

export interface VerificationView {
  v1: V1RowView[];
  v2: { checked: number; failures: V2RowView[]; excluded: V2RowView[] };
  v3: { checked: number; failures: V3RowView[] };
  v4: {
    total: number;
    matched: number;
    /** Dòng sổ lay_hang / thue_hd của run có ngày > mốc (phải = 0). */
    ledgerPickupsAfterCutover: number;
    /** Phiếu ERP đã ghép nhưng không còn (bị xóa) (phải = 0). */
    missingErpDeliveries: number;
    /** Phiếu sau mốc của run trong DB so với dự kiến. */
    insertedAfterCutover: number;
    expectedAfterCutover: number;
    ok: boolean;
  };
}

export interface PickupView {
  sourceKey: string;
  date: string;
  supplierName: string;
  projectName: string;
  amount: number;
  match: { source: "bundle" | "erp"; date: string; label: string } | null;
}

export interface PaymentMatchView {
  sourceKey: string;
  date: string;
  supplierName: string;
  projectName: string;
  amount: number;
  match: { ledgerId: number; date: string; label: string } | null;
}

/** Đợt thanh toán `vat_tu` còn mở: mỗi đợt cần xác nhận; trùng "Trả Nợ" thì cần quyết định trước. */
export interface OpenRoundView {
  roundId: number;
  /** "YYYY-MM-<số đợt>" */
  round: string;
  status: string;
  items: {
    itemId: number;
    supplierName: string;
    projectName: string | null;
    soDeNghi: number;
    soDuyet: number | null;
  }[];
  total: number;
  /** Dòng "Trả Nợ" của Nhập Liệu cùng NCC × công trình, số tiền ± 1 đồng với một dòng của đợt. */
  matches: { sourceKey: string; date: string; amount: number; itemId: number; supplierName: string; projectName: string }[];
  /** Khóa quyết định `round:<id>` (chỉ khi có dòng trùng). */
  decisionKey: string | null;
  decision: "drop-nl" | "keep" | null;
  ackCode: string;
  acked: boolean;
}

export interface CrossCutoverView {
  sourceKey: string;
  nlDate: string;
  ledgerId: number;
  ledgerDate: string;
  amount: number;
  supplierName: string;
  projectName: string;
  decisionKey: string;
  decision: "drop" | "keep" | null;
  ackCode: string;
  acked: boolean;
}

export interface DiagnosticRowView {
  pairKey: string;
  supplierName: string;
  projectName: string;
  month: string;
  deliveryAmount: number;
  ledgerLayHang: number;
  diff: number;
  unpricedDeliveries: number;
}

export interface DeliverySummaryView {
  pairKey: string;
  supplierName: string;
  projectName: string;
  beforePriced: number;
  beforeUnpriced: number;
  afterPriced: number;
  afterUnpriced: number;
  duplicatesMerged: number;
  alreadyInErp: number;
  noMoney: boolean;
  ackCode: string | null;
  acked: boolean;
}

export interface NewMasterView {
  entities: string[];
  suppliers: string[];
  projects: { name: string; entityName: string | null }[];
  items: { name: string; unit: string; type: string }[];
}

export interface CutoverReviewPayload {
  version: 1;
  constants: { cutoverDate: string; lifetimeDate: string; openingAsOf: string; cutoverMarkerFrom: string };
  summary: SummaryView;
  blockingGroups: BlockingGroupView[];
  mapping: MappingEntryView[];
  catalog: CatalogView;
  cdc: CdcView[];
  pairs: PairView[];
  csvUnused: CsvUnusedView[];
  dates: DateDecisionView[];
  /** null khi chưa chạy thử (còn lỗi chặn ánh xạ / ngày / guard). */
  verification: VerificationView | null;
  /** Lý do không chạy thử, hoặc lỗi khi chạy thử. */
  dryRunNote: string | null;
  postCutover: {
    pickups: PickupView[];
    payments: PaymentMatchView[];
    openRounds: OpenRoundView[];
    crossCutover: CrossCutoverView[];
  };
  diagnostic: DiagnosticRowView[] | null;
  deliveries: DeliverySummaryView[];
  newMaster: NewMasterView;
  markers: number;
}
