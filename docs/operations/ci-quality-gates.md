# CI quality gates

Phase 2 exposes stable jobs named `baseline`, `security-contract`, and `e2e-security`. The latter two are report-only until Phase 3 P0 contracts are green and Phase 8 has recorded GitHub branch-protection evidence.

`scripts/risk-change-classifier.ts` uses fail-closed routing: API, ACL, audit, authentication, Prisma, permission, payment, import, or an unknown Server Action runs the security lanes. UI-only changes run the baseline lane.

The `e2e-security` job runs the whole Playwright suite (`npm run test:e2e`), not only `e2e/security/`. Besides the strict paths above, it also runs, without `security-contract`, when a change touches `e2e/`, `playwright.config.ts`, or the Đối chiếu DT-HĐ-TT screens (`app/(app)/du-an/[id]/dt-hd-tt/`, `components/du-an/dt-hd-tt/`, `lib/du-an/dt-hd-tt/`). Those screens' keyboard, focus and save behaviour is pinned only by their e2e specs, such as `e2e/du-an-hd-tt-edit.spec.ts`.

Performance and coverage stay informational. Load tests are never triggered by pull requests.
