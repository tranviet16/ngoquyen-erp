# Disposable restore drill — 2026-07-16

- Source: live local ERP PostgreSQL, custom-format `pg_dump` with owner/ACL metadata removed.
- Target: isolated `erp_restore_drill_test` database in `ngoquyen-iteration-postgres`.
- Restore: `pg_restore --exit-on-error` completed successfully.
- Schema invariants: 60/60 public tables and 4/4 public views matched.
- Data invariant: 1/1 bootstrap admin row matched.
- Connectivity invariant: `SELECT 1` passed.
- Cleanup: disposable database and all temporary dump copies were removed.
- Production impact: ERP container was not stopped and the production database was never a restore target.

Result: **PASS**.
