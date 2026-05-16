import { test, expect } from "../fixtures/auth";

/**
 * Cross-user / IDOR checks — the *automatable* subset.
 *
 * Identity-scoped ACL: the same request resolves differently per caller, so a
 * lower-privilege identity cannot reach data a higher one can. Deep semantic
 * IDOR (e.g. "user B downloads user A's specific attachment file") requires
 * seeding a real stored file and is enumerated in SECURITY-MANUAL-REVIEW.md.
 */
test.describe("security: IDOR / cross-user", () => {
  test("ACL decision is per-identity, not shared — admin allowed, viewer denied", async ({
    asAdmin,
    asViewer,
  }) => {
    const path = "/api/cong-no/cascade-projects?ledgerType=material";
    const opts = { maxRedirects: 0, failOnStatusCode: false };

    const adminRes = await asAdmin.request.get(path, opts);
    const viewerRes = await asViewer.request.get(path, opts);

    expect(adminRes.status()).toBe(200);
    expect(viewerRes.status()).toBe(403);

    // The 403 body must not leak the protected payload.
    const viewerBody = await viewerRes.text();
    expect(viewerBody).not.toContain("\"projects\"");
  });

  test("attachment download of a non-owned / missing id does not 200 or leak metadata", async ({
    asViewer,
  }) => {
    const res = await asViewer.request.get("/api/tasks/1/attachments/999999999", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect([403, 404]).toContain(res.status());

    const body = await res.text();
    expect(body).not.toContain("filename");
    expect(body).not.toContain("mimeType");
  });
});
