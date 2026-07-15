// Shared E2E constants. Kept in a plain module — NOT in global-setup.ts —
// because Playwright forbids test files from importing the globalSetup file.
export const E2E_PASSWORD = "changeme123";

// Must match playwright.config.ts PORT. better-auth rejects POSTs whose Origin
// is missing or not a trusted origin, so sign-in requests must send it.
export const E2E_BASE_URL = "http://localhost:3333";

// The login page authenticates via better-auth's username() plugin, so each
// E2E user needs a username. Kept lowercase + alphanumeric so the plugin's
// default validator and lookup normalisation accept them unchanged.
export const E2E_USERS = [
  { email: "e2e-admin@nq.local", username: "e2eadmin", name: "E2E Admin", role: "admin" },
  { email: "e2e-approver@nq.local", username: "e2eapprover", name: "E2E Approver", role: "admin" },
  { email: "e2e-viewer@nq.local", username: "e2eviewer", name: "E2E Viewer", role: "viewer" },
  { email: "e2e-project@nq.local", username: "e2eproject", name: "E2E Project", role: "canbo_vt" },
] as const;
