# Release checklist

Evidence owner: repository owner; local release approved and executed 2026-07-15/16.

- [x] `npm run risk:verify`, unit, integration and E2E-security suites are green.
- [x] Migration rehearsal and disposable restore drill have current evidence (`plans/260715-iteration-feedback-loop/reports/restore-drill-20260716.md`).
- [x] P0 permission smoke covers auth, ACL, export, payment, import and attachments.
- [x] Dependency audit is clean; production bootstrap credentials are provisioned by `scripts/manage-erp-admin-local.ps1` and DPAPI-stored outside Git.
- [x] Rollout, rollback and data-repair ownership is assigned in the monitoring and migration runbooks.
- [x] Performance warnings in scope are `cleared` with re-measurement evidence.
