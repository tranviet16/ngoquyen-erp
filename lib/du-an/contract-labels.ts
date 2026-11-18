/**
 * Mã và nhãn tiếng Việt của hợp đồng dự án — dùng chung cho zod, danh mục, form và màn chi tiết.
 * Thuần dữ liệu (không import server), client import trực tiếp được.
 */

/** Loại tài liệu. Import ghi được cả 5 loại. Chỉ `contract` (hợp đồng kinh tế) mới gắn đối tác. */
export const CONTRACT_DOC_TYPES = ["contract", "license", "insurance", "acceptance", "other"] as const;
export type ContractDocType = (typeof CONTRACT_DOC_TYPES)[number];

export const CONTRACT_DOC_TYPE_LABELS: Record<ContractDocType, string> = {
  contract: "Hợp đồng",
  license: "Giấy phép",
  insurance: "Bảo hiểm",
  acceptance: "Biên bản nghiệm thu",
  other: "Khác",
};

/** Trạng thái. Import ghi `pending` khi cột trạng thái là "Chờ…". */
export const CONTRACT_STATUSES = ["active", "pending", "expired", "terminated"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  active: "Hiệu lực",
  pending: "Chờ ký",
  expired: "Hết hạn",
  terminated: "Chấm dứt",
};

/** Loại đối tác có mã của hợp đồng kinh tế. */
export const CONTRACT_PARTY_KINDS = ["ncc", "doi_thi_cong", "cdt"] as const;
export type ContractPartyKind = (typeof CONTRACT_PARTY_KINDS)[number];

export const CONTRACT_PARTY_KIND_LABELS: Record<ContractPartyKind, string> = {
  ncc: "NCC vật tư",
  doi_thi_cong: "Đội thi công",
  cdt: "Chủ đầu tư",
};

/** Tiền tố ngắn hiện ở cột Đối tác của danh mục: "NCC · tên". */
export const CONTRACT_PARTY_KIND_SHORT: Record<ContractPartyKind, string> = {
  ncc: "NCC",
  doi_thi_cong: "Đội",
  cdt: "CĐT",
};

export function docTypeLabel(docType: string): string {
  return CONTRACT_DOC_TYPE_LABELS[docType as ContractDocType] ?? docType;
}

export function statusLabel(status: string): string {
  return CONTRACT_STATUS_LABELS[status as ContractStatus] ?? status;
}

export function isPartyKind(value: unknown): value is ContractPartyKind {
  return typeof value === "string" && (CONTRACT_PARTY_KINDS as readonly string[]).includes(value);
}

/** Câu báo chung khi hợp đồng không có / đã xóa / thuộc công trình khác (không lộ dòng của nơi khác). */
export const CONTRACT_NOT_FOUND = "Không tìm thấy hợp đồng ở công trình này";
