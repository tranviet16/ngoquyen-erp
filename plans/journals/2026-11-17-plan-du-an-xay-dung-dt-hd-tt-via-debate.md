---
title: "Plan: Du an xay dung DT-HD-TT via debate"
date: 2026-11-17
summary: "Debate plan for the DT/HD/TT feature: 3 candidates, synthesis, 4-lens red team, user decisions applied"
---

# Plan: Du an xay dung DT-HD-TT via debate

﻿## What happened
- Built a shared evidence packet (workbook structure, du-an models, MNTC-GD1 data state) for plan 261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt.
- Three independent candidates (reuse-first planner, workflow-first planner, kongming) agreed on new invoice/receipt/payment streams, one alias table, a two-level dau moi and pure report math proven against workbook goldens before screens.
- Subagents could not run Bash (ENAMETOOLONG at spawn); the orchestrator verified workbook facts directly: DT-TT Phan II bases, the T34-H81 gap (Dat Viet Phat temp HD 125.000.040 - Vat tu phu 4.537.037), 2 of 91 Ma nhom mixing NC/MTC, ERP estimates 362 rows / 338 keys vs 343 workbook keys.
- Red team (4 lenses) produced 33 findings, deduplicated into 15 accepted groups; critical: no import review UI for project/supplier/acks.

## Decision
- User 17/11: apply all red-team groups; old du-an tabs must still list the workbook invoices, so derived HD-only project_transactions are generated from invoice lines (sourceInvoiceLineId); thuc te basis per dau moi; viewing = project read, typing H/X = edit.
- Code slug dt-hd-tt (doi-chieu already means supplier reconciliation). Never roll back the old bang-can-doi run: it hard-deletes the 362 estimates.

## Next steps
- Phase 1 spec lock: the two-way DT key diff needs a user decision before phase 4.
- Implement on feat/du-an-dt-hd-tt from origin/main; about 17.5 dev-days; release 1 = reports on imported data.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
