import { test, expect } from "../fixtures/auth";

/**
 * Auth-bypass attempts. Confirms the three syntactic guarantees:
 *  (a) no cookie         → proxy blocks (307 redirect to /login)
 *  (b) tampered cookie   → slips past proxy, handler rejects (401)
 *  (c) insufficient role → authenticated but ACL-denied (403)
 */
test.describe("security: auth bypass", () => {
  test("(a) no cookie → proxy redirects a protected route to /login", async ({ request }) => {
    const res = await request.get("/api/notifications", { maxRedirects: 0, failOnStatusCode: false });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"] ?? "").toContain("/login");
  });

  test("(b) tampered session cookie → handler returns 401", async ({ request }) => {
    // A syntactically-present but garbage cookie passes the proxy's
    // presence-only check, then fails handler-side session validation.
    const res = await request.get("/api/notifications", {
      headers: { cookie: "nqerp.session_token=tampered.invalid.value" },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test("(c) valid viewer session on an ACL-gated route → 403", async ({ asViewer }) => {
    // viewer has no module access to any cong-no / thanh-toan module.
    const res = await asViewer.request.get(
      "/api/cong-no/cascade-projects?ledgerType=material",
      { maxRedirects: 0, failOnStatusCode: false },
    );
    expect(res.status()).toBe(403);
  });
});
