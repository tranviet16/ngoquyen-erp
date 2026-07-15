import { describe, expect, it } from "vitest";
import { sanitizeEvent } from "@/lib/observability/event-sanitizer";

describe("sanitizeEvent", () => {
  it("keeps allowlisted scalar context and drops sensitive fields", () => {
    expect(sanitizeEvent({
      name: "auth.denied", severity: "P0", route: "/api/export/excel", token: "secret", body: "payload", amount: 1,
    })).toEqual({ name: "auth.denied", severity: "P0", route: "/api/export/excel" });
  });
});
