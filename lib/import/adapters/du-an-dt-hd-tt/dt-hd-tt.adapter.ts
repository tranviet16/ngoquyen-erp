/**
 * Adapter "du-an-dt-hd-tt": nhập workbook "Cân đối vật tư" của đội (Dự toán, Hóa đơn, Thực tế nhập,
 * Chi thực tế, ánh xạ, đầu mối) vào một công trình CÓ SẴN, đồng bộ dự toán theo file, thay giao dịch
 * hóa đơn cũ và sinh giao dịch HĐ cho các tab cũ. Hoàn tác được (mọi dòng mang importRunId; dòng bị
 * thay khôi phục theo tập lưu lúc commit — xem du-an-book-rollback.ts).
 *
 * Ánh xạ (mapping mặc định số nguyên | null):
 *   project:target       → id công trình (bắt buộc, không tự tạo);
 *   supplier:<MST|tên>   → id NCC ERP (khi không tự gắn được theo MST / tên);
 *   ack:<mã>             → 1 (xác nhận: thay giao dịch cũ, đồng bộ dự toán, ô không đọc được).
 * Cổng kiểm: tính lại ba báo cáo từ dữ liệu sẽ ghi, so với số trong chính file (golden-gates.ts).
 */

import type { ImportAdapter, ImportMapping } from "../adapter-types";
import { applyImport } from "./apply-import";
import { planImport } from "./import-plan";
import { parseDtHdTtWorkbook } from "./parse-workbook";
import { reviewPayload } from "./review-payload";
import type { DtHdTtWorkbook } from "./workbook-types";

export const DT_HD_TT_ADAPTER_NAME = "du-an-dt-hd-tt";

export const duAnDtHdTtAdapter: ImportAdapter<ImportMapping, DtHdTtWorkbook> = {
  name: DT_HD_TT_ADAPTER_NAME,
  label: "Dự án xây dựng – Đối chiếu DT-HĐ-TT (file Cân đối vật tư của đội)",
  supportsRollback: true,

  async parse(buffer) {
    return parseDtHdTtWorkbook(buffer);
  },

  validate() {
    // Lỗi dữ liệu được liệt kê ở bước duyệt (cần công trình, NCC, Cài đặt để kiểm).
    return { valid: true, errors: [] };
  },

  async review(data, mapping, db) {
    const plan = await planImport(data, mapping, db);
    return { payload: reviewPayload(data, plan), blocking: plan.blocking, requiredAcks: plan.requiredAcks.map((a) => a.code) };
  },

  async apply(data, mapping, tx, importRunId) {
    const plan = await planImport(data, mapping, tx);
    if (plan.blocking.length > 0 || !plan.inputs || !plan.dtSync) {
      throw new Error(`Không ghi được: ${plan.blocking[0] ?? "chưa đủ dữ liệu duyệt"}`);
    }
    return applyImport(data, plan, tx, importRunId);
  },
};
