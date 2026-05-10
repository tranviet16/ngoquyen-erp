/**
 * Server-side ACL guards for App Router layouts.
 * Call `requireModuleAccess` at the top of each protected layout.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccess } from "./effective";
import type { CanAccessOpts } from "./effective";
import type { AccessLevel, ModuleKey } from "./modules";

export type GuardOpts =
  | { minLevel?: AccessLevel; scope?: "module" }
  | { minLevel?: AccessLevel; scope: { kind: "project"; projectId: number } }
  | { minLevel?: AccessLevel; scope: { kind: "dept"; deptId: number } }
  | { minLevel?: AccessLevel; scope: { kind: "role"; roleScope?: "self" | "dept" | "all" } };

/**
 * Verifies the current session user can access the given module.
 * Redirects to /login if unauthenticated, /forbidden if unauthorized.
 * Returns { userId, role } for the caller to use without re-fetching.
 */
export async function requireModuleAccess(
  moduleKey: ModuleKey,
  opts: GuardOpts = {},
): Promise<{ userId: string; role: string }> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id: userId, role } = session.user;
  const minLevel: AccessLevel = opts.minLevel ?? "read";

  // Build CanAccessOpts from GuardOpts
  let aclOpts: CanAccessOpts;
  if (!opts.scope || opts.scope === "module") {
    aclOpts = { minLevel, scope: "module" };
  } else {
    aclOpts = { minLevel, scope: opts.scope } as CanAccessOpts;
  }

  const allowed = await canAccess(userId, moduleKey, aclOpts);
  if (!allowed) {
    redirect("/forbidden");
  }

  return { userId, role: role ?? "viewer" };
}
