/**
 * Auth/session mocking for mock-mode tests.
 *
 * Services authenticate via `auth.api.getSession({ headers })` (see
 * `getActor()` in payment-service.ts). To control the current user a test must
 * mock the `@/lib/auth` module, then drive it with the helpers below.
 *
 * Usage:
 *   import { authMock, mockSession, clearSession } from "@/test/helpers/session-mock";
 *   vi.mock("@/lib/auth", () => ({ auth: authMock }));
 *   beforeEach(() => mockSession({ id: "u1", role: "admin" }));
 */
import { vi } from "vitest";

export interface SessionUser {
  id: string;
  role?: string | null;
  email?: string;
  name?: string;
}

const getSession = vi.fn();

/** The mock to register: `vi.mock("@/lib/auth", () => ({ auth: authMock }))`. */
export const authMock = {
  api: { getSession },
};

/** Makes `auth.api.getSession` resolve a session for `user`. */
export function mockSession(user: SessionUser): void {
  getSession.mockResolvedValue({
    user: {
      id: user.id,
      role: user.role ?? null,
      email: user.email ?? `${user.id}@test.local`,
      name: user.name ?? user.id,
    },
    session: { userId: user.id },
  });
}

/** Makes `auth.api.getSession` resolve `null` — unauthenticated. */
export function clearSession(): void {
  getSession.mockResolvedValue(null);
}
