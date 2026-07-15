import { describe, expect, it } from "vitest";
import { sanitizeEvent, sanitizeSentryEvent } from "@/lib/observability/event-sanitizer";

describe("sanitizeEvent", () => {
  it("keeps allowlisted scalar context and drops sensitive fields", () => {
    expect(sanitizeEvent({
      name: "auth.denied", severity: "P0", route: "/api/export/excel", token: "secret", body: "payload", amount: 1,
    })).toEqual({ name: "auth.denied", severity: "P0", route: "/api/export/excel" });
  });

  it("normalizes routes and rejects free-form reason values", () => {
    expect(sanitizeEvent({
      name: "api.failed",
      severity: "P1",
      route: "/api/users/42?token=secret",
      reason: "user@example.com",
    })).toEqual({ name: "api.failed", severity: "P1", route: "/api/users/:id" });
  });

  it("removes request, user, breadcrumbs and sensitive exception details", () => {
    const result = sanitizeSentryEvent({
      type: undefined,
      message: "payment failed for user@example.com amount 1000",
      request: { cookies: { session: "secret" }, data: "payload" },
      user: { email: "user@example.com" },
      breadcrumbs: [{ message: "token=secret" }],
      tags: { severity: "P0", email: "user@example.com", correlation_id: "request-1" },
      exception: {
        values: [{
          type: "DatabaseError",
          value: "password=secret",
          stacktrace: { frames: [{ filename: "C:\\Users\\Admin\\app\\route.ts", function: "GET", lineno: 12 }] },
        }],
      },
    });

    expect(result).toMatchObject({
      message: "Application error details redacted",
      tags: { severity: "P0", correlation_id: "request-1" },
      exception: { values: [{ type: "DatabaseError", value: "Error details redacted" }] },
    });
    expect(result).not.toHaveProperty("request");
    expect(result).not.toHaveProperty("user");
    expect(result).not.toHaveProperty("breadcrumbs");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("user@example.com");
  });
});
