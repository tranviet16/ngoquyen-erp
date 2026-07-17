import { describe, expect, it } from "vitest";
import { ACCESS_LEVELS, LEVEL_RANK, MODULE_LEVELS, isValidLevelForModule } from "../modules";

describe("canonical access levels", () => {
  it("orders all 4 by rank", () => {
    for (const granted of ACCESS_LEVELS) {
      for (const required of ACCESS_LEVELS) {
        expect(LEVEL_RANK[granted] >= LEVEL_RANK[required]).toBe(
          ACCESS_LEVELS.indexOf(granted) >= ACCESS_LEVELS.indexOf(required),
        );
      }
    }
  });

  it("allows create only on record modules", () => {
    for (const moduleKey of [
      "du-an", "vat-tu-ncc", "cong-no-vt", "cong-no-nc", "thanh-toan.ke-hoach",
      "van-hanh.cong-viec", "van-hanh.phieu-phoi-hop",
    ] as const) {
      expect(isValidLevelForModule(moduleKey, "create")).toBe(true);
    }
    expect(MODULE_LEVELS["thanh-toan.tong-hop"]).toEqual(["read"]);
    expect(MODULE_LEVELS["admin.permissions"]).toEqual([]);
  });

  it("rejects the removed admin level at runtime", () => {
    expect(isValidLevelForModule("du-an", "admin" as never)).toBe(false);
  });
});
