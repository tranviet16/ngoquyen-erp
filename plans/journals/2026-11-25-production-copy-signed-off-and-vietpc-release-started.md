---
title: Production copy signed off and VIETPC release started
date: 2026-11-25
summary: "Phase 3 closed with an independent Excel re-check; phase 4 cut over to VIETPC, reopened five modules and opened the ERP to the tailnet"
---

# Production copy signed off and VIETPC release started

## What happened

- Phase 3 closed on 2026-11-25. Before the reviewer signed, the copy was re-checked against the Excel books with a separate reader. Every Nhap Lieu row, opening balance, CDC split and lifetime CSV row matched the ledger as imported.
- The stored V1-V4 results turned out to be a snapshot from 10/11. The copy had been edited on 11-16/11. Listing every post-import ledger change and tracing it to a session decision found three groups entered in the app that no Excel file backs; the owner confirmed them.
- The freeze needed more than deleting sessions: the auth cookie cache keeps a browser signed in for five minutes, so the copy's app container was stopped.
- The push of the sign-off sheet was blocked for sensitive data. The sheet carried supplier names and two personal names in a public repository. Suppliers became ERP ids, and the named version stays on VIETPC.
- Phase 4 on VIETPC: final dump, three CRLF migration checksums normalized (the plan expected two), migration state verified in SQL (62/62), release app up on loopback with health ok.
- The signed-in smoke passed. The upload test moved to phase 5, because a task needs an assignee and only the admin account exists.
- Reopening the modules: Claude's first click on save was refused by the session's permission check. The owner then told Claude to save, and the five modules were released at 12:51, between a backup dump and a baseline dump.
- `tailscale serve` worked from VIETPC itself, but no other device could connect. VIETPC's packet filter was empty: the tailnet policy is tag-based, and every grant pointed at admin-pc. Adding a host alias and a `tcp:3001` grant for the two tags that reached the old ERP fixed it, and the owner signed in from another device at 15:54.
- The release tag `release-2026-11-golive` was pushed on `6863630`, and phase 4 was closed.

## Decision

- Verify migration state with SQL against `git ls-tree` instead of running the Prisma CLI against the production database.
- Excel catch-up covers every row added after the 05/11 workbook, whatever its date.
- admin-pc is out of scope (owner, 11:43). The rollback is the VIETPC dumps, not the old app.
- The VIETPC grant opens port 3001 only, not every port as on admin-pc, because VIETPC also runs the database and the dev servers.

## Lessons

- A host that serves the tailnet needs a policy grant as well as `tailscale serve`. A check from the host itself passes either way, so the first real test has to come from another device.
- Behind `tailscale serve`, the app records the Docker gateway (`172.18.x.x`) as every client's IP address.

## Next steps

- Phase 5: staff accounts, the non-admin smoke including the upload test, an off-machine backup target before the Excel catch-up, then the announcement with "do not use admin-pc:3001".
- Decide `cong-no-nc` and `tai-chinh`, which stay closed.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
