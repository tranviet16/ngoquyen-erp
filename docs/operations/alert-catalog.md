# Alert catalog

| Signal | Severity | Owner | Response |
|---|---|---|---|
| Unauthorized access/data exposure | P0 | Security + domain | Contain immediately; preserve sanitized correlation ID; add regression test |
| Audit write failure | P0 | Platform + domain | Stop affected mutation path or use approved maintenance procedure |
| Payment/import failure spike | P1 | Finance/operations | Triage same day; verify data integrity |
| 5xx or timeout spike | P1 | Platform | Check health, DB saturation and recent release |
| 401/403 denial spike | P1 | Security | Investigate only abnormal baseline; do not classify normal denials as outage |

All alerts require a runbook link, owner and severity. Events may include only the allowlisted fields in `lib/observability/event-sanitizer.ts`.
