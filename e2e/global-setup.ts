import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test" });

import type { FullConfig } from "@playwright/test";
import { Pool } from "pg";
import { E2E_PASSWORD, E2E_USERS } from "./constants";
import { ROLES } from "../scripts/roles-seed-data";
import { MODULE_KEYS } from "../lib/acl/modules";

async function seedModuleAvailability(pool: Pool): Promise<void> {
  for (const moduleKey of MODULE_KEYS) {
    await pool.query(
      `INSERT INTO module_availability ("moduleKey", status, "updatedAt")
       VALUES ($1, 'ready', now())
       ON CONFLICT ("moduleKey") DO UPDATE
       SET status = 'ready', "updatedAt" = now()`,
      [moduleKey],
    );
  }
}

/**
 * Seeds the dynamic-RBAC tables (`roles` + `role_permissions`) idempotently.
 * Required since the RBAC refactor: write guards resolve permissions from
 * `role_permissions`, so E2E users with a non-admin role need their matrix.
 */
async function seedRoles(pool: Pool): Promise<void> {
  for (const role of ROLES) {
    await pool.query(
      `INSERT INTO roles (id, name, description, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
         description = EXCLUDED.description, "updatedAt" = now()`,
      [role.id, role.name, role.description],
    );
    await pool.query(`DELETE FROM role_permissions WHERE "roleId" = $1`, [role.id]);
    for (const [moduleKey, level] of Object.entries(role.permissions)) {
      await pool.query(
        `INSERT INTO role_permissions ("roleId", "moduleKey", level) VALUES ($1, $2, $3)`,
        [role.id, moduleKey, level],
      );
    }
  }
}

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
    await seedModuleAvailability(pool);
    await seedRoles(pool);
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
      // Set role + username/displayUsername: better-auth marks `role` as
      // non-input, and the login page signs in via the username() plugin.
      await pool.query(
        'UPDATE users SET role = $1, username = $2, "displayUsername" = $2 WHERE email = $3',
        [u.role, u.username, u.email],
      );
    }
    await pool.query(
      `INSERT INTO module_permissions ("userId", "moduleKey", level, "grantedAt")
       SELECT id, 'du-an', 'read', now() FROM users WHERE email = $1
       ON CONFLICT ("userId", "moduleKey") DO UPDATE SET level = 'read'`,
      ["e2e-project@nq.local"],
    );
  } finally {
    await pool.end();
  }
}

export default globalSetup;
