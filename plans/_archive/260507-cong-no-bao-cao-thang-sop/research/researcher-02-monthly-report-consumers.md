# Researcher 02 — `MonthlyReportRow` consumers

## All consumers

| File | Role | Impact |
|------|------|--------|
| `lib/ledger/ledger-types.ts:53` | DEFINITION | Replace shape |
| `lib/ledger/ledger-aggregations.ts:122 queryMonthlyReport` | Internal SQL | Add new query |
| `lib/ledger/ledger-service.ts:149 monthlyReport()` | Internal pass-through | Add method |
| `lib/cong-no-vt/material-ledger-service.ts:88 getMaterialMonthlyReport` | Public server fn | **BREAKING signature** |
| `lib/cong-no-nc/labor-ledger-service.ts:106 getLaborMonthlyReport` | Public server fn | **BREAKING signature** |
| `app/(app)/cong-no-vt/bao-cao-thang/page.tsx` | Page consumer | Refactor |
| `app/(app)/cong-no-nc/bao-cao-thang/page.tsx` | Page consumer | Refactor |
| `components/ledger/monthly-report.tsx` | UI | Full refactor |
| `lib/export/templates/cong-no-monthly.ts:24 buildCongNoMonthlyExcel` | Excel export | **Calls `queryMonthlyReport` directly** |
| `app/api/export/excel/route.ts:47` | Export route | Update params shape |
| Export buttons in 2 pages | Indirect | Pass `month` |

## Critical finding

`buildCongNoMonthlyExcel` at `lib/export/templates/cong-no-monthly.ts:24` calls `queryMonthlyReport()` DIRECTLY — bypasses service layer. Refactor must touch BOTH paths.

## Scripts

No matches in `scripts/` — safe.

## Recommendation

**Full replacement** (not dual-type). Reasoning:
- Old "year×month grid" axis is the wrong shape per SOP
- Dual-maintenance = tech debt
- No external API consumers; all internal
- Excel export should also follow SOP

Plan: replace `MonthlyReportRow` with `MonthlyByPartyRow`, add new `queryMonthlyByParty`, remove old `queryMonthlyReport` (or keep until export migration phase if phased rollout needed).
