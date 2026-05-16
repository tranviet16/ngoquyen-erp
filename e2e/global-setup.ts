import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test" });

import type { FullConfig } from "@playwright/test";
import { Pool } from "pg";
import { E2E_PASSWORD, E2E_USERS } from "./constants";

/**
 * Creates the 3 base E2E users idempotently. Sign-up goes through the running
 * app's better-auth endpoint (so password hashing matches), then the role is
 * elevated directly in the test DB — better-auth marks `role` as non-input.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test(\?|$)/.test(url)) {
    throw new Error("e2e/global-setup refuses to run: DATABASE_URL must target a *_test database");
  }

  const baseURL =
    config.projects[0]?.use?.baseURL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  const pool = new Pool({ connectionString: url });
  try {
    for (const u of E2E_USERS) {
      const { rows } = await pool.query<{ id: string; role: string }>(
        "SELECT id, role FROM users WHERE email = $1",
        [u.email],
      );
      if (rows.length === 0) {
        const res = await fetch(`${baseURL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseURL },
          body: JSON.stringify({ email: u.email, password: E2E_PASSWORD, name: u.name }),
        });
        if (!res.ok) {
          throw new Error(`Failed to create base E2E user ${u.email}: ${res.status} ${await res.text()}`);
        }
      }
      await pool.query("UPDATE users SET role = $1 WHERE email = $2", [u.role, u.email]);
    }
  } finally {
    await pool.end();
  }
}

export default globalSetup;
