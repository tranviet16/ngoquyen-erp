import { test, expect } from "../fixtures/auth";
import type { APIRequestContext } from "@playwright/test";
import { SECURITY_ENDPOINTS, type SecRole, type SecEndpoint } from "./endpoints";

/**
 * Parametrized role × endpoint authorization matrix. Every cell asserts the
 * HTTP status against the verified expected-access table in endpoints.ts.
 *
 * `maxRedirects: 0` is mandatory — without it, an anonymous request would
 * follow the proxy's 307 to /login and report 200, masking the redirect.
 */

async function hit(ctx: APIRequestContext, ep: SecEndpoint): Promise<number> {
  const opts = { maxRedirects: 0, timeout: 20_000, failOnStatusCode: false };
  const res =
    ep.method === "POST"
      ? await ctx.post(ep.path, opts)
      : await ctx.get(ep.path, opts);
  return res.status();
}

test.describe("security: authz matrix", () => {
  test("every role × endpoint cell matches the expected-access table", async ({
    asAdmin,
    asViewer,
    asProjectUser,
    request,
  }) => {
    const ctxByRole: Record<SecRole, APIRequestContext> = {
      admin: asAdmin.request,
      viewer: asViewer.request,
      scoped: asProjectUser.request,
      anon: request,
    };
    const roles: SecRole[] = ["admin", "viewer", "scoped", "anon"];

    for (const ep of SECURITY_ENDPOINTS) {
      for (const role of roles) {
        const allowed = ep.expect[role];
        if (allowed === null) continue; // cell intentionally skipped
        const status = await hit(ctxByRole[role], ep);
        expect
          .soft(allowed, `${ep.name} [${role}] — got ${status}, expected one of ${allowed}`)
          .toContain(status);
      }
    }
  });
});
