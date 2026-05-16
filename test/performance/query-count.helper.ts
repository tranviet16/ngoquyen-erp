/**
 * Query-count harness for N+1 detection.
 *
 * The services under test import the singleton `@/lib/prisma` at module scope
 * and never accept an injected client, so the harness cannot swap the client.
 * Instead it counts at the lowest shared layer: `pg`'s `Pool`. Every Prisma
 * query (raw or generated) ultimately runs through `Pool.prototype.query`, or
 * through a client obtained via `Pool.prototype.connect` for transactions.
 * Patching both, once, counts the REAL queries the REAL extended client emits.
 *
 * The audit `$extends` only adds queries on create/update/delete — the N+1
 * targets here are all read-only, so counts are not skewed by the extension.
 */
import { Pool } from "pg";

let counter = 0;
let active = false;
let patched = false;

type QueryFn = (...args: unknown[]) => unknown;

function tick(): void {
  if (active) counter++;
}

function patchPool(): void {
  if (patched) return;
  patched = true;

  const origQuery = Pool.prototype.query as QueryFn;
  Pool.prototype.query = function patchedQuery(this: Pool, ...args: unknown[]) {
    tick();
    return origQuery.apply(this, args);
  } as typeof Pool.prototype.query;

  const origConnect = Pool.prototype.connect as QueryFn;
  Pool.prototype.connect = function patchedConnect(this: Pool, ...args: unknown[]) {
    const result = origConnect.apply(this, args) as Promise<unknown> | unknown;
    // Promise form (no callback) — wrap the resolved client's query.
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<{ query: QueryFn }>).then((client) => {
        wrapClientQuery(client);
        return client;
      });
    }
    return result;
  } as typeof Pool.prototype.connect;
}

const wrappedClients = new WeakSet<object>();
function wrapClientQuery(client: { query: QueryFn }): void {
  if (!client || wrappedClients.has(client)) return;
  wrappedClients.add(client);
  const origQuery = client.query.bind(client);
  client.query = function patchedClientQuery(...args: unknown[]) {
    tick();
    return origQuery(...args);
  } as QueryFn;
}

/**
 * Runs `fn`, counting every Prisma/pg query emitted while it executes.
 * Returns the function result alongside the observed query count.
 */
export async function countQueries<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; queryCount: number }> {
  patchPool();
  counter = 0;
  active = true;
  try {
    const result = await fn();
    return { result, queryCount: counter };
  } finally {
    active = false;
  }
}
