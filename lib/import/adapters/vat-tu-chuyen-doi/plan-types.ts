/**
 * Kiểu nội bộ của lớp lập kế hoạch chuyển đổi (thuần, không DB): danh mục và dữ kiện ERP đã đọc,
 * bản ghi sẽ tạo mới, dòng sẽ ghi. Ref (`mapping-keys.ts`) trỏ tới bản ghi có sẵn hoặc bản ghi sẽ
 * tạo; `apply-cutover.ts` đổi ref thành id sau khi tạo danh mục.
 */

import type { PairRef, Ref } from "./mapping-keys";

// ─── Danh mục ERP (đọc một lần) ────────────────────────────────────────────────

export interface CatalogEntity {
  id: number;
  name: string;
}

export interface CatalogSupplier {
  id: number;
  name: string;
}

export interface CatalogProject {
  id: number;
  name: string;
  code: string;
  entityId: number | null;
}

export interface CatalogItem {
  id: number;
  name: string;
  unit: string;
}

export interface Catalog {
  entities: CatalogEntity[];
  suppliers: CatalogSupplier[];
  projects: CatalogProject[];
  items: CatalogItem[];
}

// ─── Dữ kiện ERP của các NCC trong run (đọc dưới khóa NCC) ─────────────────────

export interface ErpDelivery {
  id: number;
  supplierId: number;
  projectId: number;
  date: Date;
  itemId: number;
  qty: number;
  /** Thành tiền (null = phiếu chưa giá). */
  amount: number | null;
}

export interface ErpPayment {
  id: number;
  supplierId: number;
  projectId: number;
  date: Date;
  amountTt: number;
  paymentRoundItemId: number | null;
  content: string | null;
}

/** Dòng `vat_tu` của đợt thanh toán còn mở (draft / submitted / approved). */
export interface OpenRoundItem {
  id: number;
  roundId: number;
  /** "YYYY-MM-<số đợt>" */
  roundLabel: string;
  status: string;
  supplierId: number;
  projectId: number | null;
  soDeNghi: number;
  soDuyet: number | null;
  /** soDuyet nếu đã duyệt, không thì soDeNghi. */
  amount: number;
}

/** Dữ liệu đang có của một cặp — đầu vào guard độc quyền. */
export interface PairGuardFact {
  supplierId: number;
  projectId: number;
  /** Dòng sổ vật tư ngày ≤ mốc, chưa xóa mềm, mọi loại (kể cả dieu_chinh). */
  ledgerBeforeCutover: number;
  openings: number;
  liveReconciliations: number;
}

export interface DbFacts {
  /** Run `vat-tu-chuyen-doi` khác đang `committed` (null khi không có). */
  otherCommittedRunId: number | null;
  guard: PairGuardFact[];
  erpDeliveries: ErpDelivery[];
  erpPayments: ErpPayment[];
  openRoundItems: OpenRoundItem[];
}

export const EMPTY_DB_FACTS: DbFacts = {
  otherCommittedRunId: null,
  guard: [],
  erpDeliveries: [],
  erpPayments: [],
  openRoundItems: [],
};

// ─── Bản ghi sẽ tạo ─────────────────────────────────────────────────────────────

export interface NewEntitySpec {
  ref: Ref;
  name: string;
  type: "company" | "person";
}

export interface NewSupplierSpec {
  ref: Ref;
  name: string;
}

export interface NewProjectSpec {
  ref: Ref;
  name: string;
  /** Chủ thể (đã giải; null khi chưa xác định được — kèm lỗi chặn). */
  entityRef: Ref | null;
}

export interface NewItemSpec {
  ref: Ref;
  name: string;
  unit: string;
  type: "material" | "machine";
}

export interface NewMasterData {
  entities: NewEntitySpec[];
  suppliers: NewSupplierSpec[];
  projects: NewProjectSpec[];
  items: NewItemSpec[];
}

// ─── Dòng sẽ ghi ────────────────────────────────────────────────────────────────

export type LedgerWriteType = "lay_hang" | "thue_hd" | "thanh_toan";

export interface PlannedLedgerRow {
  pair: PairRef;
  date: Date;
  type: LedgerWriteType;
  itemRef: Ref | null;
  amountTt: number;
  vatPctTt: number;
  vatTt: number;
  totalTt: number;
  amountHd: number;
  vatPctHd: number;
  vatHd: number;
  totalHd: number;
  invoiceNo: string | null;
  invoiceDate: Date | null;
  content: string | null;
  note: string | null;
  status: "pending" | "approved" | "paid";
  /** NL#… / LK#… (lũy kế) — để truy nguồn. */
  sourceKey: string;
}

export interface PlannedOpening {
  pair: PairRef;
  tt: number;
  hd: number;
  sourceKeys: string[];
}

export interface PlannedDelivery {
  pair: PairRef;
  date: Date;
  itemRef: Ref;
  qty: number;
  unit: string;
  unitPrice: number | null;
  totalAmount: number | null;
  cbVatTu: string | null;
  chiHuyCt: string | null;
  keToan: string | null;
  note: string | null;
  afterCutover: boolean;
  /** "file sheet!ô" của dòng nguồn. */
  sourceRef: string;
}

/** Neo V1 của một file theo dõi (phần tính được không cần DB). */
export interface AnchorPlan {
  file: string;
  supplierRef: Ref;
  memberRefs: Ref[];
  memberNames: string[];
  y: Date;
  totalDebt: number;
  linesAfter: number;
  unpricedAfter: number;
}

/** Mục tiêu V2: Đầu kỳ 2026 của cặp phải bằng Số Dư (sau tách CDC). */
export interface V2Target {
  pair: PairRef;
  tt: number;
  hd: number;
  /** Cặp chọn lũy kế dù lệch, đã xác nhận → loại khỏi V2 (có ghi chú). */
  excludedReason: string | null;
}

/** Mục tiêu V3 (cặp lũy kế): dòng của run + phần sau mốc bị bỏ = CSV. */
export interface V3Target {
  pair: PairRef;
  lhTt: number;
  lhHd: number;
  paidTt: number;
  paidHd: number;
  skippedLhTt: number;
  skippedLhHd: number;
  skippedPaidTt: number;
  skippedPaidHd: number;
}
