import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "./env";
// Use the shared singleton from lib/prisma.ts so Better Auth's own writes
// go through the same connection pool. Session/Account/Verification writes
// are in SKIP_AUDIT in prisma.ts so they don't generate audit rows.
import { prisma } from "./prisma";

const useSecureCookies = env.BETTER_AUTH_URL.startsWith("https://");
// Rate limiting defends prod auth endpoints, but E2E runs the production build
// (`npm run start`) and would trip the 429 limit while seeding/login-spamming.
// Disable it only when CI marks the run.
const isCI = process.env.CI === "true";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    env.BETTER_AUTH_URL,
    ...(env.TRUSTED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  rateLimit: {
    enabled: !isCI,
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
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
