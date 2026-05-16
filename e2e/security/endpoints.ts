/**
 * Route × expected-access table — the single source of truth for the authz
 * matrix. Expected values were DERIVED by reading each handler + `proxy.ts`,
 * not assumed (Phase 5, step 1).
 *
 * Auth enforcement layers in this app:
 *  - `proxy.ts` (Next 16 middleware): for any non-public path, a request with
 *    NO session cookie is 307-redirected to /login. It only checks cookie
 *    *presence*, never validity. Public prefixes: /api/auth, /login, /_next.
 *  - Route handlers: call `auth.api.getSession` → 401 on invalid/garbage
 *    cookie; a few also call `canAccess` (ACL) → 403.
 *
 * Therefore, with `maxRedirects: 0`, an anonymous request to a protected
 * route returns 307 (proxy), NOT 401 — 401 only happens when a (garbage)
 * cookie is present so the request slips past the proxy.
 *
 * Status codes per cell are the FULL set of acceptable codes. `null` = skip
 * this cell (e.g. SSE under the request context — covered separately).
 */

export type SecRole = "admin" | "viewer" | "scoped" | "anon";

export interface SecEndpoint {
  name: string;
  method: "GET" | "POST";
  path: string;
  /** Why each cell is what it is — keeps the table auditable. */
  note: string;
  expect: Record<SecRole, number[] | null>;
}

// 307 = proxy redirect to /login for anonymous requests on protected paths.
const ANON_BLOCKED = [307];

export const SECURITY_ENDPOINTS: SecEndpoint[] = [
  {
    name: "health",
    method: "GET",
    path: "/api/health",
    note: "Handler has no auth check; proxy still redirects anon (path not public).",
    expect: { admin: [200, 503], viewer: [200, 503], scoped: [200, 503], anon: ANON_BLOCKED },
  },
  {
    name: "auth-get-session",
    method: "GET",
    path: "/api/auth/get-session",
    note: "/api/auth is a proxy-public prefix; better-auth returns 200 (null body for anon).",
    expect: { admin: [200], viewer: [200], scoped: [200], anon: [200] },
  },
  {
    name: "avatars",
    method: "GET",
    path: "/api/avatars/e2e-nonexistent.png",
    note: "Handler: session → 401; valid session + missing file → 404.",
    expect: { admin: [404], viewer: [404], scoped: [404], anon: ANON_BLOCKED },
  },
  {
    name: "cong-no-cascade-projects",
    method: "GET",
    path: "/api/cong-no/cascade-projects?ledgerType=material",
    note: "ACL: needs any of cong-no-vt.chi-tiet / cong-no-nc.chi-tiet / thanh-toan.ke-hoach. canbo_vt has edit fallback on all three → 200; viewer has none → 403.",
    expect: { admin: [200], viewer: [403], scoped: [200], anon: ANON_BLOCKED },
  },
  {
    name: "export-excel",
    method: "POST",
    path: "/api/export/excel",
    note: "Session-only gate, NO role/ACL check. Empty body → 400 (invalid JSON).",
    expect: { admin: [400], viewer: [400], scoped: [400], anon: ANON_BLOCKED },
  },
  {
    name: "notifications",
    method: "GET",
    path: "/api/notifications",
    note: "Per-user list via session; success → 200, auth failure → 401.",
    expect: { admin: [200], viewer: [200], scoped: [200], anon: ANON_BLOCKED },
  },
  {
    name: "notifications-stream",
    method: "GET",
    path: "/api/notifications/stream",
    note: "SSE — endless body hangs the request context; authed cells covered by a dedicated abortable test.",
    expect: { admin: null, viewer: null, scoped: null, anon: ANON_BLOCKED },
  },
  {
    name: "task-attachment",
    method: "GET",
    path: "/api/tasks/1/attachments/999999999",
    note: "Auth + ownership enforced inside getAttachmentForDownload; missing id → 404, no-permission → 403.",
    expect: { admin: [403, 404], viewer: [403, 404], scoped: [403, 404], anon: ANON_BLOCKED },
  },
  {
    name: "thanh-toan-cascade-suppliers",
    method: "GET",
    path: "/api/thanh-toan/cascade-suppliers?ledgerType=all&entityId=1",
    note: "Session-only gate, NO ACL check (see SECURITY-MANUAL-REVIEW).",
    expect: { admin: [200], viewer: [200], scoped: [200], anon: ANON_BLOCKED },
  },
  {
    name: "thanh-toan-tong-hop-export",
    method: "GET",
    path: "/api/thanh-toan/tong-hop/export",
    note: "Session-only gate, NO ACL check (see SECURITY-MANUAL-REVIEW).",
    expect: { admin: [200], viewer: [200], scoped: [200], anon: ANON_BLOCKED },
  },
];
