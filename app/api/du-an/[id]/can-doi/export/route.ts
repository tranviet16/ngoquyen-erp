import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  ModuleRequestError,
  requireReleasedModuleRequest,
} from "@/lib/acl/released-module-request";
import { listCanDoiVatTu } from "@/lib/du-an/can-doi-service";
import { BUCKET_LABELS, type CanDoiRow, type CanDoiSubtotal } from "@/lib/du-an/can-doi-metrics";

/**
 * Xuất bảng Cân đối vật tư ra .xlsx — một sheet, 3 nhóm cột (Lấy hóa đơn /
 * Thi công vs DT / TT vs HĐ) đặt cạnh nhau, nhóm theo hạng mục như trên UI.
 * Số liệu lấy từ cùng service với màn hình nên tổng luôn khớp on-screen.
 * Guard: quyền đọc du-an theo dự án (KHÔNG yêu cầu admin).
 */

const BASE_HEADERS = ["Mã", "Tên vật tư / công việc", "ĐVT", "Trạng thái"];
const HD_HEADERS = ["DT SL", "Dự toán (điều chỉnh)", "HĐ SL", "Hóa đơn đã lấy", "%HĐ", "Còn phải lấy HĐ"];
const TT_DT_HEADERS = ["TT SL", "%SL", "Giá DT", "Giá bq TT", "Chênh giá", "Chênh giá %", "Tác động giá"];
const TT_HD_HEADERS = ["Chênh SL", "Giá bq HĐ", "Chênh giá TT−HĐ", "Chênh tiền TT−HĐ"];

const COL_BASE = BASE_HEADERS.length; // 4
const COL_HD_START = COL_BASE; // 4
const COL_TT_DT_START = COL_HD_START + HD_HEADERS.length; // 10
const COL_TT_HD_START = COL_TT_DT_START + TT_DT_HEADERS.length; // 17
const TOTAL_COLS = COL_TT_HD_START + TT_HD_HEADERS.length; // 21

const QTY_COLS = new Set([4, 6, 10, 17]);
const PCT_COLS = new Set([8, 11, 15]);
// money = every remaining numeric column
const MONEY_COLS = new Set([5, 7, 9, 12, 13, 14, 16, 18, 19, 20]);

type Cell = string | number;

function n(v: number | null | undefined): Cell {
  return v == null || v === 0 ? "" : v;
}

/** % cells: null = suppressed → blank; 0 = a real 0% (matches on-screen rendering) */
function pv(v: number | null | undefined): Cell {
  return v == null ? "" : v;
}

function rowCells(r: CanDoiRow): Cell[] {
  return [
    r.itemCode,
    r.itemName + (r.kind === "invoice-only" ? " (ngoài DT)" : "") + (r.unitMismatch ? " (khác ĐVT)" : ""),
    r.unit,
    BUCKET_LABELS[r.bucket],
    n(r.estimateQty),
    n(r.estimateAdjustedTotalVnd),
    r.unitMismatch ? "" : n(r.qtyHd),
    n(r.invoiceAmountVnd),
    pv(r.pctHdMoney),
    r.remainingIsOverride ? r.remainingInvoiceVnd : n(r.remainingInvoiceVnd),
    n(r.qtyTt),
    pv(r.pctTtQty),
    n(r.estimateUnitPrice),
    n(r.avgPriceTt),
    n(r.priceDiffTtDt),
    pv(r.priceDiffTtDtPct),
    n(r.priceImpactTt),
    n(r.qtyDiffTtHd),
    n(r.avgPriceHd),
    n(r.priceDiffTtHd),
    n(r.diffActualVsInvoiceVnd),
  ];
}

function subtotalCells(label: string, s: CanDoiSubtotal): Cell[] {
  const cells: Cell[] = new Array(TOTAL_COLS).fill("");
  cells[0] = label;
  // Σ thực tế không có cột riêng trong layout — ghi dạng chữ ở cột Tên để
  // không bị đọc nhầm thành đơn giá bình quân
  cells[1] = s.actualAmountVnd !== 0 ? `Thực tế: ${s.actualAmountVnd.toLocaleString("vi-VN")} ₫` : "";
  cells[5] = n(s.estimateAdjustedTotalVnd);
  cells[7] = n(s.invoiceAmountVnd);
  cells[8] = pv(s.pctHdMoney);
  cells[9] = n(s.remainingInvoiceVnd);
  cells[20] = n(s.diffActualVsInvoiceVnd);
  return cells;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    await requireReleasedModuleRequest("du-an", {
      minLevel: "read",
      scope: { kind: "project", projectId },
    });
  } catch (err) {
    if (err instanceof ModuleRequestError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.reason === "unauthorized" ? 401 : 403 },
      );
    }
    throw err;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { code: true, name: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await listCanDoiVatTu(projectId);

  const title = `CÂN ĐỐI VẬT TƯ — ${project.name}`;
  const groupHeaderRow: Cell[] = new Array(TOTAL_COLS).fill("");
  groupHeaderRow[COL_HD_START] = "Lấy hóa đơn";
  groupHeaderRow[COL_TT_DT_START] = "Thi công vs Dự toán";
  groupHeaderRow[COL_TT_HD_START] = "TT vs HĐ";
  const headerRow: Cell[] = [...BASE_HEADERS, ...HD_HEADERS, ...TT_DT_HEADERS, ...TT_HD_HEADERS];

  const aoa: Cell[][] = [[title], [], groupHeaderRow, headerRow];
  const groupHeaderRowIdxs: number[] = [];
  const boldRowIdxs: number[] = [];

  for (const g of data.groups) {
    groupHeaderRowIdxs.push(aoa.length);
    const gh: Cell[] = new Array(TOTAL_COLS).fill("");
    gh[0] = `${g.code} — ${g.name}`;
    aoa.push(gh);
    for (const r of g.rows) aoa.push(rowCells(r));
    boldRowIdxs.push(aoa.length);
    aoa.push(subtotalCells(`Cộng ${g.name}`, g.subtotal));
  }
  boldRowIdxs.push(aoa.length);
  aoa.push(subtotalCells("TỔNG CỘNG", data.total));

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: TOTAL_COLS - 1 } },
    { s: { r: 2, c: COL_HD_START }, e: { r: 2, c: COL_TT_DT_START - 1 } },
    { s: { r: 2, c: COL_TT_DT_START }, e: { r: 2, c: COL_TT_HD_START - 1 } },
    { s: { r: 2, c: COL_TT_HD_START }, e: { r: 2, c: TOTAL_COLS - 1 } },
    ...groupHeaderRowIdxs.map((r) => ({ s: { r, c: 0 }, e: { r, c: TOTAL_COLS - 1 } })),
  ];
  ws["!merges"] = merges;

  const cols: XLSX.ColInfo[] = [{ wch: 12 }, { wch: 36 }, { wch: 8 }, { wch: 10 }];
  for (let i = COL_BASE; i < TOTAL_COLS; i++) cols.push({ wch: 15 });
  ws["!cols"] = cols;

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let R = 4; R <= range.e.r; R++) {
    for (let C = COL_BASE; C < TOTAL_COLS; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell || cell.t !== "n") continue;
      if (PCT_COLS.has(C)) cell.z = "0.0%";
      else if (QTY_COLS.has(C)) cell.z = "#,##0.00";
      else if (MONEY_COLS.has(C)) cell.z = "#,##0";
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cân đối vật tư");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const safeCode = project.code.replace(/[^\w-]+/g, "-");

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="can-doi-vat-tu-${safeCode}-${ymd}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
