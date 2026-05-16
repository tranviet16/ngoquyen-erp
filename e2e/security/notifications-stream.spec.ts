import { test, expect } from "../fixtures/auth";

/**
 * The SSE notifications stream cannot be asserted through Playwright's request
 * context — its body never ends, so `request.get` would hang until timeout.
 * We open it via `fetch` in the page, read only the response status, then
 * abort. Full stream-scoping behaviour is a SECURITY-MANUAL-REVIEW item.
 */
test.describe("security: notifications SSE stream", () => {
  test("authenticated user opens the stream (200); status is observable without hanging", async ({
    asAdmin,
  }) => {
    await asAdmin.goto("/"); // same-origin context so the relative fetch + cookie work
    const status = await asAdmin.evaluate(async () => {
      const ac = new AbortController();
      const res = await fetch("/api/notifications/stream", { signal: ac.signal });
      const code = res.status;
      ac.abort(); // stop the endless body immediately
      return code;
    });
    expect(status).toBe(200);
  });
});
