/**
 * Số TT lấy từ cặp Nam Hương × Trại Chuối thật (Số Dư 59.868.420; CSV "Ngô quyền Trại chuối"
 * G 3.458.269.420, H+I 3.317.761.000; Nhập Liệu 2026 LH 580.640.000,32 / Trả 500.000.000). Vế HĐ
 * chọn cho khớp (CSV trong thư mục xuất ngày 26/7 nên HĐ thật lệch phần phát sinh sau đó).
 */
import { describe, expect, it } from "vitest";
import { evaluatePairLifetime, lifetimeConsequence } from "../pair-lifetime";

const S = { tt: 59_868_420, hd: -55_712_852 };
const CSV = { lhTt: 3_458_269_420, paidTt: 3_317_761_000, lhHd: 3_015_776_812, paidHd: 3_142_289_664, refError: false };
const NL = { lhTt: 580_640_000.32, paidTt: 500_000_000, lhHd: 429_200_000, paidHd: 500_000_000 };

describe("evaluatePairLifetime", () => {
  it("Nam Hương × Trại Chuối: net trước 2026 = 59.868.420 (±1 đồng) → mặc định lũy kế", () => {
    const r = evaluatePairLifetime(S, CSV, NL);
    expect(Math.abs((r.computed?.tt ?? 0) - 59_868_420)).toBeLessThanOrEqual(1);
    expect(r.matchTt).toBe(true);
    expect(r.matchHd).toBe(true);
    expect(r.defaultDecision).toBe(1);
    expect(r.lockReasons).toEqual([]);
    expect(r.lifetime).toEqual({
      layHangTt: 2_877_629_419.68,
      thanhToanTt: 2_817_761_000,
      layHangHd: 2_586_576_812,
      thanhToanHd: 2_642_289_664,
    });
    expect(lifetimeConsequence(r, S)).toBeNull();
  });

  it("cặp lệch HĐ 100.000.000 → mặc định ròng; vẫn chọn lũy kế được (kèm hậu quả)", () => {
    const r = evaluatePairLifetime(S, { ...CSV, lhHd: CSV.lhHd + 100_000_000 }, NL);
    expect(r.matchTt).toBe(true);
    expect(r.matchHd).toBe(false);
    expect(r.diff?.hd).toBe(100_000_000);
    expect(r.defaultDecision).toBe(0);
    expect(r.lockReasons).toEqual([]);
    expect(lifetimeConsequence(r, S)).toContain("HĐ 44.287.148 thay vì -55.712.852");
  });

  it("thành phần âm → cấm chọn lũy kế", () => {
    const r = evaluatePairLifetime({ tt: 0, hd: 0 }, { ...CSV, lhTt: 100_000_000, paidTt: 0 }, NL);
    expect(r.lockReasons.some((x) => x.startsWith("Thành phần âm: G − LH26"))).toBe(true);
    expect(r.defaultDecision).toBe(0);
  });

  it("CSV thiếu cặp hoặc có #REF! → cấm chọn lũy kế", () => {
    const missing = evaluatePairLifetime(S, null, NL);
    expect(missing.computed).toBeNull();
    expect(missing.lockReasons).toEqual(["CSV không có cặp này"]);
    const ref = evaluatePairLifetime(S, { ...CSV, refError: true }, NL);
    expect(ref.lockReasons).toContain("CSV có ô #REF!");
    expect(ref.defaultDecision).toBe(0);
  });
});
