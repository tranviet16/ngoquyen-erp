import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccessEntitlement } from "./effective";
import { isModuleReleased } from "./module-availability";
import type { ModuleKey } from "./modules";
import type { CanAccessOpts } from "./effective";

export type ModuleRequestDenial = "unauthorized" | "forbidden" | "development";

export class ModuleRequestError extends Error {
  constructor(public readonly reason: ModuleRequestDenial) {
    super(
      reason === "unauthorized"
        ? "Unauthorized"
        : reason === "forbidden"
          ? "Forbidden"
          : "Module đang phát triển",
    );
    this.name = "ModuleRequestError";
  }
}

/** Authenticates, checks module entitlement, then applies the global rollout gate. */
export async function requireReleasedModuleRequest(
  moduleKey: ModuleKey,
  access: CanAccessOpts = { minLevel: "read", scope: "module" },
): Promise<{
  userId: string;
  role: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new ModuleRequestError("unauthorized");

  const entitled = await canAccessEntitlement(session.user.id, moduleKey, access);
  if (!entitled) throw new ModuleRequestError("forbidden");
  if (!(await isModuleReleased(moduleKey))) {
    throw new ModuleRequestError("development");
  }

  return { userId: session.user.id, role: session.user.role ?? "viewer" };
}

export function moduleRequestStatus(error: unknown): number {
  if (!(error instanceof ModuleRequestError)) return 500;
  if (error.reason === "unauthorized") return 401;
  if (error.reason === "forbidden") return 403;
  return 503;
}
