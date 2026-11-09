/**
 * Adapter `vat-tu-chuyen-doi`: một lần chạy import có duyệt nạp đủ dữ liệu Excel công nợ vật tư
 * (file tổng Nhập Liệu + Số Dư, CSV lũy kế, các file theo dõi) cho cả thư mục `Quản Lý Công Nợ`.
 *
 * - parse: parser thuần của gói (phase 6); lựa chọn ngày nằm trong mapping nên review / apply parse
 *   lại theo mapping (ghi nhớ theo lựa chọn).
 * - Khóa: không khai báo `lockScope`. review / apply tự khóa MỌI NCC đã giải (ánh xạ đã lưu + tự
 *   điền) một lần theo thứ tự tăng dần, sau khóa dòng run và trước mọi đọc được guard bảo vệ — cùng
 *   thứ tự "dòng run → NCC" với commit / hoàn tác của engine (tránh deadlock).
 * - review: xem trước chạy thử đúng đường ghi + đối soát rồi rollback; commit chỉ kiểm lại.
 * - apply: ghi theo thứ tự, đối soát trên chính transaction (V2–V4 lệch → ném lỗi, rollback toàn bộ;
 *   V1 lệch phải đúng số đã xác nhận ở xem trước), đông cứng marker sau khi đối soát đạt, trả `expected` (mốc, kết quả đối soát, danh mục
 *   đã tạo, số dòng) để engine ghi vào `reviewJson.expected` cùng lúc đổi `committed`.
 */

import type { ImportAdapter, ImportMapping, ImportSummary, ImportTx } from "../adapter-types";
import { ImportError, ImportPreconditionError } from "../../import-errors";
import { applyCutoverPlan, freezeCutoverMarkers } from "./apply-cutover";
import { parseCutoverBundle } from "./cutover-bundle-parser";
import { CUTOVER_DATE, CUTOVER_MARKER_FROM, LIFETIME_DATE, OPENING_AS_OF } from "./cutover-constants";
import { flattenBlocking } from "./cutover-plan";
import { isoDay } from "./day-utils";
import { cutoverMappingSchema, isAcked } from "./mapping-keys";
import { prepareCutoverPlan, reviewCutover, type CutoverParsedData } from "./review-builder";
import { runVerification } from "./verification-queries";

async function applyCutover(data: CutoverParsedData, mapping: ImportMapping, tx: ImportTx, runId: number): Promise<ImportSummary> {
  const plan = await prepareCutoverPlan(data, mapping, tx, runId, { lockAdapter: true });
  const blocking = flattenBlocking(plan.blockingGroups);
  if (blocking.length > 0) throw new ImportPreconditionError(`Còn lỗi chặn lúc ghi: ${blocking.slice(0, 3).join("; ")}`);
  const missing = plan.requiredAcks.filter((code) => !isAcked(mapping, code));
  if (missing.length > 0) throw new ImportPreconditionError(`Còn ${missing.length} mục chưa xác nhận: ${missing.slice(0, 3).join(", ")}`);

  const applied = await applyCutoverPlan(tx, plan, runId, { dryRun: false });
  const outcome = await runVerification(tx, plan, applied.ids, runId, mapping);
  if (outcome.failures.length > 0) {
    throw new ImportError(`Đối soát lệch — không ghi gì: ${outcome.failures.join(" | ")}`);
  }
  const unackedV1 = outcome.view.v1.filter((r) => !r.ok && !r.acked);
  if (unackedV1.length > 0) {
    throw new ImportPreconditionError(
      `Neo V1 lệch chưa được xác nhận hoặc khác số đã xem ở xem trước (${unackedV1
        .slice(0, 3)
        .map((r) => `${r.file}: chênh ${Math.round(r.diff).toLocaleString("vi-VN")}`)
        .join("; ")}) — Lưu & tính lại rồi xác nhận`,
    );
  }
  await freezeCutoverMarkers(tx, applied.markerIds);

  const summary = plan.views.summary;
  const written = applied.counts.openings + plan.ledgerRows.length + plan.deliveries.length + applied.counts.markers;
  const skipped =
    summary.nhapLieu.skipped.length +
    plan.v4.total +
    plan.views.payments.filter((p) => p.match).length +
    plan.views.crossCutover.filter((x) => x.decision === "drop").length;
  return {
    rowsTotal: summary.nhapLieu.read + summary.openingRows + summary.csvRows + summary.deliveries.kept,
    rowsImported: written,
    rowsSkipped: skipped,
    errors: [],
    expected: {
      cutoverDate: isoDay(CUTOVER_DATE),
      lifetimeDate: isoDay(LIFETIME_DATE),
      openingAsOf: isoDay(OPENING_AS_OF),
      cutoverMarkerFrom: isoDay(CUTOVER_MARKER_FROM),
      verification: outcome.view,
      created: applied.created,
      counts: applied.counts,
    },
  };
}

export const VatTuChuyenDoiAdapter: ImportAdapter<ImportMapping, CutoverParsedData> = {
  name: "vat-tu-chuyen-doi",
  label: "Chuyển đổi công nợ vật tư từ Excel (cả thư mục)",
  acceptsBundle: true,
  supportsRollback: true,
  mappingSchema: cutoverMappingSchema,

  async parse(_buffer, ctx) {
    const bundle = ctx?.bundle;
    if (!bundle) throw new ImportError("Adapter chuyển đổi nhận cả thư mục — chọn thư mục \"Quản Lý Công Nợ\"");
    const files = bundle.files.map((f) => ({ path: f.path, buffer: f.buffer }));
    const base = parseCutoverBundle(files);
    const rows = [
      ...(base.mainFile?.nhapLieu.rows ?? []).map((r) => r.sourceKey),
      ...(base.mainFile?.openingBalances ?? []).map((r) => r.sourceKey),
      ...(base.csv?.rows ?? []).map((r) => r.sourceKey),
      ...base.deliveries.map((d) => `${d.file}!${d.ref.cell}`),
    ].map((sourceKey, rowIndex) => ({ rowIndex, data: { sourceKey } }));
    return {
      rows,
      conflicts: [],
      meta: { files: files.length, trackingFiles: base.trackingFiles.length, cutoverDate: isoDay(CUTOVER_DATE) },
      files,
      base,
    };
  },

  validate() {
    // Lỗi cấu trúc / ngày của parser hiện trong phần duyệt (kèm vị trí ô), không phải lỗi từng dòng.
    return { valid: true, errors: [] };
  },

  review(data, mapping, db, ctx) {
    return reviewCutover(data, mapping, db, ctx);
  },

  apply(data, mapping, tx, importRunId) {
    return applyCutover(data, mapping, tx as ImportTx, importRunId);
  },
};
