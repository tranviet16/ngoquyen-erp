import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";

describe("proxy transport security headers", () => {
  const originalAuthUrl = process.env.BETTER_AUTH_URL;
  const originalTrustedOrigins = process.env.TRUSTED_ORIGINS;

  beforeAll(() => {
    process.env.BETTER_AUTH_URL = "http://100.116.178.88:3001";
    process.env.TRUSTED_ORIGINS =
      "http://admin-pc:3001,https://admin-pc.tail8998df.ts.net";
  });

  afterAll(() => {
    if (originalAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = originalAuthUrl;
    if (originalTrustedOrigins === undefined) delete process.env.TRUSTED_ORIGINS;
    else process.env.TRUSTED_ORIGINS = originalTrustedOrigins;
  });

  it("does not trust a spoofed HTTPS forwarding header on direct HTTP", async () => {
    const request = new NextRequest("http://100.116.178.88:3001/login", {
      headers: { "x-forwarded-proto": "https" },
    });
    const response = await proxy(request);
    const csp = response.headers.get("Content-Security-Policy");

    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBeNull();
  });

  it("does not allow a spoofed HTTP forwarding header to downgrade HTTPS", async () => {
    const request = new NextRequest("http://admin-pc.tail8998df.ts.net/login", {
      headers: {
        host: "admin-pc.tail8998df.ts.net",
        "x-forwarded-proto": "http",
      },
    });
    const response = await proxy(request);
    const csp = response.headers.get("Content-Security-Policy");

    expect(csp).toContain("upgrade-insecure-requests");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("limits a spoofed HTTPS host to the caller's own response", async () => {
    const spoofedRequest = new NextRequest("http://100.116.178.88:3001/login", {
      headers: { host: "admin-pc.tail8998df.ts.net" },
    });
    const canonicalRequest = new NextRequest("http://100.116.178.88:3001/login");

    const spoofedResponse = await proxy(spoofedRequest);
    const canonicalResponse = await proxy(canonicalRequest);

    expect(spoofedResponse.headers.get("Content-Security-Policy")).toContain(
      "upgrade-insecure-requests",
    );
    expect(canonicalResponse.headers.get("Content-Security-Policy")).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("emits HSTS but not document CSP or COOP for HTTPS API responses", async () => {
    const request = new NextRequest("http://admin-pc.tail8998df.ts.net/api/health", {
      headers: { host: "admin-pc.tail8998df.ts.net" },
    });
    const response = await proxy(request);

    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBeNull();
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});
