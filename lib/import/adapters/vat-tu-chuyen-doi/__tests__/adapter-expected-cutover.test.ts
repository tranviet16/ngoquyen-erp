/**
 * Unit: hợp đồng mốc giữa adapter chuyển đổi (ghi) và guard mốc toàn cục (đọc). `apply` LUÔN trả
 * `expected.cutoverDate = "2026-10-26"` hợp lệ — engine ghi nó vào `reviewJson.expected` cùng câu
 * UPDATE đặt `committed`; thiếu / sai mốc thì guard fail closed và chặn MỌI ghi vật tư.
 * Lớp đọc DB / ghi / đối soát được thay bằng giả để chỉ kiểm phần tạo `expected`.
 */
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/import/adapters/vat-tu-chuyen-doi/review-builder", () => ({
  reviewCutover: vi.fn(),
  prepareCutoverPlan: vi.fn(async () => ({
    blockingGroups: [],
    requiredAcks: [],
    ledgerRows: [],
    deliveries: [],
    v4: { total: 0 },
    views: {
      summary: { nhapLieu: { read: 0, skipped: [] }, openingRows: 0, csvRows: 0, deliveries: { kept: 0 } },
      payments: [],
      crossCutover: [],
    },
  })),
}));
vi.mock("@/lib/import/adapters/vat-tu-chuyen-doi/apply-cutover", () => ({
  applyCutoverPlan: vi.fn(async () => {
    calls.push("apply");
    return { ids: {}, created: {}, markerIds: [], counts: { openings: 0, markers: 0 } };
  }),
  freezeCutoverMarkers: vi.fn(async () => {
    calls.push("freeze");
  }),
}));
vi.mock("@/lib/import/adapters/vat-tu-chuyen-doi/verification-queries", () => ({
  runVerification: vi.fn(async () => {
    calls.push("verify");
    return { failures: [], view: { v1: [] } };
  }),
}));

import { VatTuChuyenDoiAdapter } from "@/lib/import/adapters/vat-tu-chuyen-doi/vat-tu-chuyen-doi.adapter";
import { CUTOVER_DATE, cutoverConstantsForReview } from "@/lib/import/adapters/vat-tu-chuyen-doi/cutover-constants";
import type { CutoverParsedData } from "@/lib/import/adapters/vat-tu-chuyen-doi/review-builder";
import type { ImportTx } from "@/lib/import/adapters/adapter-types";
import { MATERIAL_CUTOVER_ADAPTER, parseCutoverDate } from "@/lib/vat-tu-ncc/pair-scope";

describe("adapter vat-tu-chuyen-doi — expected.cutoverDate", () => {
  it("apply luôn trả expected.cutoverDate = 2026-10-26, guard mốc đọc được", async () => {
    const summary = await VatTuChuyenDoiAdapter.apply(
      {} as CutoverParsedData,
      {},
      {} as ImportTx,
      7,
    );

    expect(summary.expected).toBeDefined();
    expect(summary.expected?.cutoverDate).toBe("2026-10-26");
    // Đúng hàm guard dùng để đọc reviewJson.expected → không bao giờ fail closed vì thiếu mốc.
    expect(parseCutoverDate({ expected: summary.expected })?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    // Marker chỉ được đông cứng sau khi đối soát đạt.
    expect(calls).toEqual(["apply", "verify", "freeze"]);
  });

  it("hằng mốc và bản lưu vào reviewJson thống nhất; guard đọc run của đúng adapter này", () => {
    expect(CUTOVER_DATE.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(cutoverConstantsForReview().cutoverDate).toBe("2026-10-26");
    expect(parseCutoverDate({ expected: cutoverConstantsForReview() })?.getTime()).toBe(CUTOVER_DATE.getTime());
    expect(VatTuChuyenDoiAdapter.name).toBe(MATERIAL_CUTOVER_ADAPTER);
  });
});
