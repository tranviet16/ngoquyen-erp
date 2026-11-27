---
title: Plan du-an doc so cong no vat tu qua debate va red-team
date: 2026-11-26
summary: "Du an tabs read only project_transactions; plan reads the material ledger directly, owner chose Hop dong-style access"
---

# Plan du-an doc so cong no vat tu qua debate va red-team

## What happened

The user asked why the Dự án module shows transactions for Mầm non GĐ1 but not for other projects. The tabs Giao Dịch, Công Nợ NCC, Cân Đối VT, Định Mức and the Dashboard read only `project_transactions`. Only project #4 ever had Excel imports into that table: `bang-can-doi-vat-tu`, `du-toan-tong-hop-vt` and the team workbook via `du-an-dt-hd-tt`, which derived 280 HĐ-only rows. Every other project has 0 rows there, 0 categories and 0 estimates. Their real activity lives only in the material ledger (`ledger_transactions`, daily slips, payment rounds), and nothing syncs it into the Dự án module. On dev, project #1 has 490 ledger rows and #14 has 109. Even #4 shows no TT or payments in Giao Dịch.

## Decision

The plan was built with `--debate`. Three planners drafted independently, with reuse-first, correctness-first and user-workflow-first lenses. Kongming then adjudicated the disagreements. The plan reads the ledger directly and never copies or sums sources:
- Công Nợ NCC = `queryDetailReport` folded per supplier with `sumReportRows`.
- Giao Dịch gets a `?nguon=` switch between a read-only ledger grid and the unchanged Sổ dự án.
- A shared loader lives in `lib/du-an/project-ledger/`.

A three-lens red team produced 23 findings. After deduplication, all 15 were accepted. The biggest was that kongming's strict access rule contradicted the shipped Hợp đồng tab, which already shows per-supplier debt totals to du-an readers. Other findings were a 404 link (`/vat-tu-ncc/{id}` has no page), Giao Dịch CRUD crashing on a ledger read error, phases 2 and 3 sharing a component, and integration tests able to reach production 5433 from old worktrees.

The owner decided three things:
- Access works like the Hợp đồng tab: totals are visible to project readers, and ledger lines need `cong-no-vt`.
- HĐ figures come from the ledger for every project.
- Amounts are combined across Chủ thể.

## Next steps

- Implement with `/ak-cook plans/261126-1426-du-an-doc-so-cong-no-vat-tu/plan.md`. Phase 1 comes first; phases 2 and 3 can run in parallel; phase 4 runs last.
- Before releasing modules, check the default `cong-no-vt` role permissions in `role_permissions`, and release `cong-no-vt` together with `du-an`.
- Every integration run must confirm `DATABASE_URL` points at port 5435.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
