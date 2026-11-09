/**
 * Mốc của lần chuyển đổi công nợ vật tư từ Excel. Mốc được ghi vào `reviewJson` của
 * run để guard mốc toàn cục đọc lại (xem `cutoverConstantsForReview`).
 */

import { isoDay, mustUtcDay } from "./day-utils";

/** Hết ngày này dữ liệu tiền lấy từ Excel; từ 27/10/2026 ERP là nguồn. */
export const CUTOVER_DATE = mustUtcDay(2026, 10, 26);

/** Ngày của 2 dòng lũy kế: nằm ngoài cửa sổ Kỳ chuẩn T1/2026 (bắt đầu 27/12) và tuần ISO 1/2026. */
export const LIFETIME_DATE = mustUtcDay(2025, 12, 26);

/** asOf của số dư ban đầu: sheet ghi "01/01/2026" nghĩa là đầu ngày, tức cuối ngày 31/12/2025. */
export const OPENING_AS_OF = mustUtcDay(2025, 12, 31);

/** Đầu kỳ marker chuyển đổi 01/01/2026 → CUTOVER_DATE. */
export const CUTOVER_MARKER_FROM = mustUtcDay(2026, 1, 1);

/** Dung sai so tiền (đồng). */
export const AMOUNT_TOLERANCE = 1;

/** Biên ±ngày quanh biên khối dùng khi cảnh báo ngày nằm ngoài khối. */
export const BLOCK_DATE_TOLERANCE_DAYS = 7;

export interface CutoverConstantsJson {
  cutoverDate: string;
  lifetimeDate: string;
  openingAsOf: string;
  cutoverMarkerFrom: string;
  amountTolerance: number;
}

/** Bản JSON (yyyy-mm-dd) của các mốc để lưu vào `reviewJson`. */
export function cutoverConstantsForReview(): CutoverConstantsJson {
  return {
    cutoverDate: isoDay(CUTOVER_DATE),
    lifetimeDate: isoDay(LIFETIME_DATE),
    openingAsOf: isoDay(OPENING_AS_OF),
    cutoverMarkerFrom: isoDay(CUTOVER_MARKER_FROM),
    amountTolerance: AMOUNT_TOLERANCE,
  };
}
