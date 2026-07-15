import { describe, expect, it } from "vitest";
import { RISK_MANIFEST, RISK_MANIFEST_VERSION } from "@/test/risk-manifest";
import { REQUIRED_P0_TESTS } from "@/test/risk-manifest-types";

describe("risk manifest", () => {
  it("uses the current schema version and unique route paths", () => {
    expect(RISK_MANIFEST_VERSION).toBe(1);
    expect(new Set(RISK_MANIFEST.map((record) => record.path)).size).toBe(RISK_MANIFEST.length);
  });

  it("gives every P0 record the required security and recovery contracts", () => {
    for (const record of RISK_MANIFEST.filter((item) => item.tier === "P0")) {
      expect(record.owners.technical).toBeTruthy();
      expect(record.owners.business).toBeTruthy();
      expect(record.recovery.killSwitch).toBeTruthy();
      expect(record.recovery.runbook).toBeTruthy();
      for (const test of REQUIRED_P0_TESTS) expect(record.requiredTests).toContain(test);
    }
  });
});
