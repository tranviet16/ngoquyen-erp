import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test" });

// Dedicated E2E port — avoids colliding with a dev server on the default 3000.
const PORT = 3333;
const baseURL = `http://localhost:${PORT}`;

// The spawned dev/start server is a separate process — it does NOT inherit the
// .env.test values dotenv loaded above. Forward the test DB + auth config so the
// app under test talks to ngoquyyen_erp_test, not the dev DB.
const serverEnv: Record<string, string> = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
  BETTER_AUTH_URL: baseURL,
  NODE_ENV: "test",
  PORT: String(PORT),
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  reporter: process.env.CI ? [["github"], ["html"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Dev locally; CI builds + starts for deterministic E2E (see Phase 7).
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: serverEnv,
  },
});
