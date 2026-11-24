/**
 * Dòng nguồn của MỘT khóa đang mở trên màn Ánh xạ (module thường, không phải server action): tối đa 20
 * dòng hóa đơn / thực tế nhập mang khóa đó, để người gán thấy NCC, số HĐ, SL, đơn giá, thành tiền.
 * Đọc riêng, chỉ khi URL có `key`: `listAliasBoard` (bảng Ánh xạ, Tổng quan, huy hiệu) không đọc thêm gì.
 * Thứ tự: kiểm quyền đọc dự án theo công trình TRƯỚC mọi truy vấn (như `listAliasBoard`); từ chối thì
 * ném lỗi, không truy vấn. Mọi truy vấn lọc theo công trình và bỏ dòng đã xóa mềm. Khóa dự toán không có
 * dòng nguồn ở đây (không đọc dòng dự toán).
 */

import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import type { AliasSource } from "./register-ui";

/** Số dòng nguồn tối đa của một khóa (giới hạn ngay trên truy vấn). */
export const ALIAS_SOURCE_LINES_MAX = 20;

export interface AliasSourceLine {
  id: number;
  /** HĐ: NCC; TT: đầu mối (null = dòng chưa gắn đầu mối). */
  party: string | null;
  /** Chỉ HĐ: NCC và số HĐ, để mở sổ Hóa đơn lọc đúng hóa đơn đó. */
  supplierId: number | null;
  invoiceNo: string | null;
  qty: number | null;
  unitPrice: number | null;
  /** HĐ: thành tiền chưa VAT; TT: thành tiền gồm VAT. */
  amount: number;
}

export interface AliasSourceLines {
  source: AliasSource;
  itemKey: string;
  lines: AliasSourceLine[];
}

type DecimalLike = { toNumber(): number };
const num = (v: DecimalLike | null | undefined): number | null => (v == null ? null : v.toNumber());

/** Dòng đọc từ DB (dạng select của loader); hd có NCC + số HĐ, tt có đầu mối. */
export type RawSourceLine = {
  id: number;
  qty: DecimalLike | null;
  unitPrice: DecimalLike | null;
  amountVnd: DecimalLike;
} & (
  | { supplierId: number; invoiceNo: string; supplier: { name: string } }
  | { counterparty: { name: string } | null }
);

/** Dòng DB → dòng hiển thị (số thường, null giữ null), giữ thứ tự, không quá `ALIAS_SOURCE_LINES_MAX`. */
export function shapeAliasSourceLines(rows: readonly RawSourceLine[]): AliasSourceLine[] {
  return rows.slice(0, ALIAS_SOURCE_LINES_MAX).map((r) => {
    const base = { id: r.id, qty: num(r.qty), unitPrice: num(r.unitPrice), amount: r.amountVnd.toNumber() };
    if ("supplier" in r) return { ...base, party: r.supplier.name, supplierId: r.supplierId, invoiceNo: r.invoiceNo };
    return { ...base, party: r.counterparty?.name ?? null, supplierId: null, invoiceNo: null };
  });
}

export async function loadAliasSourceLines(projectId: number, source: AliasSource, itemKey: string): Promise<AliasSourceLines> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const where = { projectId, itemKey, deletedAt: null };
  const amounts = { id: true, qty: true, unitPrice: true, amountVnd: true } as const;
  let rows: RawSourceLine[] = [];
  if (source === "hd") {
    rows = await prisma.projectInvoiceLine.findMany({
      where,
      select: { ...amounts, supplierId: true, invoiceNo: true, supplier: { select: { name: true } } },
      orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
      take: ALIAS_SOURCE_LINES_MAX,
    });
  } else if (source === "tt") {
    rows = await prisma.projectActualReceipt.findMany({
      where,
      select: { ...amounts, counterparty: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      take: ALIAS_SOURCE_LINES_MAX,
    });
  }
  return { source, itemKey, lines: shapeAliasSourceLines(rows) };
}
