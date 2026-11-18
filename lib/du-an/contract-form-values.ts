/**
 * Giá trị form hợp đồng dự án và chuyển đổi từ dòng đã serialize. Module thuần (không "use client"):
 * page RSC (màn chi tiết) và client component (danh mục, form) cùng dùng.
 */

import {
  CONTRACT_DOC_TYPES,
  CONTRACT_STATUSES,
  isPartyKind,
  type ContractDocType,
  type ContractPartyKind,
  type ContractStatus,
} from "./contract-labels";

export type Option = { id: number; name: string };

/** Dòng hợp đồng đã serialize (Decimal → số hoặc chuỗi, ngày → Date hoặc chuỗi ISO). */
export interface ContractRowLike {
  docName: string;
  docType: string;
  status: string;
  partyKind?: string | null;
  supplierId?: number | null;
  contractorId?: number | null;
  partyName?: string | null;
  valueVnd?: unknown;
  valueTtVnd?: unknown;
  signedDate?: Date | string | null;
  expiryDate?: Date | string | null;
  storage?: string | null;
  note?: string | null;
}

export interface ContractFormValues {
  docName: string;
  docType: ContractDocType;
  status: ContractStatus;
  /** "" = Khác (không gắn đối tác có mã). */
  partyKind: ContractPartyKind | "";
  supplierId: number | null;
  contractorId: number | null;
  partyName: string;
  valueVnd: string;
  valueTtVnd: string;
  signedDate: string;
  expiryDate: string;
  storage: string;
  note: string;
}

function isoDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

function moneyText(v: unknown): string {
  return v === null || v === undefined || v === "" ? "" : String(v);
}

/** Dòng đã serialize → giá trị form. Không truyền dòng → form trống của hợp đồng mới. */
export function toContractFormValues(row?: ContractRowLike | null): ContractFormValues {
  return {
    docName: row?.docName ?? "",
    docType: ((CONTRACT_DOC_TYPES as readonly string[]).includes(row?.docType ?? "") ? row!.docType : "contract") as ContractDocType,
    status: ((CONTRACT_STATUSES as readonly string[]).includes(row?.status ?? "") ? row!.status : "active") as ContractStatus,
    partyKind: isPartyKind(row?.partyKind) ? row!.partyKind as ContractPartyKind : "",
    supplierId: row?.supplierId ?? null,
    contractorId: row?.contractorId ?? null,
    partyName: row?.partyName ?? "",
    valueVnd: moneyText(row?.valueVnd),
    valueTtVnd: moneyText(row?.valueTtVnd),
    signedDate: isoDate(row?.signedDate),
    expiryDate: isoDate(row?.expiryDate),
    storage: row?.storage ?? "",
    note: row?.note ?? "",
  };
}

type BoundParty = { id: number; name: string; deletedAt?: Date | string | null } | null | undefined;

/**
 * Danh sách chọn cho form sửa: thêm đối tác đang gắn mà đã bị xóa khỏi danh mục (không có trong danh
 * sách đang hoạt động), để giữ nguyên được khi lưu.
 */
export function withBoundPartyOptions(
  row: { supplier?: BoundParty; contractor?: BoundParty },
  supplierOptions: Option[],
  contractorOptions: Option[],
): { supplierOptions: Option[]; contractorOptions: Option[] } {
  const add = (opts: Option[], p: BoundParty) =>
    p && !opts.some((o) => o.id === p.id) ? [...opts, { id: p.id, name: `${p.name} (đã xóa khỏi danh mục)` }] : opts;
  return { supplierOptions: add(supplierOptions, row.supplier), contractorOptions: add(contractorOptions, row.contractor) };
}
