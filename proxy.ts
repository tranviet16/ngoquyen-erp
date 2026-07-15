import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = [
  "/api/auth",
  "/api/health",
  "/login",
  "/_next",
  "/favicon.ico",
];

// Must match the cookiePrefix set in lib/auth.ts advanced.cookiePrefix
const COOKIE_PREFIX = "nqerp";

function createContentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === "development";
  const scriptSource = isDevelopment
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const styleSource = isDevelopment
    ? "'self' 'unsafe-inline'"
    : `'self' 'nonce-${nonce}' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='`;
  const connectSource = isDevelopment
    ? "'self' http://127.0.0.1:8001 https://admin-pc.tail8998df.ts.net:8444 ws: wss:"
    : "'self' https://admin-pc.tail8998df.ts.net:8444";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    `script-src ${scriptSource}`,
    `style-src ${styleSource}`,
    "style-src-attr 'unsafe-inline'",
    `connect-src ${connectSource}`,
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = /^[a-zA-Z0-9-]{8,80}$/.test(request.headers.get("x-request-id") ?? "")
    ? request.headers.get("x-request-id")!
    : crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const isDocumentRequest = !pathname.startsWith("/api/");
  const nonce = isDocumentRequest
    ? Buffer.from(crypto.randomUUID()).toString("base64")
    : null;
  const contentSecurityPolicy = nonce ? createContentSecurityPolicy(nonce) : null;
  if (contentSecurityPolicy) {
    requestHeaders.set("x-nonce", nonce!);
    requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  }

  const finalizeResponse = (response: NextResponse) => {
    response.headers.set("x-request-id", requestId);
    if (response.status >= 300 && response.status < 400 && !response.headers.has("Content-Type")) {
      response.headers.set("Content-Type", "text/html; charset=utf-8");
    }
    if (contentSecurityPolicy) {
      response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    }
    return response;
  };

  if (isPublicPath(pathname)) {
    return finalizeResponse(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const sessionCookie = getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX });

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return finalizeResponse(NextResponse.redirect(loginUrl));
  }

  return finalizeResponse(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
