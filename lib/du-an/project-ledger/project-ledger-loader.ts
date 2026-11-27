/**
 * Loader sổ Công nợ vật tư theo công trình, cho tab Công Nợ NCC và Giao Dịch (nguồn "Sổ công nợ vật tư").
 *
 * Số tiền công nợ lấy từ báo cáo công nợ lũy kế (`queryDetailReport`, không cửa sổ ngày) rồi cộng ở server,
 * nên khớp đúng màn `/cong-no-vt/chi-tiet` chế độ "Toàn bộ" lọc công trình. Không đọc `project_transactions`,
 * không cộng gộp hai nguồn.
 *
 * Ranh giới quyền giống tab Hợp đồng (`contract-detail-loader.ts`): người đọc được dự án thấy công nợ từng
 * NCC, tổng và số phiếu chưa chốt; từng dòng sổ, số dư đầu kỳ chi tiết và số dòng sổ chỉ trả về khi có thêm
 * quyền đọc `cong-no-vt` (`rowsVisible`; gồm cổng phát hành, admin bỏ qua).
 *
 * Cố ý KHÔNG nằm trong file "use server": hàm nội bộ của page, không được lộ thành server action.
 * Không dùng `server-only` (gói chưa cài; tsx và vitest không nạp được).
 */

import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { canAccess } from "@/lib/acl/effective";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { decStr, isoDate, isoDateOrNull, toDec } from "@/lib/du-an/contract-detail/types";
import type { TransactionType } from "@/lib/ledger/transaction-classification";
import {
  countProjectLedgerRows,
  loadPendingDeliveriesByProject,
  loadProjectLedgerOpenings,
  loadProjectLedgerRows,
} from "./project-ledger-source";
import { buildSupplierBalances, type SupplierBalance, type SupplierBalancesResult } from "./supplier-balances";

/** Giới hạn của cột `int4` Postgres: mảng id ép `::int[]` báo lỗi với giá trị lớn hơn. */
const MAX_INT4 = 2_147_483_647;

/**
 * `?ncc=` → danh sách mã NCC. Nhận chuỗi hoặc mảng (tham số lặp: lấy phần tử đầu), tách dấu phẩy, chỉ giữ
 * số nguyên 1…2147483647, bỏ trùng. Không có gì hợp lệ → `null` (không lọc).
 */
export function parseSupplierFilter(raw: string | string[] | undefined): number[] | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return null;
  const ids = new Set<number>();
  for (const part of first.split(",")) {
    const s = part.trim();
    if (!/^\d+$/.test(s)) continue;
    const n = Number(s);
    if (n >= 1 && n <= MAX_INT4) ids.add(n);
  }
  return ids.size > 0 ? [...ids] : null;
}

/**
 * Kiểm quyền chung: `projectId` hợp lệ, đọc được dự án của công trình (ném lỗi nếu không); trả về việc
 * người xem có quyền đọc từng dòng sổ Công nợ vật tư hay không.
 */
async function authorize(projectId: number): Promise<boolean> {
  // Chặn trước mọi truy vấn: `projectIds: []` ở báo cáo nghĩa là MỌI công trình.
  if (!Number.isInteger(projectId) || projectId < 1 || projectId > MAX_INT4) {
    throw new Error(`Mã công trình không hợp lệ: ${projectId}`);
  }
  const { userId } = await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return canAccess(userId, "cong-no-vt", { minLevel: "read", scope: "module" });
}

export interface ProjectLedgerSwitchInfo {
  rowsVisible: boolean;
  /** Số dòng sổ (không tính số dư đầu kỳ); chỉ có khi `rowsVisible`. */
  rowCount?: number;
}

/** Thông tin nhẹ cho công tắc nguồn của tab Giao Dịch: không nạp số tiền nào. */
export async function loadProjectLedgerSwitchInfo(projectId: number): Promise<ProjectLedgerSwitchInfo> {
  const rowsVisible = await authorize(projectId);
  if (!rowsVisible) return { rowsVisible };
  return { rowsVisible, rowCount: await countProjectLedgerRows(projectId) };
}

/** Một dòng sổ cho lưới chỉ đọc; số tiền là chuỗi thập phân chính xác để qua RSC. */
export interface ProjectLedgerRowView {
  id: number;
  date: string;
  supplierId: number;
  supplierName: string;
  entityId: number;
  transactionType: TransactionType;
  invoiceNo: string | null;
  invoiceDate: string | null;
  content: string | null;
  qty: string | null;
  itemName: string | null;
  incTt: string;
  decTt: string;
  incHd: string;
  decHd: string;
}

export interface ProjectLedgerOpeningView {
  supplierId: number;
  supplierName: string;
  entityId: number;
  entityName: string;
  openingTt: string;
  openingHd: string;
}

export interface ProjectSupplierBalance extends SupplierBalance {
  /** NCC đã xóa mềm khỏi danh mục: số vẫn đọc từ sổ, nhưng không có trang sổ NCC để mở. */
  supplierDeleted: boolean;
}

export interface ProjectLedger extends Omit<SupplierBalancesResult, "suppliers"> {
  suppliers: ProjectSupplierBalance[];
  rowsVisible: boolean;
  /** Chỉ có khi gọi `withRows` và `rowsVisible`. */
  rows?: ProjectLedgerRowView[];
  openings?: ProjectLedgerOpeningView[];
  rowCount?: number;
}

export interface LoadProjectLedgerOptions {
  /** `null` / không truyền = mọi NCC. */
  supplierIds?: readonly number[] | null;
  /** Nạp từng dòng sổ và số dư đầu kỳ (chỉ trả về khi người xem có quyền `cong-no-vt`). */
  withRows: boolean;
}

export async function loadProjectLedger(projectId: number, opts: LoadProjectLedgerOptions): Promise<ProjectLedger> {
  const rowsVisible = await authorize(projectId);
  const withRows = opts.withRows && rowsVisible;

  const [report, pending, rawRows, rawOpenings] = await Promise.all([
    // Lũy kế toàn bộ, như cột "Công nợ còn lại" của danh mục hợp đồng. Không truyền `partyIds`: cần mọi
    // NCC của công trình để dựng lựa chọn bộ lọc; lọc ở `buildSupplierBalances`.
    queryDetailReport({ ledgerType: "material", projectIds: [projectId], showZero: true }),
    loadPendingDeliveriesByProject(projectId),
    withRows ? loadProjectLedgerRows(projectId) : Promise.resolve(null),
    withRows ? loadProjectLedgerOpenings(projectId) : Promise.resolve(null),
  ]);
  const reportRows = report.rows.filter((r) => r.projectId === projectId);

  // Danh mục NCC: tên cho NCC chỉ có phiếu chưa chốt (không có dòng báo cáo mang tên) và cờ đã xóa mềm.
  const supplierIds = [...new Set([...reportRows.map((r) => r.partyId), ...pending.map((p) => p.supplierId)])];
  const catalogue = supplierIds.length
    ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, deletedAt: true } })
    : [];
  const deleted = new Set(catalogue.filter((s) => s.deletedAt != null).map((s) => s.id));
  const result = buildSupplierBalances(
    reportRows,
    pending,
    new Map(catalogue.map((s) => [s.id, s.name])),
    opts.supplierIds ?? null,
  );
  const balances = {
    ...result,
    suppliers: result.suppliers.map((s) => ({ ...s, supplierDeleted: deleted.has(s.supplierId) })),
  };

  if (!withRows || rawRows == null || rawOpenings == null) return { ...balances, rowsVisible };

  const shown = new Set(balances.suppliers.map((s) => s.supplierId));
  const supplierName = new Map(balances.options.map((o) => [o.id, o.name]));
  const entityName = new Map(reportRows.map((r) => [r.entityId, r.entityName]));
  const nameOfSupplier = (id: number) => supplierName.get(id) ?? `NCC #${id}`;

  const rows: ProjectLedgerRowView[] = rawRows
    .filter((r) => shown.has(r.partyId))
    .map((r) => ({
      id: r.id,
      date: isoDate(r.date),
      supplierId: r.partyId,
      supplierName: nameOfSupplier(r.partyId),
      entityId: r.entityId,
      transactionType: r.transactionType,
      invoiceNo: r.invoiceNo,
      invoiceDate: isoDateOrNull(r.invoiceDate),
      content: r.content,
      qty: r.qty == null ? null : decStr(toDec(r.qty)),
      itemName: r.itemName,
      incTt: decStr(toDec(r.incTt)),
      decTt: decStr(toDec(r.decTt)),
      incHd: decStr(toDec(r.incHd)),
      decHd: decStr(toDec(r.decHd)),
    }));
  const openings: ProjectLedgerOpeningView[] = rawOpenings
    .filter((o) => shown.has(o.partyId))
    .map((o) => ({
      supplierId: o.partyId,
      supplierName: nameOfSupplier(o.partyId),
      entityId: o.entityId,
      entityName: entityName.get(o.entityId) ?? `Chủ thể #${o.entityId}`,
      openingTt: decStr(o.openingTt),
      openingHd: decStr(o.openingHd),
    }));

  return { ...balances, rowsVisible, rows, openings, rowCount: rows.length };
}
