---
title: "Dự án xây dựng – Dự toán / Hóa đơn / Thực tế và 3 báo cáo đối chiếu A4"
description: "Store the đội's own book (invoice lines, receipts, cash payments) next to the existing Dự toán, map it through one alias table, reproduce the DT-HĐ, DT-TT and HĐ-TT reports proven against the Mầm Non workbook, and keep the old du-an tabs fed with the new invoice list."
status: pending
priority: P1
effort: 18.5d
branch: feat/du-an-dt-hd-tt
tags: [feature, backend, frontend, database, import]
blockedBy: []
blocks: []
created: 2026-11-17
---

# Dự án xây dựng – Dự toán / Hóa đơn / Thực tế và 3 báo cáo đối chiếu

## Overview

The Mầm Non team keeps Dự toán, Hóa đơn, Thực tế nhập and Chi thực tế in `Can Doi Vat Tu 2.xlsx` and prints three reconciliations from it ('In A4 – DT-HĐ', 'In A4 – DT-TT', 'In A4 – HĐ-TT'). This plan brings that book into the ERP for any project using the same workbook template:
- entry screens for the three streams;
- one alias table that maps names to Mã nhóm and Dự toán lines;
- a đầu mối register;
- the three reports on screen, in A4 print and in Excel.

The old du-an tabs (Cân đối VT, Định mức, Công nợ, Giao dịch) keep showing the invoice list, generated from the new invoice book. The Mầm Non workbook is imported once into MNTC-GD1, and every report must equal the workbook's own figures before the entry screens are built.

Branch `feat/du-an-dt-hd-tt` from `origin/main`. Code slug `dt-hd-tt` (not `doi-chieu`, which already means supplier reconciliation). Tab label "Đối chiếu DT-HĐ-TT".

Evidence:
- [debate-evidence-packet.md](reports/debate-evidence-packet.md)
- Candidates: [1](reports/planner-debate-candidate-1.md), [2](reports/planner-debate-candidate-2.md), [3](reports/planner-debate-candidate-3.md)
- Red team: [red-team-adjudication.md](reports/red-team-adjudication.md)

## Decisions by the user

1. (13/11) Import into MNTC-GD1 (project 4), keep its 362 Dự toán lines, replace the 117 old invoice transactions from the "Bảng cân đối vật tư" import.
2. (13/11) The đội's receipts and cash payments are its own book. Nothing is written to `ledger_transactions` / `supplier_delivery_daily`, and nothing is read from them as a source.
3. (13/11) Reports keep the main columns plus the tie-out / check rows. Diagnostic columns (DT-HĐ R–Z, HĐ-TT O–Q, AA–AB) are not reproduced.
4. (17/11) The old tabs must still show the invoice list from 'Can Doi Vat Tu 2'.
5. (17/11) Thực tế per đầu mối follows an explicit basis per đầu mối, as in the workbook. When the đội enters receipts, it picks the đầu mối.
6. (17/11) Viewing the reports and the Chi thực tế book needs project `read`. Typing HĐ-TT H (thực nộp rà soát) and X (đã lấy về) needs `edit`. Inserting rows needs `create`; changing or deleting them needs `edit`.
7. (17/11) All 15 red-team groups are applied.
8. (17/11, after phase 1) The Dự toán follows the team workbook, not the ERP. This narrows decision 1: the ERP Dự toán lines are kept only where they agree with the workbook. The import syncs the Dự toán, and the sync is reversible: estimates that differ or are missing from the workbook are superseded, and replacement or new lines are inserted. The ERP is 55.256.957 below the workbook's direct cost.

## Chosen design

- **Three new input streams**, as flat tables:
  - `ProjectInvoiceLine`: VAT per line, as the Hóa Đơn sheet has it.
  - `ProjectActualReceipt`: amounts gồm VAT, with an đầu mối tag.
  - `ProjectCashPayment`: CK and TM amounts, mục I–IV, đầu mối and/or legal NCC.
- **Old tabs fed by derived transactions.** Each invoice line generates one `ProjectTransaction` with HĐ amounts only.
  - Its `sourceInvoiceLineId` is set.
  - Its (categoryId, itemCode) is that of the estimate its DT key resolves to. If a key spans hạng mục, the estimate with the largest value wins.
  - Unmapped lines get a synthetic itemCode and show as "Ngoài DT".
  - Derived rows are read-only in Giao dịch and are regenerated whenever invoice lines change.
  - The 117 old rows are superseded, not deleted.
- **One alias table** `ProjectItemAlias`, keyed by (project, source `dt|hd|tt`, key):
  - The key is the name normalised with `normVtName` plus a unit normaliser, so m² / m2 and m³ / m3 match and m² never equals m³.
  - It points to a Mã nhóm, a DT-line key and a hệ số (null = theo dõi theo giá trị).
  - It has a status (`xac_nhan|de_xuat|ngoai_dt`). On `dt` aliases it also carries the loại (`VL|NC|MTC`), per DT line: 2 of 91 Mã nhóm mix NC and MTC.
  - "Chưa gán" means a line with no alias row. Unmapped lines are still counted in every total.
- **Mã nhóm** is a new `ProjectGroupCode`: code, name, NCC phụ trách (= đầu mối), main-material flag. `ProjectMaterialGroup` is not reused, because it is bound to one hạng mục and drives Định mức (`material-group-service.ts:126-137`).
- **Đầu mối** has two levels:
  - `ProjectCounterparty` is a DT-TT Phần II line: kind `ncc|to_nhan_cong|khac` and a thực tế basis `receipts|invoices|payments|manual`.
  - `ProjectCounterpartySupplier` is a legal NCC folded into it, one per NCC per project. It is also the HĐ-TT row and holds that row's typed cells H, S, X and Z.
  - The bases, as verified on the workbook (DT-TT H53:H100):
    - SUMs over Thực Tế Nhập: 6 NCC.
    - Σ HĐ × (1+VAT): 3 NCC.
    - Chi Thực Tế by mục I / II: Ông Sơn, chi khác.
    - Typed or from the contract-payment sheet: the rest, including the 11 tổ nhân công.
- **Phần III rates:** chung 7%, nhà tạm 1%, không xác định KL 3%, thu nhập chịu thuế 6%, stored as new `ProjectSettings` columns. VAT reuses `vatPct`. Reports use defaults when the settings row is missing. The import never writes settings.
- **Import safety:**
  - A review screen for the project, supplier and acks.
  - A project-scoped advisory lock.
  - Supersede exactly the acked id set (count + Σ). Rollback restores it and checks the same count + Σ.
  - Rollback is refused once any run row has been edited or any non-run row exists in the project. After release 2 the import is one-shot.
  - Old adapters are blocked from re-inserting into a superseded project.
  - Forward-only after the first production commit.
- **Security:**
  - Every foreign id is checked against the URL's project.
  - The `create`/`edit` split.
  - The ACL contract test covers `lib/du-an/dt-hd-tt/**`.
  - The Hóa đơn grid picks existing suppliers only. Supplier creation stays admin.

## Phases

| # | Phase | Effort | Depends on | Status |
|---|-------|--------|-----------|--------|
| 1 | [Spec lock from the workbook](phase-01-spec-lock-from-workbook.md) | 1d | – | Done ([spec](reports/workbook-spec-dump.md)) |
| 2 | [Schema, migration, rollback and safety rails](phase-02-schema-migration-rollback.md) | 2d | 1 | Done ([integration run](reports/phase-02-integration-run.txt)) |
| 3 | [Pure report engine with golden tests](phase-03-pure-report-engine.md) | 2.5d | 1 (2 for types) | Pending |
| 4 | [Workbook import adapter, review screen, Dự toán sync, derived transactions](phase-04-workbook-import-adapter.md) | 5.5d | 2, 3 | Pending |
| 5 | [Report screens, A4 print, Excel export](phase-05-report-screens-print-export.md) | 2d | 3 (4 for real data) | Pending |
| 6 | [Entry screens for the three streams](phase-06-entry-screens.md) | 3d | 4, 5 | Pending |
| 7 | [Ánh xạ, Đầu mối and Mã nhóm screens](phase-07-mapping-counterparty-screens.md) | 1.5d | 5 | Pending |
| 8 | [Release 1 dry run on the local copy and production runbook](phase-08-dry-run-docs-runbook.md) | 0.5d + approval | 4, 5 | Pending |
| 9 | [Release 2 dry run and user guide](phase-09-release-2-dry-run-user-guide.md) | 0.5d | 6, 7, 8 | Pending |

Release 1 = phases 1–5 and 8: reports on imported data; the workbook stays the master and corrections go through rollback + re-import. Release 2 = phases 6, 7 and 9: the đội enters directly, and the import becomes one-shot. Phase 5 owns `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx` with every sub-navigation entry; phases 6 and 7 only add pages.

## Success criteria

- [ ] After importing the 17/11 workbook into MNTC-GD1, the reports equal the workbook's cached cells:
  - DT-TT H81 = 6.531.555.276,72, H95 = 1.984.224.628, H102 = 8.515.779.904,72;
  - HĐ-TT E34 = 6.237.094.910,14, I34 = 5.736.878.767, T34 = 6.652.018.280, X34 = 368.652.484;
  - Phần III tổng dự toán = 10.650.193.785,77;
  - per-row parity ≤ 1.000 đ.
- [ ] Every DT-HĐ block, including "Chưa có đầu mối", shows "✓ Khớp sổ Hóa Đơn". Phần B equals the invoice total not mapped to a DT line.
- [ ] Cân đối VT, Định mức, Công nợ and Giao dịch of MNTC-GD1 list the 17/11 workbook's invoices. Σ HĐ there equals Σ invoice lines chưa VAT.
- [ ] A new invoice line with an unseen name appears as "chưa gán", appears in the old tabs as "Ngoài DT", and moves into its DT line after one confirmation.
- [ ] Rolling back the import restores exactly the acked set (count and Σ) of old transactions and leaves the 362 estimates. Rolling back the old "bảng cân đối" run is refused while it is superseded. Suppliers created by the run are listed and survive rollback.
- [ ] Other projects' Cân đối VT, Định mức, Công nợ and Giao dịch numbers are unchanged. `ledger_transactions` and `supplier_delivery_daily` row counts are unchanged.
- [ ] A user with `edit` on project A cannot write a row that references project B's đầu mối, Mã nhóm or alias.
- [ ] `npm test`, `npm run test:integration` (output attached to `reports/`), `npx tsc --noEmit`, `npm run lint` and `npm run build` are green.

## Debate synthesis

**Consensus of the three candidates:**
- new independent streams;
- one alias table with hệ số and confirmation;
- two-level đầu mối;
- report math in pure functions proven against the workbook first;
- no ledger writes;
- Phần III rates on `ProjectSettings`;
- never rolling back the old run.

**Disagreements settled:**

| Topic | Candidates | Chosen | Why |
|---|---|---|---|
| Mã nhóm storage | C1, C2: new table; C3: reuse `ProjectMaterialGroup` | New `ProjectGroupCode` | The hạng mục constraint and Định mức coupling (`material-group-service.ts:126-137`). |
| DT line → Mã nhóm, loại | C1: alias `source=dt`; C2: `ProjectEstimate.costGroupId` | Alias `source=dt`, with loại on it | One mapping mechanism, estimates untouched, and 2 Mã nhóm mix loại (verified). |
| Replacing the 117 rows | C1, C2: inside the import; C3: separate script | Inside the import, acked by count + Σ | One reversible unit. |
| Thực tế basis set | All: receipts / payments / manual | Add `invoices` | Verified: Thanh Tùng, Đông Yên, Phương Vũ use Σ HĐ × (1+VAT). |
| T34 ≠ H81 (Δ 120.463.003) | C3: unknown | Explained | Đất Việt Phát HĐ 125.000.040 is used as temporary thực tế, and DT-TT "Vật tư phụ" 4.537.037 does not appear in HĐ-TT. Shown as a check row. |
| Company ledger control column | C3: read-only panel | Out of scope | Not requested; the books are separate. |
| Tabs | C1: four; C2: one | One tab with sub-navigation | The layout already has 13 tabs. |
| Settings at import | C2: fill when empty; C1: never write | Never write | Settings carry no `importRunId`. |

## Risks

- **The 362 ERP estimates collapse to 338 name|unit keys, against 343 keys in Ánh Xạ DT** (measured 17/11). Phase 1 lists the differences and the two-way gate 3 blocks the import until each is resolved. Unresolved question 1.
- **21 DT keys span several hạng mục.** The derived transaction uses the largest-value estimate, so Cân đối VT shows that key's HĐ on one hạng mục row.
- **The đội keeps editing the workbook during release 1.** Gates are recomputed from the file's cached cells at every preview.

## Red Team Review

### Session — 2026-11-17
**Findings:** 33 raw, deduplicated into 15 groups (15 accepted; 2 sub-items rejected with workbook evidence).
**Severity breakdown:** 1 Critical, 12 High, 2 Medium.

| # | Finding | Severity | Disposition | Applied to |
|---|---------|----------|-------------|------------|
| 1 | No review UI for project / supplier / acks | Critical | Accept | Phase 4 |
| 2 | Rollback misses edits to run rows | High | Accept | Phases 2, 8, 9 |
| 3 | No project-scoped lock | High | Accept | Phases 2, 4, 6, 7 |
| 4 | Old adapters can re-insert transactions | High | Accept | Phases 2, 4 |
| 5 | Superseded rows still editable | High | Accept | Phases 2, 4 |
| 6 | Reverting the build or migration loses data | High | Accept | Phases 2, 8 |
| 7 | Cross-project foreign ids | High | Accept | Phases 6, 7 |
| 8 | ACL level and contract test | High | Accept | Phases 3, 6, 7 |
| 9 | Unit normalisation | High | Accept | Phases 1, 2 |
| 10 | One-directional DT gate | High | Accept | Phase 4 |
| 11 | Formula tagging shapes | High | Accept (narrowed) | Phases 1, 4 |
| 12 | Loại per DT line | High | Accept | Phases 2, 3, 4 |
| 13 | Unrequested scope / naming | High/Med | Accept (2 sub-items rejected) | Phases 2–5 |
| 14 | Parsing, MST, supplier creation, ack, settings | Medium | Accept | Phases 2–4 |
| 15 | Report identity, print, phase order, quick-create, audit, integration evidence | Medium | Accept | Phases 1–9 |

### Whole-Plan Consistency Sweep
- Slug renamed to `dt-hd-tt` in every phase.
- Hợp đồng import removed from phase 4.
- `kind` moved to the dt alias in phases 2, 3 and 4.
- `expenseGroup` and `ProjectCounterparty.vatPct` removed.
- The separate guard file was replaced by a hit kind in `rollback-guards.ts`.
- `create`/`edit` split stated in phases 6 and 7.
- Phase 8 was split into 8 and 9.
- Decision 4 (derived transactions) was added to phases 2, 4 and 6, plus the success criteria.
- No contradictions remain.

## Unresolved questions

None open. The Dự toán question was answered on 17/11 (decision 8).
