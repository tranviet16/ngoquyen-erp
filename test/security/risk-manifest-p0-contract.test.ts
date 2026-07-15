import { describe, expect, it } from "vitest";
import { RISK_MANIFEST } from "@/test/risk-manifest";

describe("P0 risk manifest contract", () => {
  it("keeps every P0 API surface owned, authorized, and recoverable", () => {
    const p0ApiRecords = RISK_MANIFEST.filter(
      (record) => record.kind === "api-route" && record.tier === "P0",
    );

    expect(p0ApiRecords.length).toBeGreaterThan(0);
    for (const record of p0ApiRecords) {
      expect(record.owners.technical).not.toBe("");
      expect(record.owners.business).not.toBe("");
      expect(record.authorization.status).toBe("defined");
      expect(record.recovery.killSwitch).not.toBe("");
      expect(record.recovery.runbook).not.toBe("");
    }
  });
});
