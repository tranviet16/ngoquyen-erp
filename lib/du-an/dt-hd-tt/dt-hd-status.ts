/**
 * Tình trạng lấy hóa đơn của một dòng dự toán — đúng quy tắc của file đội ('Theo Dõi VT theo NCC'
 * cột U), KHÔNG dùng `bucketOf` của tab Cân đối (nhãn và sai số khác):
 *   1. KL dự toán ≤ 0: có giá trị DT → "Chưa có HĐ" (chưa có HĐ) / "Theo dõi theo giá trị"; không → "".
 *   2. KL HĐ = 0 và giá trị HĐ = 0 → "Chưa có HĐ".
 *   3. Có dòng HĐ gán vào mà thiếu hệ số → "Chưa kết luận (thiếu hệ số)".
 *   4. KL HĐ = 0 (chỉ có giá trị) → "Theo dõi theo giá trị".
 *   5. Sai số 2 %: > DT·1,02 → "Vượt"; ≥ DT·0,98 → "Đủ"; còn lại → "Còn thiếu".
 */

export type DtHdStatus =
  | ""
  | "Chưa có HĐ"
  | "Chưa kết luận (thiếu hệ số)"
  | "Theo dõi theo giá trị"
  | "Vượt"
  | "Đủ"
  | "Còn thiếu";

/** Sai số so KL HĐ với KL dự toán ('Theo Dõi VT theo NCC'!O8). */
export const DT_HD_TOLERANCE = 0.02;

export interface DtHdStatusInput {
  qtyDt: number;
  valueDt: number;
  /** Σ SL × hệ số của dòng HĐ có hệ số (dòng thiếu hệ số không cộng). */
  qtyHd: number;
  valueHd: number;
  missingFactor: boolean;
}

export function dtHdStatus(s: DtHdStatusInput): DtHdStatus {
  if (s.qtyDt <= 0) {
    if (s.valueDt > 0) return s.valueHd === 0 ? "Chưa có HĐ" : "Theo dõi theo giá trị";
    return "";
  }
  if (s.qtyHd === 0 && s.valueHd === 0) return "Chưa có HĐ";
  if (s.missingFactor) return "Chưa kết luận (thiếu hệ số)";
  if (s.qtyHd === 0) return "Theo dõi theo giá trị";
  if (s.qtyHd > s.qtyDt * (1 + DT_HD_TOLERANCE)) return "Vượt";
  if (s.qtyHd >= s.qtyDt * (1 - DT_HD_TOLERANCE)) return "Đủ";
  return "Còn thiếu";
}

/** Đếm tình trạng cho dòng nhóm: "n thiếu | n vượt | n đủ | n chưa HĐ | n theo GT/thiếu hệ số". */
export function statusCounts(statuses: DtHdStatus[]): string {
  const n = (pred: (s: DtHdStatus) => boolean) => statuses.filter(pred).length;
  return [
    `${n((s) => s === "Còn thiếu")} thiếu`,
    `${n((s) => s === "Vượt")} vượt`,
    `${n((s) => s === "Đủ")} đủ`,
    `${n((s) => s === "Chưa có HĐ")} chưa HĐ`,
    `${n((s) => s === "Theo dõi theo giá trị" || s === "Chưa kết luận (thiếu hệ số)")} theo GT/thiếu hệ số`,
  ].join(" | ");
}
