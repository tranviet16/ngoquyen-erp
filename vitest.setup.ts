import { afterEach, vi } from "vitest";
import { config as loadEnv } from "dotenv";

// `.env.test` reaches the runner here — `vitest run --env-file=` is invalid
// (`--env-file` is a Node flag, not a Vitest flag).
loadEnv({ path: ".env.test" });

// Global mocks for Next/React server primitives that crash or misbehave in the
// node test env. Integration tests needing real behavior can vi.unmock() locally.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: vi.fn(),
}));

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

afterEach(() => vi.clearAllMocks());
