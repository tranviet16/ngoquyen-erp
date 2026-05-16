# Security — Manual Review Checklist

Automated tests (Phase 5) cover **syntactic** authorization: missing auth →
blocked, garbage cookie → 401, wrong role → 403, per-identity ACL decisions.
They CANNOT cover **semantic** ownership ("is *this specific* record mine?")
or data-scoping correctness. Each item below must be verified by a human.

## Auth enforcement layers (verified)

| Layer | Enforces | Notes |
|-------|----------|-------|
| `proxy.ts` (Next 16 middleware) | Cookie *presence* on every non-public path → 307 to /login | Public prefixes: `/api/auth`, `/login`, `/_next`, `/favicon.ico`. Does NOT validate the cookie. |
| Route handlers | `auth.api.getSession` → 401 on invalid session | Most API routes. |
| `lib/acl` (`canAccess`) | Module + axis (dept/project/role) authorization → 403 | Only `cong-no/cascade-projects` among the 10 API routes calls it. |

`/api/health` is intended to be public but `proxy.ts` still redirects anon
requests (its path is not in `PUBLIC_PATHS`). Low impact; note for cleanup.

## Findings — routes with NO authorization beyond a session check

These return data to **any authenticated user** regardless of role/scope.
Confirm whether that is acceptable for each:

1. **`POST /api/export/excel`** — exports cong-no / doi-chieu / du-toan / sl-dt
   workbooks. No `canAccess`, no project filtering. An authenticated viewer can
   export any entity's or project's financials. → Verify intended; if not, add
   ACL + project-scope filtering.
2. **`GET /api/thanh-toan/cascade-suppliers`** — session-only. Leaks the
   supplier list for any `entityId`. → Verify whether supplier identity is
   sensitive.
3. **`GET /api/thanh-toan/tong-hop/export`** — session-only. Exports the full
   monthly payment pivot for all entities/suppliers. → Verify intended.
4. **`GET /api/notifications` & `/stream`** — scoped to the session user by the
   service layer. Confirm the service truly filters by `userId` (see item 8).

## Semantic checks — NOT automatable

5. **Payment approver self-approval** — verify a user who *submitted* a payment
   round cannot also *approve* it (segregation of duties). Route: payment Server
   Actions on `/thanh-toan/ke-hoach/[id]`.
6. **Export row-level scoping** — `POST /api/export/excel` and the tong-hop
   export must (if scoping is intended) include only rows for projects the
   caller can view. Verify by exporting as a project-scoped user and inspecting
   the workbook.
7. **Attachment file IDOR** — `GET /api/tasks/[id]/attachments/[attId]`:
   `getAttachmentForDownload` enforces permission internally. Seed a real task +
   stored attachment owned by user A, then attempt download as user B and as a
   project-scoped user lacking task access; confirm 403 and that no file bytes
   or metadata are returned. (Automated test only covers the missing-id 404
   path — real-file seeding was out of Phase 5 scope.)
8. **Notification stream per-user scoping** — `subscribeUser(userId, …)` must
   only emit events belonging to that user. Verify two concurrent SSE clients
   (different users) never receive each other's notifications.
9. **`cascade-projects` / `cascade-suppliers` data scoping** — these pass the
   ACL *module* gate but return raw query results. Confirm a project-scoped
   user does not see projects/suppliers outside their grant via the cascade
   responses (Trục-2 resource filtering happens — or should — post-query).
10. **`avatars/[...path]`** — path is `path.join("/")` into `avatars/…`.
    Verify the storage layer (`lib/storage`) rejects `..` traversal so a user
    cannot read files outside the avatars directory.

## How to use this checklist

Run each item against a staging environment with at least one user per role
(admin / viewer / canbo_vt with and without project grants). Any item that
fails is a production bug — file it; do not weaken a test to hide it.
