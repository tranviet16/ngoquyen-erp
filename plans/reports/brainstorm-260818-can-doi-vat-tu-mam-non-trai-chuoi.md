# Brainstorm: Cân đối vật tư — dự án "Mầm Non Trại Chuối GĐ1"

Date: 2026-08-18 · Advisor: kongming agent · Status: APPROVED (user confirmed 4 decisions)

## Problem

User maintains Excel "Bảng cân đối vật tư" (SOP/`Bang cân đối vật tư.xlsx - Bảng vật tư theo dự toán.csv`, 554 rows, 2 HM blocks) tracking estimate vs invoices-collected per material/labor/machine item. Wants:

1. Import into du-an module: project "Mầm Non Trại Chuối GĐ1" → Dự toán (`ProjectEstimate`) + Giao dịch (`ProjectTransaction`, entered at invoice values).
2. Track 3 comparisons: (a) hóa đơn đã lấy vs dự toán, (b) phát sinh thực tế vs dự toán, (c) thực tế vs hóa đơn.

## Key findings (verified in repo)

- `ProjectTransaction` already has dual price columns: `unitPriceHd/amountHd` (hóa đơn) + `unitPriceTt/amountTt` (thực tế) — schema fits, no structural change needed for comparisons.
- View `vw_project_norm` (migration `20260504140000_add_project_views`) already joins estimate↔transaction on `(projectId, categoryId, itemCode)` and computes `actual_amount_hd`/`actual_amount_tt` per estimate item.
- Import infra: `lib/import/adapters/*` + registry + dry-run + ImportRun rollback + `/admin/import` UI. `du-an-xay-dung.adapter.ts` is the skeleton to copy.
- Dashboard (`lib/du-an/dashboard-service.ts`) sums only `amountTt` → would read ~0 after invoice-only import; needs ΣHd added.
- CSV totals for reconciliation gate — HM1: dự toán 7,511,996,392 / hóa đơn 4,303,557,521 (Cộng VL 4,888,371,451 / 3,493,161,627; NC 2,134,640,427 / 416,607,407; Máy 488,984,514 / 153,530,094; Chi phí chung 240,258,393 HĐ-only). HM2 "Cấp điện, điện nhẹ" has own totals.
- Data messiness: invoice sub-lines with blank STT + different commercial names/units vs parent estimate item (m2 vs Hộp); `Số HĐ` like "7+9"; text in numeric cells ("Xong"); `(x)` negatives; `#REF!`; action-item notes; duplicate STT across sections; sheet TT sometimes ≠ SL×ĐG (rounding).

## Evaluated approaches

| Decision | Options | Chosen | Rationale |
|---|---|---|---|
| Link invoice line → estimate | inherit parent itemCode / FK estimateId | **Inherit parent `categoryId`+`itemCode`, keep own name/unit** | `vw_project_norm` join contract already exists; FK = duplicate contract + form churn. Synthetic codes `<HM>-<section>-<seq>` (sheet has none; STT unstable) |
| Comparison reports | new tab / extend dinh-muc / dashboard only | **New tab `/du-an/[id]/can-doi-vat-tu`** | Mirrors user's Excel mental model; dinh-muc keeps consumption-threshold meaning. Amounts-first; qty compare only when units match ("khác ĐVT" badge). Invoice-only rows (no estimate) merged in service (listNorm + transaction groupBy anti-join) |
| Thực tế convention | same-row Tt edit / copy Hd→Tt / parallel rows | **One row = one event; import with Tt=0; edit same row when actuals known** | Parallel rows double-count qty in view; Hd→Tt copy fabricates data, kills comparison (c). UI: Tt totals labelled "Thực tế (đã nhập)", never silently mixed |
| Import mechanics | one-off script / adapter | **Adapter `bang-can-doi-vat-tu`** | Format recurs (GĐ2, other projects); dry-run + rollback built for this messiness. **Hard gate:** parsed subtotals must reconcile with sheet's Cộng/Tổng rows within ~0.5% else fail-with-report |
| Category model | per HM / per HM×section | **`ProjectCategory` per HM×section** (HM1-VL, HM1-NC, HM1-MAY, HM1-CPC, HM2-VL, …) | `ProjectEstimate` has no section column; this gives section subtotals on both sides free. `transactionType` still set (VL→lay_hang, NC→nhan_cong, Máy→may_moc) |

## User decisions (2026-08-18)

1. **Chi phí chung**: add new transactionType `chi_phi_chung` (zod enum `lib/du-an/schemas.ts` + labels); import as SL=1, ĐVT="gói". (Also covers "Thi công phá dỡ", "Máy khác %".) Note: adapter raw SQL bypasses zod — without enum change rows become uneditable, so enum change is mandatory.
2. **Còn phải lấy HĐ**: derived (Dự toán − Hóa đơn) **+ per-row manual override allowed** → needs nullable override column (e.g. `remainingInvoiceOverrideVnd` on `ProjectEstimate` or side field in cân-đối tab; decide in plan). Do NOT import sheet's "Còn phải nhập" values.
3. **Transaction date**: default = import date, **overridable** (adapter option for as-of date); note "nhập từ bảng cân đối vật tư" on each row.
4. **Scope**: full reusable adapter + cân-đối tab + dashboard ΣHd fix.

## Parser rules (the hard 20%)

- Split HM blocks on `HM:` rows; track section via single-token STT rows (I/II/III/IV).
- Row classification: STT numeric OR (blank STT AND dự-toán TT present) → estimate item (e.g. "Xi măng trắng", inox block — blank STT but real dự toán); blank STT AND only hóa-đơn values → invoice sub-line of last estimate item; skip Cộng/Tổng/blank/note-only rows.
- Parent row with own hóa-đơn columns → both an estimate row AND a transaction row.
- Numbers: strip commas/spaces; `(x)`→negative (preserve — user corrections); non-numeric text→null; ignore scratch columns after Số HĐ.
- `Số HĐ` → `invoiceNo` as-is ("7+9"); sheet notes → `note` (live action items).
- Store sheet's TT into `totalVnd` even when ≠ SL×ĐG (report rows beyond tolerance).

## Risks / boundaries

- **Double counting vs vat-tu-ncc**: ProjectTransaction = truth for project cost; vat-tu-ncc ledger = truth for supplier debt. Never sum across. Slip→Tt sync is a future roadmap item.
- Until actuals entered, `vw_project_norm.used_pct`/dinh-muc flags reflect *invoice* qty, not consumption — inform user, don't fake Tt.
- Transactions have no dedup on re-import → runbook: rollback by importRun, then re-import.
- Cross-phase invoice moves (sheet note "lấy hđơn từ gđ1 sang") will show as mismatches; record in note.
- Import from fresh export only (~$ lock files show workbook is edited live).

## Work checklist (→ plan phases)

1. Enum `chi_phi_chung` + UI labels
2. Adapter parse+validate (HM blocks, classification, subtotal reconciliation gate)
3. Adapter apply (copy du-an-xay-dung skeleton: project/category get-or-create, importRunId, rollback) + registry entry + as-of-date option
4. Dry-run against this CSV until gate passes → real import via /admin/import
5. Tab `/du-an/[id]/can-doi-vat-tu`: merged grid (estimate-anchored + invoice-only rows), category subtotals, derived Còn-phải-lấy-HĐ + override, Chênh TT−HĐ
6. Dashboard ΣHd beside ΣTt
7. User-facing convention doc (Tt=0 meaning, same-row edit rule, re-import runbook)

## Success metrics

- Import reproduces HM1 7,511,996,392 / 4,303,557,521 (and HM2 totals) within tolerance.
- Cân-đối tab "Còn phải lấy HĐ" matches sheet where sheet wasn't hand-fudged.
- User stops maintaining Excel for GĐ1; a GĐ2/next-project file imports with zero code changes.
