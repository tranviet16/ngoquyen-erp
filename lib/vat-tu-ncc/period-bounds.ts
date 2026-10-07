/**
 * Biên kỳ chốt / kỳ đối chiếu vật tư NCC — module thuần (không Prisma/Next).
 *
 * Mọi ngày là ngày nghiệp vụ tại UTC 00:00 (xem lib/ledger/business-date.ts).
 * Quy tắc (validatePeriodBounds):
 *   1. from ≤ to.
 *   2. Không chồng lấn kỳ đã ký.
 *   3. from > mốc số dư ban đầu (phiếu tới mốc đó đã nằm trong số dư ban đầu).
 *   4. Không chồng lấn kỳ chưa ký; liền kề: kỳ mới bắt đầu đúng ngày sau marker gần
 *      nhất, hoặc trùng khít một marker chưa ký (chốt lại idempotent). Marker đã có
 *      (selfId) phải bắt đầu ngay sau marker liền trước nó.
 */

export interface PeriodMarker {
  id: number;
  from: Date;
  to: Date;
  signed: boolean;
}

export interface PeriodRangeDates {
  from: Date;
  to: Date;
}

export interface PeriodBoundsContext {
  /** Mọi marker (supplier_reconciliations chưa xoá) của NCC. */
  markers: PeriodMarker[];
  /** Mốc số dư ban đầu muộn nhất của NCC (sổ vật tư); null = chưa có số dư ban đầu. */
  openingAsOf: Date | null;
}

const DAY_MS = 86_400_000;

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** "dd/mm/yyyy" theo UTC (ngày nghiệp vụ). */
export function formatDmy(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

const rangeLabel = (from: Date, to: Date) => `${formatDmy(from)} – ${formatDmy(to)}`;

/** Ngày 26 đầu tiên ≥ `from` (chính `from` nếu `from` là ngày 26). */
export function nextDay26(from: Date): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const day26 = new Date(0);
  if (from.getUTCDate() <= 26) {
    day26.setUTCFullYear(y, m, 26);
  } else {
    day26.setUTCFullYear(y, m + 1, 26); // setUTCFullYear tự cuộn tháng 12 → tháng 1 năm sau
  }
  return day26;
}

/** Kỳ chuẩn 27→26 chứa ngày `d`. */
export function standardPeriodContaining(d: Date): PeriodRangeDates {
  const from = new Date(0);
  if (d.getUTCDate() >= 27) from.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth(), 27);
  else from.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth() - 1, 27);
  return { from, to: nextDay26(from) };
}

/** Marker có periodTo muộn nhất (ký hoặc chưa ký). */
export function latestMarkerOf<T extends PeriodMarker>(markers: T[]): T | null {
  let latest: T | null = null;
  for (const m of markers) if (!latest || m.to.getTime() > latest.to.getTime()) latest = m;
  return latest;
}

const overlaps = (a: PeriodRangeDates, b: PeriodRangeDates) =>
  a.from.getTime() <= b.to.getTime() && a.to.getTime() >= b.from.getTime();

const sameRange = (a: PeriodRangeDates, b: PeriodRangeDates) =>
  a.from.getTime() === b.from.getTime() && a.to.getTime() === b.to.getTime();

/**
 * Kiểm tra biên kỳ. Trả về thông báo lỗi tiếng Việt hoặc null khi hợp lệ.
 * `selfId`: marker đang được sửa/ký (bỏ khỏi so sánh chồng lấn).
 */
export function validatePeriodBounds(
  range: PeriodRangeDates,
  ctx: PeriodBoundsContext,
  selfId?: number,
): string | null {
  const { from, to } = range;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "Ngày kỳ không hợp lệ.";
  if (from.getTime() > to.getTime()) return "Từ ngày phải nhỏ hơn hoặc bằng đến ngày.";

  // Kỳ mới trùng khít một marker chưa ký = chốt lại marker đó.
  let effectiveSelfId = selfId;
  if (effectiveSelfId === undefined) {
    const exact = ctx.markers.find((m) => !m.signed && sameRange(m, range));
    if (exact) effectiveSelfId = exact.id;
  }
  const others = ctx.markers.filter((m) => m.id !== effectiveSelfId);

  const signedOverlap = others.find((m) => m.signed && overlaps(m, range));
  if (signedOverlap) {
    return `Kỳ ${rangeLabel(from, to)} chồng lấn kỳ đã ký ${rangeLabel(signedOverlap.from, signedOverlap.to)}.`;
  }

  if (ctx.openingAsOf) {
    const minFrom = addDays(ctx.openingAsOf, 1);
    if (from.getTime() < minFrom.getTime()) {
      return (
        `Kỳ phải bắt đầu từ ${formatDmy(minFrom)} trở đi: phiếu tới ngày ${formatDmy(ctx.openingAsOf)} ` +
        `đã nằm trong số dư ban đầu của NCC.`
      );
    }
  }

  const unsignedOverlap = others.find((m) => overlaps(m, range));
  if (unsignedOverlap) {
    return (
      `Kỳ ${rangeLabel(from, to)} chồng lấn kỳ chưa ký ${rangeLabel(unsignedOverlap.from, unsignedOverlap.to)}. ` +
      `Chốt lại đúng biên kỳ đó hoặc xoá kỳ đó trước.`
    );
  }

  if (effectiveSelfId === undefined) {
    // Kỳ mới: liền kề marker gần nhất.
    const latest = latestMarkerOf(others);
    if (latest) {
      const expected = addDays(latest.to, 1);
      if (from.getTime() !== expected.getTime()) {
        return (
          `Kỳ mới phải bắt đầu ${formatDmy(expected)} — ngay sau kỳ gần nhất ` +
          `${rangeLabel(latest.from, latest.to)}${latest.signed ? " (đã ký)" : " (chưa ký)"}.`
        );
      }
    }
  } else {
    // Marker đã có: liền kề marker liền trước nó.
    const before = latestMarkerOf(others.filter((m) => m.to.getTime() < from.getTime()));
    if (before) {
      const expected = addDays(before.to, 1);
      if (from.getTime() !== expected.getTime()) {
        return (
          `Kỳ phải bắt đầu ${formatDmy(expected)} — ngay sau kỳ liền trước ` +
          `${rangeLabel(before.from, before.to)}.`
        );
      }
    }
  }
  return null;
}

/**
 * Gợi ý kỳ tiếp theo.
 * - Có marker: `from` = ngày sau marker gần nhất (bắt buộc bởi quy tắc liền kề; không nhảy
 *   tới phiếu sớm nhất vì sẽ vi phạm liền kề), nâng lên ngày sau mốc số dư ban đầu nếu muộn hơn.
 * - Chưa có marker: `from` = max(ngày sau mốc số dư ban đầu, phiếu sớm nhất chưa có event).
 * `to` = ngày 26 đầu tiên ≥ `from`. Trả null khi không có căn cứ nào.
 */
export function suggestNextPeriod(input: {
  latestMarkerTo: Date | null;
  openingAsOf: Date | null;
  earliestOpenDeliveryDate: Date | null;
}): PeriodRangeDates | null {
  const candidates: Date[] = [];
  if (input.openingAsOf) candidates.push(addDays(input.openingAsOf, 1));
  if (input.latestMarkerTo) candidates.push(addDays(input.latestMarkerTo, 1));
  else if (input.earliestOpenDeliveryDate) candidates.push(input.earliestOpenDeliveryDate);
  if (candidates.length === 0) return null;
  const from = new Date(Math.max(...candidates.map((d) => d.getTime())));
  return { from, to: nextDay26(from) };
}
