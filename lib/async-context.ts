import { AsyncLocalStorage } from "async_hooks";

interface UserContext {
  userId: string;
}

export const userContextStorage = new AsyncLocalStorage<UserContext>();

export function getCurrentUserId(): string | undefined {
  return userContextStorage.getStore()?.userId;
}

export function withUserContext<T>(userId: string, fn: () => T): T {
  return userContextStorage.run({ userId }, fn);
}

// Audit-bypass context: callers wrap bulk/upsert calls in bypassAudit(() => ...)
// so the Prisma audit middleware can detect intent without polluting query args.
// Pinned to globalThis so HMR reloads don't create a second ALS instance that
// the cached Prisma extended client cannot read from.
const globalForAudit = globalThis as unknown as {
  __auditBypassALS?: AsyncLocalStorage<true>;
};
const auditBypassStorage =
  globalForAudit.__auditBypassALS ?? new AsyncLocalStorage<true>();
globalForAudit.__auditBypassALS = auditBypassStorage;

export function isAuditBypassed(): boolean {
  return auditBypassStorage.getStore() === true;
}

// IMPORTANT: awaits inside the ALS scope so that lazy PrismaPromise resolution
// (which only fires the audit middleware on .then()) sees the bypass flag.
// Returning the promise from a sync callback would exit the scope before the
// middleware runs.
export async function bypassAudit<T>(fn: () => T | Promise<T>): Promise<T> {
  return auditBypassStorage.run(true, async () => await fn());
}
