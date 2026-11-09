# Debate evidence packet — Công nợ vật tư theo công trình

Shared, read-only input for the three candidate planners. Repo: `C:\Users\tranv\OneDrive\Desktop\ngoquyen-erp` (Next.js 16 App Router, React 19, Prisma 7 + pg adapter, PostgreSQL 16, Better Auth, AG Grid / `components/sortable-table`, Vitest unit + integration, Playwright e2e). Read `AGENTS.md`: this Next.js version has breaking changes; guides live in `node_modules/next/dist/docs/`. Timezone Asia/Bangkok. User language Vietnamese. Today 2026-11-05.

Accepted brainstorm (decisions are settled, do not re-litigate): `plans/reports/brainstorm-261105-1504-cong-no-vat-tu-theo-cong-trinh.md`. Kongming counsel: `plans/reports/kongming-261105-1504-cong-no-vat-tu-theo-cong-trinh-design-counsel.md`. Previous plan in the same area (completed, its invariants still hold): `plans/261006-0307-vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian/plan.md` + `reports/pilot-result.md`. Architecture doc: `docs/system-architecture.md` (sections ~140–240 cover the material ledger, period selector, period close, lock, sign).

## 1. Outcome (contract)

Replace the Excel workflow (`Quản Lý Công Nợ/`) with one place in the ERP:
- Enter material tracking **per công trình** (phiếu ngày with quantity, monthly view, đối chiếu, chốt kỳ, ký, thanh toán) — the ledger is derived, no re-keying into a consolidated file.
- A consolidated material-debt summary viewable **per year** and **from the beginning to now**, aggregated **by supplier** (drill to project) and **by project** (drill to supplier), filter by Chủ thể, Excel export.
- Import everything in the provided files **through the product's Import feature** (`/admin/import`, preview → commit → rollback), after the build is done. No one-off scripts for data loading.

## 2. Settled user decisions

| # | Decision |
|---|---|
| D1 | Reconciliation / period close / sign / lock scope = **(NCC × công trình)**, not per supplier. |
| D2 | **One công trình = one đối chiếu.** Excel combined docs ("Trại Chuối + Tân Lộc CDC + ĐVP-CDC" for Nam Hương; "Trại Chuối + Dải cây xanh" for Lộc Tài) become separate streams. No project-group configuration. |
| D3 | Lifetime split: when CSV "Tổng công nợ" and sheet "Số Dư Ban Đầu" disagree for a (NCC, công trình) pair, **the user reviews each pair** (show a comparison, user decides per pair) before commit. |
| D4 | Cống hộp Tiên Lãng = **two projects**: "Tiên Lãng (Việt Úc)" → Lưu Minh Xuân, "Tiên Lãng (SH)" → Lê Văn Huyên (data evidence: Quang Minh HĐ −190.000.000 and −60.000.000; Hiệu Trần 7.101.200). In the main file both appear as "Cống hộp - Tiên lãng" with different Chủ thể. |
| D5 | Cutover **hết 26/10/2026** (end of the Excel period 27/09→26/10). From 27/10 the ERP is the source; the 11 deliveries 27–31/10 exist with quantity + unit price in the per-project files. |
| D6 (new) | **All quantity history present in the per-project tracking files must be imported** (not only 27–31/10). |
| D7 (new) | **All data is loaded through the product** (Import module) after the build. |
| Default | Every material payment row must carry a project (Excel always does). One bank transfer covering several projects = several rows. No automatic allocation engine. |
| Default | Lifetime via two synthetic ledger rows dated 31/12/2025 per approved (Chủ thể, NCC, công trình): `lay_hang` = cumulative LH TT/HĐ, `thanh_toan` = cumulative paid TT/HĐ, replacing the opening-balance row; unapproved pairs keep the net opening row at 01/01/2026. (Kongming's option b; alternative a = cumulative columns on `ledger_opening_balances` touching ~6 SQL sites.) |

Non-goals: contract-level debt tracking; per-year reports before 2026; labor debt module changes (labor parties that the Excel keeps in the material ledger, e.g. "Ông Lưu (nhân công)", stay as material suppliers like in Excel).

## 3. Code evidence (verified)

### Data model — `prisma/schema.prisma`
- `Project` (266–289): `entityId Int?` = owning Chủ thể; source of entity for deliveries.
- `SupplierDeliveryDaily` (551–578): supplierId, `projectId Int?`, date, itemId, qty, unit, `unitPrice?`, `totalAmount?`, cbVatTu/chiHuyCt/keToan, note, importRunId. Indexes `(supplierId,date)`, `(supplierId,itemId)` — no project index.
- `SupplierPriceQuote` (582–595): per supplier × item, effectiveFrom.
- `SupplierReconciliation` (597–624): **supplierId only** (no project), periodFrom/To, 4 nullable frozen totals, signedBySupplier, signedDate, signedSnapshotJson, importRunId. Partial unique `supplier_recon_period_unique` (raw SQL) on supplier + period.
- `PaymentRoundItem` (656–689): entityId, supplierId, `projectId?`, category vat_tu|nhan_cong|dich_vu|khac.
- `LedgerTransaction` (693–745): ledgerType material|labor, date (business day UTC 00:00), transactionType lay_hang|thue_hd|thanh_toan|dieu_chinh, entityId, partyId, `projectId?`, `itemId?`, TT and HĐ amount/vat/total columns, invoiceNo, content, status, importRunId, `deliveryId?` (partial unique), qty, unitPriceSnapshot, `paymentRoundItemId?` (partial unique).
- `LedgerOpeningBalance` (747–766): unique (ledgerType, entity, party, project); balanceTt, balanceHd, asOfDate — net only.
- `ProjectSupplierDebtSnapshot` (1079–1106): static imported table read by `du-an/[id]/cong-no`.
- `ImportRun` (917+): fileName, fileHash, adapter, status pending|preview|committed|failed, row counts, mapping JSON.

### Material ledger & reports
- `lib/ledger/transaction-classification.ts` (96 lines): constants + SQL fragments `typeInSql/increaseSql/decreaseSql`.
- `lib/ledger/report-period.ts` (285): presets all/year/quarter/month/ISO week/ncc 27→26/custom → `[from,to]`.
- `lib/ledger/ledger-aggregations.ts` (396): `querySummary` groups entity×party×project (opening ⋈ tx); window queries group by party only.
- `lib/cong-no-vt/balance-report-service.ts:108` `queryDetailReport` — single GROUP BY entity×party×project with window (FULL OUTER JOIN opening ⋈ tx). Good base for a project pivot.
- `lib/ledger/ledger-service.ts` (450): opening balance writes; opening lock after first signed period (~87–99).
- `/cong-no-vt/tong-hop` = NCC × Chủ thể matrix (`components/ledger/debt-matrix.tsx`, `lib/ledger/debt-matrix-columns.ts`), Excel export `lib/export/templates/*`. "Toàn bộ" = net opening (01/01/2026) + all tx, so lifetime LH is not representable today.

### vat-tu-ncc (supplier-first today)
- Routes: `app/(app)/vat-tu-ncc/page.tsx` (supplier cards), `[supplierId]/{ngay,thang,chot-ky,doi-chieu,doi-chieu/[reconciliationId],bao-gia,thanh-toan,kiem-tra-khop}`. No page filters by project.
- `lib/vat-tu-ncc/period-lock.ts` (168): `lockSuppliers(tx, ids)` → `pg_advisory_xact_lock(hashtext('vat-tu-ncc:' || supplierId))`; `assertPeriodOpen(supplierId, date, client)`; `findSignedPeriodCovering`.
- `lib/vat-tu-ncc/period-bounds.ts` (171): `validatePeriodBounds` (from ≤ to; no overlap with signed; `from > opening asOf + 1`; contiguous to latest marker) — keyed by supplier.
- `lib/vat-tu-ncc/period-close-service.ts` (331): assigns prices from quotes, generates `lay_hang` events per delivery (deliveryId link).
- `lib/vat-tu-ncc/reconciliation-service.ts` (145): sign / unsign, snapshot.
- `lib/vat-tu-ncc/reconciliation-derive-service.ts` (436): derived A/B/C table; already has `byProject` subtotal (line ~206); `ReconPaymentRow`/`ReconTaxRow` lack projectId.
- `lib/vat-tu-ncc/period-recon-check-service.ts`, `supplier-balance.ts` (`supplierBalanceAsOf`), `delivery-service.ts` (172), `price-quote-service.ts`, `quote-resolver.ts`.
- Lock / assertPeriodOpen call sites: `lib/cong-no-vt/material-ledger-service.ts`, `lib/ledger/ledger-service.ts`, `lib/payment/payment-ledger-sync.ts`, `lib/vat-tu-ncc/{delivery-service,period-close-service,period-lock,reconciliation-derive-service,reconciliation-service}.ts`, test `lib/vat-tu-ncc/__tests__/period-lock-supplier-ids.test.ts`. Integration test `test/integration/vat-tu-ncc-chot-ky-linh-hoat.integration.test.ts`.
- Known UI gap (pilot finding 2): `components/vat-tu-ncc/delivery-grid.tsx` `handleCreate` has no try/catch, so a locked-period rejection shows nothing.

### Import module (the product path for D7)
- Engine `lib/import/import-engine.ts`: `previewImport(fileBuffer, adapterName, fileName, createdBy)` → ImportRun status=preview; `commitImport(runId, buffer, mapping)` re-parses, checks hash, refuses double-commit of same hash, runs `adapter.apply()` in `$transaction`; `rollbackImportRun(id)` deletes rows tagged `importRunId`. One file per run.
- UI `app/(app)/admin/import/{page.tsx, import-upload-form.tsx, import-actions.ts, [runId]/, delete-run-button.tsx}` — admin only; preview shows conflicts (fuzzy candidates) and the user resolves a name→id mapping stored in `ImportRun.mapping`.
- Contract `lib/import/adapters/adapter-types.ts`: `parse(buffer)` (no fileName passed!), `validate(data)`, `apply(data, mapping, tx, importRunId)`; `ConflictItem.entityType` supplier|contractor|item|project|entity; `ResolvedMapping` = sourceName → id|null. Registry `adapter-registry.ts`.
- `lib/import/adapters/cong-no-vat-tu.adapter.ts` + `.parse.ts` (main file): opening rows keep project; **tx rows drop projectId and itemId** (project folded into `content`), **no idempotency for tx**, header lookup expects "Nhà Cung Cấp" / "Dự Án" but Nhập Liệu row 3 has blank headers in columns D (NCC) and E (Dự án); auto find-or-create suppliers/entities/projects by exact name.
- `gach-nam-huong.adapter.ts`, `quang-minh.adapter.ts`: single-supplier delivery adapters for "Vật tư ngày" sheets ("1 file = 1 supplier = 1 material"), idempotency key (supplierId, date, itemId, qty), raw insert. `excel-utils.ts` has `parseExcelDate`, `findHeaderRow`, `buildRowsFromMatrix`, `findLabeledValue`, `parseReconciliationSheet`.
- `conflict-resolver.ts`: token-overlap fuzzy match.

### Invariants that must keep holding
- Ledger date = Asia/Bangkok business day stored at UTC 00:00; window query `date >= from AND date < to + 1 day`.
- Signed periods immutable; corrections via `dieu_chinh` in a later period; every write path serialized by advisory lock inside the transaction.
- Server actions live in `lib/<module>/` with the right module guard (`test/unit/module-release-entrypoints.test.ts`); tables use `components/sortable-table`; `revalidatePath` literal paths.
- Labor module (`cong-no-nc`) behavior unchanged; shared components change additively.
- Unit/integration suites stay green. Integration on Docker Desktop needs the test DB with `fsync` off (see `docs/code-standards.md`).
- Back up the DB before any migration or bulk data change. The real DB (docker `docker-postgres-1:5433`, DB `ngoquyyen_erp`) holds pilot data from 07/10 (two signed Nam Hương periods per supplier, pilot deliveries/quotes/ledger rows) that must be removed before the real import. Docker Desktop is currently off.

## 4. Data evidence (`Quản Lý Công Nợ/`)

### Main file `Quản Lý Công Nợ Vật Tư.xlsx`
- Sheets: Cài Đặt (lists: 47 NCC, 12 Dự án, Chủ thể Công Ty Quản Lý / Lê Văn Huyên / Lưu Minh Xuân), Nhập Liệu, Tổng Hợp Công Nợ (Chủ thể → NCC → Công trình), Số Dư Ban Đầu, Báo Cáo Tháng, Công Nợ (NCC × Chủ thể), Hướng Dẫn.
- **Nhập Liệu**: header row 3 = `Ngày GD | Loại GD | Chủ Thể | (blank=NCC) | (blank=Dự án) | Tên Vật Tư | TT: Trước VAT, VAT%, Tiền VAT, Tổng TT | HĐ: Trước VAT, VAT%, Tiền VAT, Tổng HĐ | Số HĐ | Ngày HĐ | Nội dung | Trạng Thái | Ghi Chú`. 922 rows, 01/01/2026 → 31/10/2026; types "Lấy Hàng" 773, "Trả Nợ" 149; 27 suppliers; projects Trại Chuối 467, Mầm non Trại chuối 329, Xây dựng Dải cây xanh 102, Cống hộp - Tiên lãng 18 (Lưu Minh Xuân 11, Lê Văn Huyên 7), Mầm non GĐ2 6. 3 rows with year 0206 (15/08, 26/08, 26/10). TT and HĐ are parallel ledgers: invoice issuance = "Lấy Hàng" row with only HĐ amount + Số HĐ; payments often paired (one TT row, one HĐ row) or both columns on one row. Rows are daily deliveries — the same events as the per-project files (e.g. Nam Hương × Trại Chuối 06/04 15.200.000 = 8.000 viên × 1.900). 11 rows on 27–31/10 (all TT-only Lấy Hàng, no item name).
- **Số Dư Ban Đầu**: header row 5 `Chủ Thể | Nhà Cung Cấp | Dự Án / Công Trình | Số Dư TT | Số Dư HĐ | Ngày Xác Nhận | Ghi Chú`, asOf 01/01/2026, includes finished projects (Quán Toan, CDC, 326 - Lô 34, Trụ sở 149 Hai Bà Trưng, Phí khác(các dự án), Cống hộp - Tiên lãng …) and labor parties.

### CSV `Tong Cong No - Tổng công nợ đến 26.7.26.csv`
- Lifetime totals, numbers are current (linked to the main file despite the "26.7.26" label). Columns: A TT, B Tên công ty, C/D/E Hợp đồng số/ngày/giá trị, F Tên vật tư, **G Tổng phát sinh (LH TT)**, H Đã tạm ứng, **I Đã thanh toán (paid TT)**, J Còn nợ TT, K/L HĐ số/ngày, **M Tổng giá trị (LH HĐ)**, **N Đã chuyển khoản (paid HĐ)**, O Ngày CK, P Còn phải CK (HĐ), **Q Ghi chú = tên công trình**. Rows per supplier × contract × project; supplier blocks end with "Cộng"; first table ends at "Tổng cộng"; a second partial table follows (ignore); `#REF!` cells; inconsistent project spelling ("Ngô quyền Trại chuối", "Tân lộc CDC", "ĐVP -CDC", "MN trại chuối", "Lô 34 - Dự án 326", "Tiên Lãng (Việt Úc)", "Tiên Lãng (SH)", "346 Cát Dài" …), supplier aliases ("Cty (Anh Công)" = Khánh Đức; "Cty Hiệu Trần (Anh Hiếu)" = Thương Hiệu Trần). No Chủ thể column.
- Check `(G − LH2026) − (I − Trả2026) = opening TT` (same for HĐ): **43/86 pairs exact** with rough normalization (script: scratch `reconcile_lifetime.py`, logic reproducible). Mismatch causes: aliases, CSV lacks most Tiên Lãng suppliers, CSV not updated for Dải cây xanh, HĐ side round differences (100.000.000 / 111.410.000 / 291.629.000), Phương Minh 326 vs 346 Cát Dài.

### Per-project files `Theo Dõi Vật Tư/<công trình>/<NCC>.xlsx` (24 files)
- Folders: Dải Cây Xanh (7), Mầm Non TC1 (7), Mầm Non TC2 (1), Trại Chuối (9, Quang Minh split into two files "hết 30.4.26" and "đến 26.5.26" with overlapping content; Máy xúc Lộc Tài has an extra sheet "VT tháng Dải cây xanh").
- Sheets: "SGV" (empty), **"Vật tư ngày"** (title block: company, "BẢNG THEO DÕI HÀNG NGÀY", "Công trình: …", "Tên vật tư: …", then header `STT | Ngày/tháng/năm | [Tên vật tư] | Khối lượng | ĐVT | Cán bộ vật tư | Chỉ huy công trường | Kế toán phụ trách`; repeated monthly blocks down the sheet), **"Vật tư tháng"** (same rows per month), **"Đối chiếu công nợ…"** (monthly blocks: "Công trình:", "Tên vật tư:", "Số công nợ … từ ngày X đến hết ngày Y", header `STT | Ngày | [Tên VT] | Khối lượng | ĐVT | Đơn giá | Thành tiền`, row A "Dư nợ mang sang", deliveries, B "Cộng P/S", C "Chuyển khoản", "A+B-C Tổng nợ").
- Column layouts vary (some have a material-name column, some carry it only in the title; widths 5–17 columns).
- **Dirty dates**: day > 12 stored as text `dd/mm/yyyy` (e.g. `27/10/2026`, `06/4/2026`); day ≤ 12 stored as a real date with **day and month swapped** (`04/11/2026` means 11/04/2026); typos (`19/4/2025` inside an April-2026 block). Only the block's "từ ngày X đến hết ngày Y" range disambiguates.
- The same delivery can appear in two blocks of the same file (Lộc Tài MN2 27/10 at rows 16 and 49 of đối chiếu) and in two files (Quang Minh Trại Chuối "hết 30.4.26" vs "đến 26.5.26").
- "Công trình:" labels are unreliable (DCX Bê tông HP file says "Trại Chuối"; MN files use the long official name "Xây dựng nhà lớp học 3 tầng … Trường MN Trại chuối"; MN TC2 "Xây dựng nhà hiệu bộ …"). The folder name is the reliable project hint, but `adapter.parse(buffer)` does not receive the file name today.
- Prices live in đối chiếu blocks (Đơn giá, Thành tiền); "Vật tư ngày" carries qty only.
- Period boundaries are mostly 27→26 but hand-edited (01/04→26/04, 28/04→26/05, 26/05→26/06…); latest blocks 27/09→26/10, some 27/10→26/11 in progress.
- The 11 rows 27–31/10 (qty × price = Nhập Liệu amount exactly): Bê tông HP Trại Chuối 18 m³ BT M300 × 1.610.000; Lộc Tài DCX 1 ca × 2.800.000; Lộc Tài MN2 0,5 ca × 2.800.000; Nam Hương DCX 5.400 viên × 1.350 (×2), 230,4 m² × 88.000 (×2); Quang Minh DCX Cát xây Việt Trì 4, 4, 8 m³ × 450.000; Quang Minh Trại Chuối 4 m³ × 450.000.
- Acceptance anchors: "Tổng nợ" of the 27/09→26/10 block per file (e.g. Bê tông HP Trại Chuối 509.563.111; Nam Hương Trại Chuối group 294.445.120; Quang Minh DCX 152.160.000; Gạch NH MN 23.370.400 …).

## 5. Problems each candidate plan must solve

1. **Scope change to (NCC × công trình)** for reconciliation, period bounds, advisory lock, assertPeriodOpen, opening lock, sign/unsign, snapshot, derive table, period close, payment-round sync (`vat_tu` items need project), manual ledger writes; schema + raw-SQL partial unique; migration of existing rows (pilot rows will be cleaned); tests.
2. **Double counting** between Nhập Liệu `lay_hang` rows (amount) and imported quantity history (deliveries). D6 requires all qty history; D5 says ledger history ≤ 26/10 comes from Nhập Liệu. Decide: link each historical delivery to its matching ledger row (deliveryId + qty + unitPriceSnapshot) vs make deliveries the ledger source and skip matched Nhập Liệu rows vs another scheme; define the match key, tolerance, and what happens to unmatched rows on both sides (review list in preview). Deliveries ≥ 27/10 stay unpriced-or-priced but **unclosed** so the first ERP period 27/10→26/11 is closed in the ERP.
3. **Historical đối chiếu periods**: import Excel monthly blocks as `SupplierReconciliation` rows per (NCC × công trình) (signed? unsigned?) or not; consequences for period-bounds contiguity, signature checks ("every delivery in a signed period has an event"), and the first ERP period 27/10→26/11.
4. **Lifetime rows** (31/12/2025) and the **per-pair review** of CSV vs Số Dư Ban Đầu inside the product import (preview must show the comparison per pair and let the user choose; the current preview only supports name→id conflicts).
5. **Import UX for D7**: 1 main xlsx + 1 CSV + 24 per-project xlsx; mapping of supplier aliases and project names (including Tiên Lãng split, CDC = Tân Lộc CDC + ĐVP-CDC?), ordering between adapters, idempotency and rollback, multi-file convenience, dirty-date parsing with block-range disambiguation, dedupe across blocks/files, verification report after commit (balances at 26/10 vs Excel "Tổng nợ"; 2026 Đầu kỳ vs Số Dư Ban Đầu; lifetime vs CSV).
6. **Fix the main-file adapter** (projectId/itemId, blank headers, year 0206, idempotency) or replace it.
7. **Project-first entry UI** `/vat-tu-ncc/cong-trinh/[projectId]` over the existing tables (+ index `(projectId, date)`), payments per project, `du-an/[id]/cong-no` reading the ledger instead of the static snapshot, locked-period error surfaced in the UI.
8. **Summary page** `/cong-no-vt/tong-hop-cong-trinh` on `queryDetailReport`: pivot NCC→công trình / công trình→NCC, Chủ thể filter, year mode (Đầu kỳ / PS tăng / PS giảm / Cuối kỳ, TT and HĐ) vs all mode (LH lũy kế / Đã trả / Còn nợ), Excel export; keep the existing NCC × Chủ thể matrix.
9. **Operational go-live**: back up, clean pilot data (user-approved list), run imports in order, verify, freeze Excel.

## 6. Acceptance criteria (from the brainstorm, extended for D6/D7)

- Every (NCC × công trình) balance at 26/10/2026 equals the Excel "Tổng nợ" of its 27/09→26/10 block (for former combined docs, the sum of the member projects).
- Year 2026: Đầu kỳ = Số Dư Ban Đầu per pair; All: matches CSV for every approved pair. Tests prove Còn nợ(all, T) = Cuối kỳ(year, T) and Đầu kỳ + PS tăng − PS giảm = Cuối kỳ by project.
- Closing/signing NCC A at project X does not lock NCC A at project Y; a write into a signed period is rejected and the UI shows the error.
- All quantity history from the 24 files is present as deliveries (qty, unit, item, project, supplier, price where the đối chiếu has it) with no double-counted debt; period 27/10→26/11 contains the 11 deliveries ready to close in the ERP.
- All loading is done through `/admin/import` with preview, per-pair review where required, commit and rollback.
- `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build` green.
