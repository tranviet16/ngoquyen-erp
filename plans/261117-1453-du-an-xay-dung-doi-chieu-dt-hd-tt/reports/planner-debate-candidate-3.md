# Candidate 3 — Dự án xây dựng: Dự toán / Hóa đơn / Thực tế and the three A4 reports

Date: 2026-11-17. Advisory plan; no repo code was changed. Supersedes my 13/11 counsel where noted.

## Evidence limits (read first)

- **Verified in code today**: `prisma/schema.prisma`, `lib/du-an/can-doi-service.ts`, `lib/du-an/supplier-debt-service.ts`, `lib/du-an/settings-service.ts`, `lib/import/import-engine.ts`, `lib/import/import-rollback.ts`, `lib/import/import-run-store.ts`, `lib/import/rollback-guards.ts`, `lib/import/adapters/adapter-types.ts`, `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts`, `app/(app)/du-an/[id]/layout.tsx`, `components/data-grid/types.ts`, the 13/11 reconciliation report.
- **Not verified**: the workbook itself. The Bash tool failed on every call in this run (`ENAMETOOLONG` at process spawn), so I could not run node + SheetJS. Every statement about cell layout comes from the evidence packet. Three items therefore stay as phase-1 checks, each with a fallback that keeps the gates passable (see 5.4).
- **Not queried**: the database (as instructed).

## 1. Approach and answers D1–D6

### Summary

Store the đội's book as three independent streams (invoice + lines, receipts, cash payments) beside the existing `ProjectEstimate`, join them to Dự toán through one alias table, and make **đầu mối** a first-class record that owns the "thực tế" figure. Report math is pure TypeScript that runs on an in-memory dataset, so the same functions are proven against the workbook's cached report cells **before** any database or UI exists. The company supplier ledger is never written and never a source; it becomes a read-only control column.

Changes from my 13/11 counsel:
- VAT moves from the invoice header to the **invoice line** (the sheet has thuế suất in M and tiền VAT in O per line).
- Thực tế per đầu mối is no longer "always a typed figure": it has an explicit basis (receipts / cash / agreed), because the packet shows DT-TT column H is already a mix of SUMs over Thực Tế Nhập and typed numbers.
- Mapping targets a DT line by **key** (tên|ĐVT), not by `estimateId`, because one workbook DT line spans several `ProjectEstimate` rows (343 keys vs 362 rows in 6 categories).
- The 117 old transactions must not be removed with the import "Hoàn tác" button (new finding, 2.3).
- The company ledger appears as a control, which the finished reconciliation makes possible.

### D1 — Source of thực tế per NCC / đầu mối

**Choice: the đội's own book is the only source, with an explicit basis per đầu mối; the company ledger is a read-only tie-out, not a source.**

Each `ProjectCounterparty` (đầu mối) carries `actualBasis`:
- `nhap` — Σ `ProjectActualReceipt.amountVnd` assigned to the đầu mối (gồm VAT). Used where the workbook's H cell is a SUM over Thực Tế Nhập.
- `chi` — Σ `ProjectActualPayment` (bank + cash) of the đầu mối. Used for cash-basis lines: Ông Sơn vật tư lẻ, chi khác.
- `chot` — a typed `agreedActualVnd`. Used where H is typed: the 11 tổ nhân công and NCC lines with no receipt block.

What the 25/26 match means: it proves the two books **can** agree, not that one derives from the other. On 13/11 nine suppliers differed on thực tế and eight were missing from the ledger entirely (`plans/reports/doi-chieu-261113-1602-thuc-te-file-mam-non-vs-so-cong-no-vt.md:36-84`); agreement on 17/11 is the product of four days of manual edits on both sides. Sourcing from the ledger would (1) reverse decision 2 in substance, (2) cover only 26 of roughly 41 report lines (no tổ nhân công, Ông Sơn, chi khác), (3) break on folding, since the ledger is per legal supplier while the reports are per đầu mối (Sobek ← Chương Dương + LPP), and (4) fail for any khoán project whose suppliers are not in the company ledger. So the match is used for what it is good at: a per-supplier control that shows Δ thực tế / Δ HĐ / Δ đã trả between the đội's book and `ledger_transactions`, on screen only, and only for users who also hold read access to module `cong-no-vt`.

- **Load-bearing assumption**: someone keeps entering the đội's receipts and payments in the ERP after import.
- **First failure**: double entry. The company accountant already enters the same deliveries in vat-tu-ncc; if nobody re-enters them in the đội's book, `nhap`-basis lines go stale while the ledger moves on. The control column will show the ledger ahead for most NCCs. That is the evidence that should flip the decision: add a fourth basis `so_cong_ty` (one enum value and one loader branch, reading only) for company-supplied NCCs. I do not build it now because decision 2 points the other way.
- **Second failure (import only)**: receipts cannot be attributed to a đầu mối from the H-cell SUM ranges. Fallback: import the cached H value as `chot`, leave `counterpartyId` empty on those receipts, and list the line in the review as "chưa nối với sổ nhập". Totals still tie.

### D2 — Data model

**Choice: new independent streams; do not extend `ProjectTransaction`.**

`ProjectTransaction` joins to estimates by exact `categoryId + itemCode` (`lib/du-an/can-doi-service.ts:90-92`), carries both streams in one row (`prisma/schema.prisma:470-473`), has free-text `partyName` (`:465`) and no VAT. Supplier payments there are only `tra_tien` rows grouped by name (`lib/du-an/supplier-debt-service.ts:59-68`).

- **Assumption**: the user accepts one new tab group next to the old Giao dịch / Cân đối VT tabs.
- **First failure**: for MNTC-GD1 the old tabs (Cân đối VT, Định mức, Công nợ NCC, dashboard) show HĐ = 0 once the 117 rows are replaced, because nothing bridges the new invoices back. This is a consequence of decision 1; see question 1.

### D3 — Mapping

**Choice: one alias table keyed (project, source, itemKey), applied automatically at entry time.**

A line whose key is already mapped inherits the mapping; an unseen key appears as "chưa gán" in a worklist and counts in the tie-out row until confirmed. `factor` NULL means "theo dõi theo giá trị" (the importer turns 0 into NULL). The DT target is `estimateKey` (same key function over `ProjectEstimate.itemName|unit`), optional; group-only mappings are legal.

- **Assumption**: a mild key normalizer (NFC, trim, collapse spaces, lowercase) reproduces the workbook's `tên|ĐVT` keys without merging keys that have different targets.
- **First failure**: two workbook keys collapse into one with different group/factor → the importer blocks and lists them. A second, slower failure: a user renames an estimate line and its mappings orphan; the mapping screen must list "ánh xạ trỏ tới dòng DT không còn".

### D4 — Đầu mối model

**Choice: two levels.** `ProjectCounterparty` is the report line (kind `ncc | to_nhan_cong | khac`, sort group = nhóm tính chất). `ProjectCounterpartySupplier` attaches legal suppliers to it, unique per (project, supplier), and holds the per-NCC typed cells of HĐ-TT (thực tế riêng S, thực nộp rà soát H, đã lấy về X, ghi chú Z). Invoices point to a legal `Supplier`; receipts and payments point to a đầu mối (payments optionally also to a supplier). Tổ nhân công, Ông Sơn and chi khác are đầu mối with no supplier. `ProjectMaterialGroup.counterpartyId` is the "NCC phụ trách" of a Mã nhóm.

- **Assumption**: a legal supplier belongs to exactly one đầu mối per project, and a Mã nhóm has one NCC phụ trách (sheet Đề Xuất NCC col T).
- **First failure**: the HĐ-TT total of thực tế (T34 = 6.652.018.280) is **not** the DT-TT total of NCC lines (H81 = 6.531.555.276,72); they differ by 120.463.003,28. So Σ per-NCC thực tế is not structurally equal to Σ đầu mối thực tế. I therefore store S as an explicit per-NCC figure and show the difference as a check row instead of forcing equality. The cause must be read from the cells in phase 1.

### D5 — Delivery order

**Choice: fixtures → schema → workbook parser → report math proven on parsed data → import commit and replacement → report screens/print → entry and mapping screens → control panel and release.**

The golden totals are the only objective acceptance test, and they can be checked with no database: parse the workbook into the dataset type, run the pure report functions, compare with the cached values of the three report sheets. Entry screens built first would have nothing to prove them right.

- **Assumption**: the workbook is frozen at import, or re-imported (rollback, then import) only until the entry screens are released.
- **First failure**: the đội keeps editing the Excel after people start typing in the ERP; a re-import then deletes ERP edits. See question 3.

### D6 — Phần III inputs

**Choice: four nullable rate columns on `ProjectSettings` plus the existing `vatPct`, entered on the existing Cài đặt tab by anyone with edit level on the project** (`lib/du-an/settings-service.ts:16-20`). The importer does not write settings silently: it shows the rates it read (7% / 1% / 3% / 6% / 8%) against current settings as a required acknowledgement. Dự toán amounts are derived from estimates by `costType`; nothing is stored.

`vatPct` defaults to 0.1 (`prisma/schema.prisma:539`) and must become 0.08 for MNTC-GD1. Within `lib/du-an` it is read only by the settings service and schema (`lib/du-an/schemas.ts:112`), so the change does not move existing numbers; grep `app/` and `components/` once before changing it.

- **Assumption**: the chain is the standard one — T = VL + NC + MTC; C = 7% × T; LT = 1% × T; TT = 3% × T; TL = 6% × (T + C + LT + TT); VAT = 8% × G. If so, T ≈ 10.650.193.785,77 / 1,270728 ≈ 8.381 tỷ (speculation until the formulas in rows 106–119 are read).
- **First failure**: one khoản mục is a lump sum or has its own base; the computed total misses 10.650.193.785,77 and the gate fails. Only then add a fixed-amount override per khoản mục.

## 2. Data model

### 2.1 New models (table names in snake_case via `@@map`, soft delete where users edit)

```prisma
model ProjectCounterparty {            // đầu mối = one line of DT-TT Phần II
  id              Int       @id @default(autoincrement())
  projectId       Int
  name            String
  kind            String    // ncc | to_nhan_cong | khac
  sortGroup       String?   // nhóm tính chất, e.g. "02 Thép – kim khí"
  sortOrder       Int       @default(0)
  actualBasis     String    @default("chot") // nhap | chi | chot
  agreedActualVnd Decimal?  @db.Decimal(18, 2) // gồm VAT; read only when actualBasis = chot
  vatPct          Decimal?  @db.Decimal(5, 4)  // NULL = ProjectSettings.vatPct
  note            String?
  deletedAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  importRunId     Int?
  @@index([projectId])
  @@index([importRunId])
  @@map("project_counterparties")     // raw SQL: unique (projectId, name) WHERE "deletedAt" IS NULL
}

model ProjectCounterpartySupplier {    // legal NCC inside a đầu mối = one row of HĐ-TT
  id              Int      @id @default(autoincrement())
  projectId       Int
  counterpartyId  Int      // FK, onDelete: Cascade
  supplierId      Int      // FK suppliers
  actualShareVnd  Decimal? @db.Decimal(18, 2) // HĐ-TT S; NULL = whole đầu mối figure when sole member
  paidOverrideVnd Decimal? @db.Decimal(18, 2) // HĐ-TT H
  refundedVnd     Decimal  @default(0) @db.Decimal(18, 2) // HĐ-TT X
  todoNote        String?                     // HĐ-TT Z
  importRunId     Int?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([projectId, supplierId])
  @@index([counterpartyId])
  @@index([importRunId])
  @@map("project_counterparty_suppliers")
}

model ProjectInvoice {
  id          Int       @id @default(autoincrement())
  projectId   Int
  supplierId  Int
  invoiceNo   String
  invoiceDate DateTime
  note        String?
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  importRunId Int?
  lines       ProjectInvoiceLine[]
  @@index([projectId, supplierId])
  @@index([importRunId])
  @@map("project_invoices")
}

model ProjectInvoiceLine {
  id          Int      @id @default(autoincrement())
  invoiceId   Int      // FK, onDelete: Cascade
  projectId   Int      // denormalised for report queries
  itemName    String
  unit        String
  itemKey     String   // itemKey(itemName, unit), written by the service
  qty         Decimal  @db.Decimal(18, 4)
  unitPrice   Decimal  @db.Decimal(18, 2)
  amountVnd   Decimal  @db.Decimal(18, 2) // chưa VAT
  vatPct      Decimal  @db.Decimal(5, 4)
  vatVnd      Decimal  @db.Decimal(18, 2) // kept as on the invoice, not recomputed
  sortOrder   Int      @default(0)
  importRunId Int?
  @@index([projectId, itemKey])
  @@index([invoiceId])
  @@index([importRunId])
  @@map("project_invoice_lines")
}

model ProjectActualReceipt {
  id             Int       @id @default(autoincrement())
  projectId      Int
  date           DateTime?            // NULL when the source date is unreadable; raw text goes to note
  batchNo        Int?                 // workbook block number (col A)
  itemName       String
  unit           String
  itemKey        String
  qty            Decimal   @db.Decimal(18, 4)
  unitPrice      Decimal   @db.Decimal(18, 2)
  amountVnd      Decimal   @db.Decimal(18, 2) // gồm VAT
  vatPct         Decimal?  @db.Decimal(5, 4)  // NULL = đầu mối / project default
  counterpartyId Int?                 // FK, onDelete: SetNull
  note           String?
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  importRunId    Int?
  @@index([projectId, itemKey])
  @@index([projectId, counterpartyId])
  @@index([importRunId])
  @@map("project_actual_receipts")
}

model ProjectActualPayment {
  id             Int       @id @default(autoincrement())
  projectId      Int
  date           DateTime
  content        String
  bankVnd        Decimal   @default(0) @db.Decimal(18, 2)
  cashVnd        Decimal   @default(0) @db.Decimal(18, 2)
  section        String    // tam_ung_vat_tu_le | chi_khac | nhan_cong | ncc  (mục I–IV)
  expenseGroup   String?   // nhóm chi (col J)
  counterpartyId Int?      // FK, onDelete: SetNull
  supplierId     Int?      // legal NCC when known; else resolved as the sole member of the đầu mối
  note           String?
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  importRunId    Int?
  @@index([projectId, date])
  @@index([projectId, counterpartyId])
  @@index([importRunId])
  @@map("project_actual_payments")
}

model ProjectItemMapping {
  id              Int      @id @default(autoincrement())
  projectId       Int
  source          String   // hd | tt
  itemKey         String
  itemName        String
  unit            String
  materialGroupId Int?     // FK, onDelete: SetNull
  estimateKey     String?  // itemKey of the DT line (rolled up over hạng mục); NULL = group only
  factor          Decimal? @db.Decimal(18, 6) // KL theo ĐVT dự toán trên 1 ĐVT nguồn; NULL = theo giá trị
  status          String   @default("de_xuat") // de_xuat | xac_nhan | ngoai_dt
  note            String?
  importRunId     Int?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([projectId, source, itemKey])
  @@index([importRunId])
  @@map("project_item_mappings")
}
```

### 2.2 Changes to existing models

- `ProjectMaterialGroup` (`prisma/schema.prisma:411`): add `code String?`, `counterpartyId Int?` (NCC phụ trách, `onDelete: SetNull`), `mainMaterialOrder Int?` (non-null = listed in DT-TT Phần I, in this order), `importRunId Int?`. Its documented meaning, "nhóm vật liệu thay thế cho nhau … lấy HĐ cát vàng được" (`:409-410`), is the Mã nhóm concept, so reuse is correct. Side effect to accept: once the 362 estimates of MNTC-GD1 get a `materialGroupId`, the Định mức tab of that project starts rolling up by group.
- `ProjectEstimate` (`:380`): add `costType String?` (`vl | nc | mtc`) for Phần III.
- `ProjectContract` (`:489`): add `supplierId Int?`.
- `ProjectSettings` (`:537`): add `generalCostPct`, `tempHousingPct`, `unquantifiedPct`, `preTaxIncomePct`, all `Decimal? @db.Decimal(5, 4)`; NULL renders "chưa khai báo tỉ lệ".
- `ImportRun` (`:926`): add the back-relations for the seven tables carrying `importRunId`.
- `Supplier` (`:235`): add back-relations only.

### 2.3 Migration and the replacement of the 117 transactions

Migration `prisma/migrations/20261118090000_add_project_doi_chieu_streams/migration.sql`: additive only (new tables, nullable columns, the partial unique index in raw SQL as the repo does elsewhere). Rollback of the schema is dropping the new tables and columns; no existing column changes type.

Engine registration (required, or rollback and "Xóa run" silently skip the new tables): add the seven tables to `IMPORT_TAGGED_TABLES` (`lib/import/import-run-store.ts:101-125`), to `getRollbackInfo` (`lib/import/import-rollback.ts:26-105`) and to `deleteRunRows` (`:108-167`), deleting children first: invoice lines → invoices → receipts → payments → mappings → counterparty suppliers → counterparties → material groups. Deleting groups resets `ProjectEstimate.materialGroupId` through the existing `onDelete: SetNull` (`prisma/schema.prisma:401`), which restores the pre-import state because project 4 has no groups today.

**Do not press "Hoàn tác" on the old Bảng cân đối vật tư run.** `deleteRunRows` hard-deletes `project_estimates` with the same `importRunId` (`lib/import/import-rollback.ts:116`) one line before the transactions (`:117`), and the old adapter tagged the 362 estimates and the 117 transactions with one run. That would destroy the Dự toán lines decision 1 keeps.

Replacement procedure, as a one-off script `scripts/replace-legacy-invoice-transactions.ts` with `--project <code>`, `--dry-run` default, `--apply`, `--restore <backup.json>`:
1. `pg_dump -Fc` of the database, then the script writes a JSON backup of the full target rows.
2. Target = `project_transactions` of the project with `"deletedAt" IS NULL` and `note LIKE 'Nhập từ bảng cân đối vật tư%'` (the adapter's constant, `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts:42,533`). The script aborts unless it finds exactly **117** rows with Σ `amountHd` = **4.464.590.631** (3.654.194.738 + 153.530.093 + 416.607.407 + 240.258.393) and Σ `amountTt` = 0.
3. In one transaction: soft-delete them (`"deletedAt" = NOW()`), and set `"importRunId" = NULL` on the project's estimates so a later rollback of the old run can no longer delete them.
4. Rollback = `--restore`: clear `deletedAt` on the backed-up ids and put the estimates' `importRunId` back.

Soft delete is safe because every reader filters it: `can-doi-service.ts:92,106`, `supplier-debt-service.ts:66`, and `vw_project_norm` (`prisma/migrations/20260504140000_add_project_views/migration.sql:32`). Run the script only after the new import has passed its gates; the order is not critical because the new reports never read `project_transactions`.

## 3. Report computation and tie-outs

All functions are pure, live in `lib/du-an/doi-chieu/`, take one `DoiChieuDataset` (estimates, groups, counterparties + suppliers, invoices + lines, receipts, payments, mappings, settings) and return rows plus check rows. Nothing computed is stored.

**Shared derivations**
- `itemKey(name, unit)`; DT line = estimates rolled up by `itemKey`: KL = Σ qty, giá trị = Σ totalVnd, giá = giá trị / KL.
- Resolved mapping of a line = `ProjectItemMapping[source, itemKey]` or "chưa gán". Converted KL = qty × factor when factor is set and an `estimateKey` exists; otherwise the line counts in value only.
- `actual(c)` per đầu mối by `actualBasis` (D1). VAT rate of a đầu mối = `c.vatPct ?? settings.vatPct`.
- `issued(s)` per supplier = Σ invoice lines (chưa VAT, VAT, gồm VAT).

**DT-HĐ** (`dt-hd-report.ts`) — block per đầu mối → Mã nhóm (`group.counterpartyId`) → DT line → "↳" invoice items mapped to it; group-only items listed under the group.
- KL DT; KL đã lấy HĐ = Σ converted KL; thiếu/vượt = KL DT − KL HĐ (blank when not convertible).
- Giá trị DT; Giá trị HĐ chưa VAT = Σ mapped line amounts; Cân đối ròng = DT − HĐ; Tình trạng derived from these.
- L = `actual(c)`; M = L / (1 + VAT); N = issued by the đầu mối's suppliers, chưa VAT; O = (HĐ of other NCCs mapped into this block) − (this NCC's HĐ mapped into other blocks); P = max(0, M − N). O and P follow the packet's column names; confirm against the formulas in phase 1.
- **Tie-out per block**: block HĐ − from others + to others + unmapped/ngoài DT = N. **Global**: Σ N = Σ all invoice lines; Phần B (ngoài DT by NCC) + mapped = the same total.

**DT-TT** (`dt-tt-report.ts`)
- Phần I, for groups with `mainMaterialOrder`: KL DT vs KL thực nhận (Σ receipt qty × factor), đơn giá DT vs TT chưa VAT (value ÷ (1 + VAT) ÷ KL), chênh do KL = (KL TT − KL DT) × giá DT, chênh do đơn giá = (giá TT − giá DT) × KL TT. **Check**: the two parts sum to giá trị TT − giá trị DT per row. Receipts mapped to a group only appear as "↳ Thực nhận chỉ gán tới nhóm".
- Phần II, one row per đầu mối in sections A (ncc), B (to_nhan_cong), C (khac): DT trực tiếp of its groups, + VAT, `actual(c)`, chênh, and a small basis marker (nhập / chi / chốt). **Checks**: section totals; for `nhap` lines, receipts with no đầu mối are shown as one "chưa gán đầu mối" amount so nothing disappears.
- Phần III (`phan-iii.ts`): T from estimates by `costType`, then the rate chain from settings; DỰ TOÁN vs THỰC TẾ per khoản mục. **Check**: computed tổng dự toán vs the sum the user expects (shown, not stored).

**HĐ-TT** (`hd-tt-report.ts`) — one row per `ProjectCounterpartySupplier`, plus an automatic row "(chưa gán đầu mối)" for invoice suppliers without membership.
- E = issued gồm VAT; G = Σ payments resolved to the supplier; H = `paidOverrideVnd`; I = H ?? G; J = max(0, E − I); K = max(0, I − E); L = I / E.
- R = `actual(c)` of its đầu mối; S = `actualShareVnd`; T = S ?? R when the supplier is the sole member (a đầu mối with several members requires S on each, enforced in the service); U = T − E; V = T − I; W = max(0, J − V); X = `refundedVnd`; Y = W − X; Z = `todoNote`.
- **Tie-outs**: Σ E = invoice ledger total gồm VAT; Σ G + payments not resolved to a supplier = payments of section `ncc`; check row "Σ T − Σ thực tế chốt đầu mối NCC" showing the difference openly.

**Company ledger control** (`company-ledger-check.ts`, screen only): per supplier, `ledger_transactions` with `ledgerType = 'material'`, the project and `partyId = supplierId`: lay_hang.totalTt vs T, lay_hang.totalHd vs E, thanh_toan.totalTt vs I (the definitions used in the 13/11 reconciliation, lines 10–13), plus `ledger_opening_balances`. Read-only.

## 4. Phases

Branch from `origin/main` (a77f7c4). Before any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md). Total effort ≈ 17 working days.

### Phase 1 — Fixtures and spec lock (1 day, no dependencies)
- **Goal**: remove the three unknowns and freeze the golden values.
- **Files**: `scripts/dump-doi-chieu-workbook.ts` (new, path as argv); `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/workbook-spec.md` (new); golden JSON written outside the repo or git-ignored, since it holds real supplier data.
- **Steps**: dump values and formulas of DT-TT rows 53–119, HĐ-TT rows 6–34, DT-HĐ one full NCC block, the headers of every input sheet. Record per-row goldens. Answer: which H cells are SUM ranges; why T34 ≠ H81; what row 102 includes (H102 = H81 + H95 exactly, so section C is outside it or zero); the bases of the Phần III rates.
- **Verify**: `npx tsx scripts/dump-doi-chieu-workbook.ts "<workbook path>"`.
- **Accept**: spec file lists every cell read by the importer and every report formula in words; the seven golden totals of the packet are reproduced by the dump.

### Phase 2 — Schema (1 day, after 1)
- **Files**: `prisma/schema.prisma`; `prisma/migrations/20261118090000_add_project_doi_chieu_streams/migration.sql`; `lib/import/import-run-store.ts`; `lib/import/import-rollback.ts`; `lib/import/__tests__/rollback-guards.test.ts` (extend if it enumerates tables).
- **Steps**: models of section 2; register tables in the three engine lists.
- **Verify**: `npx prisma validate`; `npm run db:migrate`; `npx tsc --noEmit`; `npm test`.
- **Accept**: migration applies on a copy of production data with no change to existing rows; existing unit tests pass.

### Phase 3 — Workbook parser and gates, no database (2 days, after 1)
- **Files** (new, each under 200 lines): `lib/du-an/doi-chieu/item-key.ts`, `lib/du-an/doi-chieu/dataset-types.ts`; `lib/import/adapters/can-doi-dt-hd-tt/parse-hoa-don.ts`, `parse-thuc-te-nhap.ts`, `parse-chi-thuc-te.ts`, `parse-mappings.ts`, `parse-dau-moi.ts`, `parse-golden.ts`, `workbook-parser.ts`, `gates.ts`; tests in `lib/import/adapters/can-doi-dt-hd-tt/__tests__/` with synthetic sheets, plus `real-workbook.smoke.test.ts` that reads the path from an env variable and skips when absent (the pattern of `lib/import/adapters/vat-tu-chuyen-doi/__tests__/real-files.smoke.test.ts`).
- **Steps**: section 5. Reuse `parseExcelDate`, `normHeader`, `findHeaderRow` from `lib/import/adapters/excel-utils.ts` and `parseNlDate` from `lib/import/adapters/vat-tu-chuyen-doi/dirty-date.ts:202` for text dates.
- **Verify**: `npm test -- lib/import/adapters/can-doi-dt-hd-tt`.
- **Accept**: all input gates of 5.3 pass on the real workbook; no project code or sheet row number is hardcoded outside the parser's named constants.

### Phase 4 — Report math proven against the workbook (3 days, after 3)
- **Files** (new): `lib/du-an/doi-chieu/actual-by-counterparty.ts`, `dt-hd-report.ts`, `dt-tt-report.ts`, `phan-iii.ts`, `hd-tt-report.ts`, `report-types.ts`; `lib/du-an/doi-chieu/__tests__/*.test.ts`; `golden-parity.smoke.test.ts`.
- **Steps**: implement section 3; the parity test builds the dataset from the parser output and compares with `parse-golden.ts`.
- **Verify**: `npm test -- lib/du-an/doi-chieu`.
- **Accept**: the seven golden totals match within 1 đ; every HĐ-TT row and every DT-TT Phần II row matches within 1.000 đ; every DT-HĐ block tie-out is zero. This is the go/no-go for the design.

### Phase 5 — Import commit, review, replacement (2 days, after 2 and 4)
- **Files**: `lib/import/adapters/can-doi-dt-hd-tt/can-doi-dt-hd-tt.adapter.ts`, `apply.ts`, `review.ts` (new); `lib/import/adapters/adapter-registry.ts`; the review component beside the existing import review UI; `scripts/replace-legacy-invoice-transactions.ts` (new); `test/integration/` test for apply + rollback.
- **Steps**: project chosen through a `project` conflict and suppliers through `supplier` conflicts (`ConflictItem.entityType`, `lib/import/adapters/adapter-types.ts:33`), so no code is hardcoded. `review` reports gates, the DT-line match (5.2), the rate acknowledgement, unresolved suppliers as blocking. `apply` uses `$executeRaw` and tags `importRunId` (adapter contract, `adapter-types.ts:116-122`). No `lockScope`: no ledger rows are written. Then backup, import locally, run the replacement script.
- **Verify**: `npm run test:integration -- can-doi-dt-hd-tt`; `npx tsx scripts/replace-legacy-invoice-transactions.ts --project MNTC-GD1 --dry-run`.
- **Accept**: after commit, the database-backed reports equal phase 4's numbers; rollback leaves zero rows in the seven tables and `materialGroupId` NULL on all estimates; `ledger_transactions` and `supplier_delivery_daily` row counts are unchanged; other projects' Cân đối VT totals are unchanged.

### Phase 6 — Report screens, A4 print, Excel export (3 days, after 5)
- **Files** (new): `lib/du-an/doi-chieu/dataset-loader.ts`; `app/(app)/du-an/[id]/doi-chieu/layout.tsx` (secondary nav), `page.tsx`, `dt-hd/page.tsx`, `dt-tt/page.tsx`, `hd-tt/page.tsx` with client components; `app/api/du-an/[id]/doi-chieu/export/route.ts` (pattern of `app/api/du-an/[id]/can-doi/export/route.ts`); print rules in `app/globals.css`; one entry "Đối Chiếu DT-HĐ-TT" in `app/(app)/du-an/[id]/layout.tsx:10-24`.
- **Steps**: one tab with an inner nav, because the bar already has 13 tabs. Guards via `requireReleasedModuleRequest("du-an", …)` as in `can-doi-service.ts:70-73`. Main columns and tie-out rows only (decision 3).
- **Verify**: `npx tsc --noEmit`; `npm run lint`; `npm run build`; print preview of each report on A4.
- **Accept**: on-screen, printed and exported totals are identical because all three read the same service output.

### Phase 7 — Entry and mapping screens (4 days, after 6)
- **Files** (new): services `lib/du-an/doi-chieu/invoice-service.ts`, `receipt-service.ts`, `payment-service.ts`, `counterparty-service.ts`, `mapping-service.ts`, `schemas.ts`; routes `app/(app)/du-an/[id]/doi-chieu/hoa-don/`, `thuc-te-nhap/`, `chi-thuc-te/`, `dau-moi/`, `anh-xa/`; changes to `app/(app)/du-an/[id]/cai-dat/cai-dat-client.tsx`, `lib/du-an/settings-service.ts`, `lib/du-an/schemas.ts` for the four rates.
- **Steps**: grids on `components/data-grid/*`; supplier and đầu mối selects use `onCreateOption` (`components/data-grid/types.ts:53`) once the quick-create branch is on main, plain selects until then. Services write `itemKey` on every create/update. Mapping screen: tabs HĐ / TT, one row per key with totals, group and DT-line pickers, hệ số, Xác nhận / Ngoài DT, counters for "chưa gán" and orphaned `estimateKey`. Đầu mối screen: basis, agreed figure, member suppliers with S / H / X / Z. Duplicate invoice number per supplier is a warning, not a constraint.
- **Verify**: `npm test -- lib/du-an/doi-chieu`; `npm run test:integration -- doi-chieu`; `npm run build`.
- **Accept**: a new invoice line with an unseen name shows as "chưa gán", moves into the right DT-HĐ block once confirmed, and the block tie-out stays zero throughout; edits need project edit level.

### Phase 8 — Ledger control, docs, release (1 day, after 7)
- **Files**: `lib/du-an/doi-chieu/company-ledger-check.ts` (new); panel in `app/(app)/du-an/[id]/doi-chieu/hd-tt/`; `docs/user-guide/` page; `docs/system-architecture.md` note.
- **Steps**: control columns visible only with read access to `cong-no-vt`; runbook for production: backup, migrate, import, gates, replacement script, rollback steps.
- **Verify**: `npm test`; `npm run test:integration`; `npm run build`.
- **Accept**: for MNTC-GD1 the control shows zero Δ for 25 suppliers and the known Sobek difference; a user without `cong-no-vt` access sees no ledger figure.

## 5. Workbook import

### 5.1 Sheets read (input and mapping sheets only; report sheets are read for goldens, never as data)

| Sheet | Cells | Becomes |
|---|---|---|
| Ánh Xạ DT (A1:H346) | tên, ĐVT, KL, Giá H.T, Mã nhóm, loại | DT-line match check; `ProjectMaterialGroup` (code); `materialGroupId` and `costType` on matched estimates |
| Đề Xuất NCC (col T) | NCC áp dụng per Mã nhóm | `group.counterpartyId` |
| Hóa Đơn (A1:Q286) | A ngày, B số HĐ, C NCC, D MST, E tên, ĐVT, SL, đơn giá, I thành tiền, M thuế suất, O tiền VAT | `ProjectInvoice` grouped by (NCC, số HĐ, ngày) + lines |
| Ánh Xạ HĐ (A1:Q237) | key, Mã nhóm, STT dòng DT, hệ số, xác nhận | `ProjectItemMapping` source `hd` |
| Thực Tế Nhập (A1:AH1014) | A block, B tên, C ĐVT, D ngày (AH text), E KL, F đơn giá, G thành tiền, L/M ghi chú | `ProjectActualReceipt`; "Cộng đến …" rows are gate values only |
| Ánh Xạ TT (A1:Q148) | key, Mã nhóm, hệ số | `ProjectItemMapping` source `tt` |
| Chi Thực Tế (A1:L153) | B ngày, C nội dung, D chuyển khoản, E tiền mặt, F ghi chú, H mục, I đầu mối, J nhóm chi | `ProjectActualPayment` |
| Ánh Xạ Tên NCC (A1:AA72) | payee → tên chuẩn + MST; T:U NCC → dòng DT-TT; Z nhóm tính chất | `ProjectCounterparty`, `ProjectCounterpartySupplier`, payment → supplier |
| Hợp đồng (B3:D27) | NCC, nội dung, giá trị or "HĐNT" | `ProjectContract` (`supplierId`; "HĐNT" → value NULL, text in note) |
| In A4 – DT-TT | rows 53–80, 84–94, section C: name, H value **and formula**; D106:D119 rates | đầu mối list, `actualBasis`, `agreedActualVnd`; rates for acknowledgement |
| In A4 – HĐ-TT | rows 6–33: H, S, X, Z | typed per-NCC cells |

Never read: Dự Toán price-chain columns, Y–AG helpers, the intermediate sheets listed as noise in the packet.

### 5.2 Mapping rules

- Keys through `itemKey`; helper columns are not trusted, they are recomputed and compared.
- Factor 0 or blank → NULL. "Ngoài DT" → status `ngoai_dt`; "OK" → `xac_nhan`; anything else → `de_xuat`.
- STT dòng DT → the DT line's `estimateKey` through Ánh Xạ DT.
- **DT-line match (the risk in decision 1)**: the 362 kept estimates came from a different file. Each of the 343 Ánh Xạ DT lines must match at least one estimate by key, with Σ KL and Σ giá trị equal within tolerance. Unmatched lines are listed both ways in the review and block the commit until fixed on the Dự toán screen or acknowledged; mappings to an unmatched line fall back to group only.
- Suppliers: matched by name through the engine's conflict resolution (the master list has no MST yet, per the 13/11 report line 17); an unresolved supplier blocks. The importer does not create or edit master data.
- Basis per đầu mối: H formula is a SUM over Thực Tế Nhập → `nhap`, and receipts in those rows get the `counterpartyId`; section C lines fed by Chi Thực Tế → `chi`; otherwise `chot` with the cached value.
- Dates: serial in D first, then text in AH; unreadable → NULL date, raw text in note, warning.

### 5.3 Gates (blocking unless stated)

Input gates (parsed data vs the sheet's own totals, ±1 đ):
- Thực Tế Nhập: each block's parsed Σ G equals its "Cộng đến …" row; Ánh Xạ TT column F equals parsed Σ by key.
- Hóa Đơn: Σ(I + O) = HĐ-TT E34 = **6.237.094.910,14**; per line, I × M vs O beyond 1 đ is a warning.
- Chi Thực Tế: Σ(D + E) by mục equals column K subtotals.
- Mapping: no key collision with different targets; every Mã nhóm used by a mapping exists in Ánh Xạ DT.

Report gates (pure functions on parsed data vs cached report cells):
- DT-TT: H81 = **6.531.555.276,72**; H95 = **1.984.224.628**; H102 = **8.515.779.904,72**; each row 53–80 and 84–94 within 1.000 đ.
- HĐ-TT: E34 = **6.237.094.910,14**; I34 = **5.736.878.767**; T34 = **6.652.018.280**; X34 = **368.652.484**; each row 6–33 within 1.000 đ.
- DT-HĐ: every "= TỔNG HĐ DO NCC XUẤT" row equals `issued` for that block.
- Phần III: computed tổng dự toán = **10.650.193.785,77** within 1.000 đ (acknowledgement, not blocking, until the chain is confirmed).

After commit, the review stores the achieved totals in `ImportSummary.expected` (`adapter-types.ts:58-64`) as the audit trail.

### 5.4 Fallbacks for the three unverified items

- H-range attribution fails → that line imports as `chot` with the cached value; receipts stay unassigned; warning.
- T34 ≠ H81 turns out to be typed splits → S values are imported as typed; the check row shows the difference.
- Phần III chain differs → rates still import; the Phần III gate stays an acknowledgement and the section is flagged "cần xác nhận công thức".

## 6. Risks and out of scope

**Risks**
- Double entry between the đội's book and the company ledger (D1's first failure). Mitigation: the control column makes drift visible; decision point after one month of use.
- The kept estimates do not match the workbook's DT lines. Mitigation: the DT-line match gate; fix on the Dự toán screen before commit.
- Someone rolls back the old Bảng cân đối vật tư run and deletes the estimates. Mitigation: the replacement script detaches the estimates' `importRunId`; until it has run, the runbook forbids that button.
- Rollback of the new run deletes rows users edited afterwards. Mitigation: re-import is allowed only until phase 7 is released; state it in the runbook and the review screen.
- Group assignment changes MNTC-GD1's Định mức view. Accepted; documented.
- Float sums of 1.000 receipt rows. Mitigation: sum in integer đồng × 100 or round once at the end; goldens with decimals (,72 / ,14) will catch drift.
- Company ledger figures leaking to đội-level users. Mitigation: module-level check on the control columns.

**Out of scope**
- Writing to `ledger_transactions` or `supplier_delivery_daily`; any sync between the two books.
- Repointing the old Giao dịch / Cân đối VT / Định mức / Công nợ NCC tabs to the new streams.
- DT-HĐ columns R–Z, HĐ-TT helper columns, "độ tin cậy" text, the intermediate sheets.
- A refund log behind "đã lấy về" (typed figure for now), invoice file attachments, automatic unit conversion without a confirmed hệ số.
- The fourth basis `so_cong_ty`.

## 7. Unresolved questions for the user (max 4)

1. After replacement, the old tabs of MNTC-GD1 (Cân đối VT, Định mức, Công nợ NCC) show hóa đơn = 0, because the invoices now live in the new screens. Default: accept this and leave the old tabs as they are. Alternative: hide those tabs for projects that use the new feature.
2. For NCCs that the company accountant already records in Vật tư NCC, will the đội still enter each receipt in its own book? Default: yes (decision 2). If no, those đầu mối should read thực tế from the company ledger without writing to it.
3. Is the workbook frozen once imported? Default: re-import (hoàn tác, then import again) is allowed until the entry screens are released, after which the ERP is the only place to edit.
4. Thực tế total on HĐ-TT (6.652.018.280) is 120.463.003 more than the NCC total on DT-TT (6.531.555.276,72). Is this intended (typed per-NCC splits), or an error in the workbook to fix before import? Default: import as typed and show the difference as a check row.

Status: DONE_WITH_CONCERNS
Summary: Independent HĐ / thực tế nhập / chi thực tế streams with a two-level đầu mối model; thực tế comes only from the đội's book with an explicit basis per đầu mối, and the company ledger is a read-only control. Report math is proven against the workbook's cached cells before any database or UI work.
Concerns: The workbook could not be opened in this run (the shell failed on every call), so the H-cell basis, the T34 vs H81 gap and the Phần III chain are packet-based and are closed in phase 1, each with a fallback.
