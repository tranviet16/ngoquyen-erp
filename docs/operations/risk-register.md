# Risk register and manifest policy

`test/risk-manifest.ts` is the versioned source of truth for API routes and Server Actions. Its schema version is `1`; update the version only with a compatibility decision and migration note.

## P0 classification

Classify as P0 when a surface authenticates or authorizes, exposes/downloads/streams confidential data, changes money or payment approval, bulk-imports data, removes audit evidence, or can cause unauthorized access, data exposure, financial misstatement, or system-wide outage.

A P0 record requires technical, business, and release owners; allow, deny, cross-scope, audit, and recovery tests; a defined authorization policy; and a kill switch/runbook. `scripts/verify-risk-manifest.ts` fails closed for a missing route, stale entry, incomplete P0 contract, or pending P0 policy.

## Ownership and retention

| Role | Responsibility |
|---|---|
| Platform | GlitchTip deployment, DSN, backup, retention and kill switch |
| Security | P0 triage and security regression approval |
| Domain owner | Finance/operations/product authorization policy and remediation |
| Release | Blocks release until P0 records and evidence are complete |

Error tracking is self-hosted GlitchTip. Retain events for 30 days and incident tickets for 12 months. The DSN is a production secret only; do not store request bodies, cookies, tokens, full email addresses, monetary values, or audit JSON in events.

## Approved authorization baseline

The default is least privilege: avatar access is limited to its owner or an administrator; exports require an allowlisted dataset, module read permission, and resource scope; task viewers download while task editors delete attachments; payment changes enforce role, approval separation, and scope; import, role, and grant changes require an authorized administrator and audit evidence. Phase 3 must prove these rules in real handlers and service actions before the P0 gate is enabled.

## Payment and ledger scope hold

`PaymentRound`, `Entity`, `LedgerTransaction`, and `LedgerOpeningBalance` do not currently carry a verifiable `deptId`. Therefore payment summaries, payment mutations, supplier cascade, and debt exports fail closed for non-admin users. The `du-toan` export is the exception: it requires an explicit `projectId` and checks project scope before exporting.

To re-enable non-admin payment or debt access, first add and backfill an auditable department key from an authoritative ownership source; do not infer it from entity or project names. Queries must filter in SQL by that key and call `canAccess()` with `{ kind: "dept", deptId }`; add allow, deny, and cross-department tests before relaxing this hold.
