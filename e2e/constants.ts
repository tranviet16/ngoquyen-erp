// Shared E2E constants. Kept in a plain module — NOT in global-setup.ts —
// because Playwright forbids test files from importing the globalSetup file.
export const E2E_PASSWORD = "changeme123";

// Must match playwright.config.ts PORT. better-auth rejects POSTs whose Origin
// is missing or not a trusted origin, so sign-in requests must send it.
export const E2E_BASE_URL = "http://localhost:3333";

export const E2E_USERS = [
  { email: "e2e-admin@nq.local", name: "E2E Admin", role: "admin" },
  { email: "e2e-viewer@nq.local", name: "E2E Viewer", role: "viewer" },
  { email: "e2e-project@nq.local", name: "E2E Project", role: "canbo_vt" },
] as const;
