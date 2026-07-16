import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { env } from "./env";
// Use the shared singleton from lib/prisma.ts so Better Auth's own writes
// go through the same connection pool. Session/Account/Verification writes
// are in SKIP_AUDIT in prisma.ts so they don't generate audit rows.
import { prisma } from "./prisma";

const useSecureCookies = env.BETTER_AUTH_URL.startsWith("https://");
// Rate limiting defends prod auth endpoints, but the E2E suite login-spams the
// auth endpoints and would trip the 429 limit. Disable it for automated test
// runs — both CI and the local Playwright server (which sets E2E=true).
const isTestRun = process.env.CI === "true" || process.env.E2E === "true";
const isE2ERun = process.env.E2E === "true";

function createAuthInstance({
  signUpEnabled,
  autoSignIn = true,
}: {
  signUpEnabled: boolean;
  autoSignIn?: boolean;
}) {
  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      ...(env.TRUSTED_ORIGINS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? []),
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      disableSignUp: !signUpEnabled,
      autoSignIn,
    },
    rateLimit: {
      enabled: !isTestRun,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    advanced: {
      cookiePrefix: "nqerp",
      useSecureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: useSecureCookies,
        path: "/",
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "viewer",
          // role is NOT settable by users on signup — only admin can change it
          input: false,
        },
        title: {
          // Org-position label (chức danh) — display only, set by admin.
          type: "string",
          required: false,
          input: false,
        },
        isActive: {
          type: "boolean",
          required: false,
          defaultValue: true,
          input: false,
        },
      },
    },
    plugins: [username()],
  });
}

export const auth = createAuthInstance({ signUpEnabled: isE2ERun });

// Server-only account provisioning. This instance is never mounted as an HTTP
// handler and deliberately skips auto sign-in so an admin keeps their session.
export const userProvisioningAuth = createAuthInstance({
  signUpEnabled: true,
  autoSignIn: false,
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
