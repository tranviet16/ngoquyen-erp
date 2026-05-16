/**
 * Mock-mode Prisma helper. Mirrors the inline pattern in
 * `lib/acl/__tests__/effective.test.ts` but removes the boilerplate.
 *
 * Usage in a test file:
 *   import { makePrismaMock } from "@/test/helpers/prisma-mock";
 *   const db = makePrismaMock();
 *   vi.mock("@/lib/prisma", () => ({ prisma: db }));
 *   // then: db.user.findUnique.mockResolvedValue(...)
 */
import { vi } from "vitest";

type AnyFn = ReturnType<typeof vi.fn>;

/**
 * Returns a Proxy that lazily produces a `vi.fn()` for any `model.method`
 * access (e.g. `db.user.findUnique`). `$transaction` runs its callback with the
 * same mock, or resolves an array of promises — matching real Prisma behavior.
 */
export function makePrismaMock(
  overrides: Record<string, Record<string, AnyFn>> = {},
): Record<string, Record<string, AnyFn>> & {
  $transaction: AnyFn;
  $queryRaw: AnyFn;
  $executeRaw: AnyFn;
} {
  const cache = new Map<string, Record<string, AnyFn>>();

  const modelProxy = (model: string) =>
    new Proxy({} as Record<string, AnyFn>, {
      get(target, method: string) {
        if (overrides[model]?.[method]) return overrides[model][method];
        if (!target[method]) target[method] = vi.fn();
        return target[method];
      },
    });

  const root = new Proxy({} as Record<string, unknown>, {
    get(_t, key: string) {
      if (key === "$transaction") {
        return vi.fn(async (arg: unknown) =>
          typeof arg === "function"
            ? (arg as (tx: unknown) => unknown)(root)
            : Promise.all(arg as Promise<unknown>[]),
        );
      }
      if (key === "$queryRaw" || key === "$executeRaw" || key === "$queryRawUnsafe") {
        return vi.fn();
      }
      if (!cache.has(key)) cache.set(key, modelProxy(key));
      return cache.get(key);
    },
  });

  return root as never;
}

/** Mocks React `cache()` as an identity passthrough (no memoization in tests). */
export function mockReactCache(): void {
  vi.mock("react", () => ({
    cache: <T>(fn: T): T => fn,
  }));
}
