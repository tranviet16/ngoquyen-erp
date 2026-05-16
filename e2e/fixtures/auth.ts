import { test as base, expect, type Page, type Browser } from "@playwright/test";
import { E2E_PASSWORD, E2E_BASE_URL } from "../constants";

/**
 * Authenticated-page fixtures. Each fixture gets its OWN browser context — they
 * must not share Playwright's single `page` fixture, or signing in one role
 * would overwrite the session cookie of another when a test uses several roles.
 *
 * Sign-in goes through the real better-auth endpoint (so the session cookie is
 * genuine); better-auth rejects a POST with a missing/untrusted Origin, hence
 * the explicit `origin` header.
 */
async function signedInPage(browser: Browser, email: string): Promise<Page> {
  // newContext() does NOT inherit the project's `use.baseURL` — set it so the
  // relative request + page.goto calls resolve against the E2E server.
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password: E2E_PASSWORD },
    headers: { origin: E2E_BASE_URL },
  });
  if (!res.ok()) {
    throw new Error(`E2E sign-in failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  return page;
}

type AuthFixtures = {
  asAdmin: Page;
  asViewer: Page;
  asProjectUser: Page;
};

export const test = base.extend<AuthFixtures>({
  asAdmin: async ({ browser }, use) => {
    const page = await signedInPage(browser, "e2e-admin@nq.local");
    await use(page);
    await page.context().close();
  },
  asViewer: async ({ browser }, use) => {
    const page = await signedInPage(browser, "e2e-viewer@nq.local");
    await use(page);
    await page.context().close();
  },
  asProjectUser: async ({ browser }, use) => {
    const page = await signedInPage(browser, "e2e-project@nq.local");
    await use(page);
    await page.context().close();
  },
});

export { expect };
