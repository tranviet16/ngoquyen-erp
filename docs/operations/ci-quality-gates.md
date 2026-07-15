# CI quality gates

Phase 2 exposes stable jobs named `baseline`, `security-contract`, and `e2e-security`. The latter two are report-only until Phase 3 P0 contracts are green and Phase 8 has recorded GitHub branch-protection evidence.

`scripts/risk-change-classifier.ts` uses fail-closed routing: API, ACL, audit, authentication, Prisma, permission, payment, import, or an unknown Server Action runs the security lanes. UI-only changes run the baseline lane.

Performance and coverage stay informational. Load tests are never triggered by pull requests.
