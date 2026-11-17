# Candidate plan #2: Dự án xây dựng (Dự toán / Hóa đơn / Thực tế, plus the three A4 reports)

Date: 2026-11-17. Lens: the user's day-to-day workflow and correctness of the reports. Input: `reports/debate-evidence-packet.md` (the decisions in its section 2 are treated as final). Base branch: `origin/main` (a77f7c4).

Evidence note: the Bash tool failed in this session (`ENAMETOOLONG` on every spawn), so I could not dump workbook formulas with SheetJS. Every claim about a workbook formula that the packet does not state is tagged **[UNVERIFIED]**. Phase 1 exists to lock those claims before any report code is written. All code claims cite `file:line` in the working tree. The cited files are identical in purpose on `origin/main`; the working-branch changes (quick-create) are noted where they matter.

---

## 1. Approach summary and answers to D1–D6

Store the đội's book as **three flat entry streams** that match how people actually enter data: invoice **lines** (pasted from the invoice), **receipts** (one row per delivery, tagged with a đầu mối), and **cash payments** (one row per cash-book line, tagged with a đầu mối or a legal NCC). Add two small registers that make the reports reproducible: **Mã nhóm** (cost groups) and **Đầu mối** (counterparties with their legal NCC members). Add one **alias table** that maps the `tên|ĐVT` keys of invoice and receipt lines to a Mã nhóm and a DT line. Keep `ProjectEstimate` as the DT line store and give it a `costGroupId`. Every report total is computed from stored lines by pure functions. Mapping only decides *where* a line is shown, never *whether* it is counted. That gives every report a tie-out row that holds by construction: unmapped lines land in a visible "chưa gán" bucket instead of disappearing. Delivery order: lock the spec, then schema, then a pure report engine proven against the workbook's golden cells, then a re-runnable import of this workbook, then report screens and entry screens in parallel, then cutover.

| Q | Answer | Assumption it depends on most | How it fails first, and the mitigation |
|---|---|---|---|
| **D1** Source of thực tế per đầu mối | **Hybrid per đầu mối, explicit and visible.** Each đầu mối has `actualBasis` ∈ `receipts` (Σ đội receipts tagged to it, gồm VAT), `payments` (Σ cash-book lines tagged to it), or `manual` (a typed "thực tế chốt" with a note). Material NCC default to `receipts`. Tổ nhân công and lump-sum lines default to `manual`. Ông Sơn and chi khác default to `payments`. The company supplier ledger (option c) is **not** a source: decision 2 keeps the books separate, the ledger has no labor, Ông Sơn or chi khác (packet §5), and coupling would make the đội's report move when the company books an entry. | Packet §3 says DT-TT column H is "some rows SUMs over Thực Tế Nhập ranges, others typed numbers". The plan assumes the SUM ranges partition receipt rows by đầu mối **[UNVERIFIED]**. | **Fails first** when a đội member saves a receipt without a đầu mối, so the đầu mối's thực tế is understated. **Mitigation:** đầu mối is required on new receipts in the grid (nullable only for imported legacy rows). Phần II also shows a "Chưa gán đầu mối" row so the gap is visible and Σ receipts still ties. If the import finds that a SUM row does not map cleanly to receipt ranges, that đầu mối is imported as `manual` with the H value. The report then still equals the workbook; that đầu mối just does not update automatically. |
| **D2** Data model | **New independent streams**, not an extension of `ProjectTransaction`. Invoices are **flat lines** (date, số HĐ and NCC repeated per line), not header+lines. | The Hóa Đơn sheet is line-grain, with VAT rate and VAT amount per line (cols M, O; packet §3), so a flat table loses nothing. | **Fails first** when two lines with the same NCC and số HĐ get different dates. **Mitigation:** a service-side check rejects saving a line whose (supplier, số HĐ) already exists with another date. The grid shows invoice subtotals per số HĐ. |
| **D3** Mapping | **One alias table** keyed (project, source `hd`/`tt`, normalized `tên|ĐVT`) → Mã nhóm?, DT line key?, hệ số?, status. Mapping happens **after** entry, on a dedicated screen. It is never required at entry time. DT lines get their Mã nhóm through `ProjectEstimate.costGroupId`. | Spelling of the same goods is stable enough that one key covers many lines (the workbook needs only 234 HĐ keys for ~285 lines and ~147 TT keys for ~1000 receipt rows). | **Fails first** on spelling variants that create new "chưa gán" keys. The numbers stay correct (they tie out), but the cost is extra mapping work. **Mitigation:** the mapping screen sorts by unmapped amount, shows a running "chưa gán" total, and suggests the target already used by the same normalized name. |
| **D4** Đầu mối | `ProjectCounterparty` (kind `ncc` / `nhan_cong` / `tam_ung` / `chi_khac`, nature group for sort order, basis, manual chốt). `ProjectCounterpartySupplier` holds one row per legal NCC per project, linking it to its đầu mối (Sobek ← Chương Dương + LPP). That row **is** the HĐ-TT row and carries that report's typed cells (thực nộp override H, thực tế riêng S, đã lấy về X, ghi chú Z). Each Mã nhóm points to the đầu mối responsible for it (Đề Xuất NCC col T). | Each legal NCC belongs to exactly one đầu mối per project (unique (projectId, supplierId)). | **Fails first** if one legal NCC appears under two DT-TT lines in Ánh Xạ Tên NCC T:U. The import detects the duplicate and blocks with the NCC name, so the user decides before any data lands. |
| **D5** Delivery order | Spec lock → schema → pure report engine with golden tests → **re-runnable import** → report screens ∥ entry screens → dry run and cutover. The workbook stays the master until cutover, and the final import is taken from the latest saved workbook. | The đội keeps typing in the workbook until the entry screens ship, so the import must be rolled back and re-run several times. | **Fails first** if someone enters MNTC-GD1 data in the ERP between imports, because a rollback would then delete or orphan it. **Mitigation:** a new rollback guard refuses when the project's stream tables contain rows not owned by the run, or rows of the run edited after commit. The import review also refuses when the streams are not empty. |
| **D6** Phần III inputs | Four new nullable rates on `ProjectSettings` (chi phí chung, nhà tạm, không xác định KL, thu nhập chịu thuế tính trước). The existing `vatPct` is used for both the VAT row and the TT gồm VAT → chưa VAT conversion. Rates belong to the approved dự toán, so the person who owns the dự toán (admin or project accountant with `edit` on du-an) enters them in **Cài đặt**. The import fills them only when they are empty. | The rates are project-wide constants and the bases follow the standard structure: T, then GT = T × (7% + 1% + 3%), then TL = (T + GT) × 6%, then VAT on G **[UNVERIFIED bases]**. | **Fails first** if a base differs (for example nhà tạm on T + C). The golden test against the "tổng dự toán 10.650.193.785,77" cell (packet §3) fails in Phase 3, before any UI exists, and the base is corrected there. |

---

## 2. Data model

### 2.1 Why not the alternatives

- **Extending `ProjectTransaction`** (`prisma/schema.prisma:457-487`) is rejected. One row carries both streams (`amountHd`, `amountTt`, `qtyHd`, lines 468-473). The DT join is an exact `categoryId + itemCode` match (`lib/du-an/can-doi-service.ts:90-92`), so every line would need a DT code at entry, the opposite of the workbook's map-after-entry workflow. The 1000 receipts have no invoice to pair with, and `partyName` is free text (line 465) while HĐ-TT needs MST-level NCC. Changing it would also risk the numbers of Cân đối VT, Công nợ NCC (`lib/du-an/supplier-debt-service.ts:58-70`) and the dashboard (`lib/du-an/dashboard-service.ts:34-37`) for other projects, which the constraints in packet §6 forbid.
- **Reusing `ProjectMaterialGroup` for Mã nhóm** is rejected. Its service enforces "all members in one hạng mục; cross-category groups are rejected" (`lib/du-an/material-group-service.ts:4-6`), while Mã nhóm such as THEP-TRON span all six hạng mục. Its meaning (substitutable materials for Định mức, `prisma/schema.prisma:409-410`) also differs from report grouping.
- **Header+lines invoices** are rejected in favour of flat lines (see D2). Flat lines fit the existing grid's bulk paste (`components/data-grid/types.ts:58`), and the accountant pastes straight from the invoice or from Excel.

### 2.2 Models to add (new file section in `prisma/schema.prisma`)

All tables get `projectId`, `note String?`, `deletedAt DateTime?` (except the alias table, see below), `createdAt`, `updatedAt @updatedAt`, `importRunId Int?` with relation `ImportRun? onDelete: SetNull` and `@@index([importRunId])`, following `ProjectEstimate` (`prisma/schema.prisma:399-404`). Money is `Decimal(18,2)`, quantities `Decimal(18,4)`, rates `Decimal(5,4)`, hệ số `Decimal(18,6)`.

```prisma
model ProjectCostGroup {            // Mã nhóm — project_cost_groups
  id             Int     @id @default(autoincrement())
  projectId      Int
  code           String  // COC-BTLT, THEP-TRON, NC-…, MTC-…
  name           String
  costKind       String  // vl | nc | mtc  (Phần III T = VL + NC + MTC)
  isMainMaterial Boolean @default(false) // DT-TT Phần I
  counterpartyId Int?    // đầu mối phụ trách (Đề Xuất NCC col T) — onDelete SetNull
  sortOrder      Int     @default(0)
  // partial unique (projectId, code) WHERE deletedAt IS NULL — raw SQL
}

model ProjectCounterparty {         // Đầu mối — project_counterparties
  id              Int      @id @default(autoincrement())
  projectId       Int
  name            String   // "Sobek", "Tổ anh Bảy", "Ông Sơn – vật tư lẻ", "Lương"
  kind            String   // ncc | nhan_cong | tam_ung | chi_khac
  natureGroup     String?  // "01 Phá dỡ – nền móng" (sort, Ánh Xạ Tên NCC col Z)
  sortOrder       Int      @default(0)
  actualBasis     String   // receipts | payments | manual   (D1)
  manualActualVnd Decimal? @db.Decimal(18, 2) // thực tế chốt gồm VAT when basis = manual
  // partial unique (projectId, name) WHERE deletedAt IS NULL
  // CHECK (actualBasis <> 'manual' OR manualActualVnd IS NOT NULL)
}

model ProjectCounterpartySupplier { // legal NCC ∈ đầu mối = one HĐ-TT row — project_counterparty_suppliers
  id              Int      @id @default(autoincrement())
  projectId       Int
  counterpartyId  Int
  supplierId      Int      // Supplier (MST = taxCode, schema.prisma:238)
  paidOverrideVnd Decimal? @db.Decimal(18, 2) // HĐ-TT H "nhập rà soát thực nộp"
  actualSplitVnd  Decimal? @db.Decimal(18, 2) // HĐ-TT S "thực tế riêng NCC"
  refundedVnd     Decimal  @default(0) @db.Decimal(18, 2) // HĐ-TT X "đã lấy về"
  todoNote        String?  // HĐ-TT Z
  // partial unique (projectId, supplierId) WHERE deletedAt IS NULL
}

model ProjectInvoiceLine {          // Hóa đơn — project_invoice_lines
  id          Int      @id @default(autoincrement())
  projectId   Int
  invoiceDate DateTime
  invoiceNo   String
  supplierId  Int
  itemName    String
  unit        String
  qty         Decimal  @db.Decimal(18, 4)
  unitPrice   Decimal  @db.Decimal(18, 2)
  amountVnd   Decimal  @db.Decimal(18, 2) // thành tiền chưa VAT (stored; not recomputed — invoices round)
  vatRate     Decimal  @db.Decimal(5, 4)
  vatVnd      Decimal  @db.Decimal(18, 2) // tiền VAT dòng (stored as printed)
  itemKey     String   // itemKeyOf(itemName, unit) — written by the service, never by the client
  @@index([projectId, supplierId])
  @@index([projectId, itemKey])
}

model ProjectReceipt {              // Thực tế nhập — project_receipts
  id             Int      @id @default(autoincrement())
  projectId      Int
  date           DateTime
  counterpartyId Int?     // required by the service for new rows; NULL only on imported legacy rows
  itemName       String
  unit           String
  qty            Decimal  @db.Decimal(18, 4)
  unitPrice      Decimal  @db.Decimal(18, 2)
  amountVnd      Decimal  @db.Decimal(18, 2) // gồm VAT, as the đội records it
  batchLabel     String?  // the workbook's block number ("Đợt 12"); for grouping only
  itemKey        String
  @@index([projectId, counterpartyId])
  @@index([projectId, itemKey])
}

model ProjectCashPayment {          // Chi thực tế — project_cash_payments
  id             Int      @id @default(autoincrement())
  projectId      Int
  date           DateTime
  content        String
  bankVnd        Decimal  @default(0) @db.Decimal(18, 2)
  cashVnd        Decimal  @default(0) @db.Decimal(18, 2)
  supplierId     Int?     // payment to a legal NCC (feeds HĐ-TT G)
  counterpartyId Int?     // payment to a non-NCC đầu mối (tổ, Ông Sơn, chi khác)
  // CHECK (num_nonnulls("supplierId","counterpartyId") <= 1)
  @@index([projectId, date])
}

model ProjectItemAlias {            // Ánh xạ HĐ / TT — project_item_aliases
  id          Int      @id @default(autoincrement())
  projectId   Int
  source      String   // hd | tt
  itemKey     String
  sampleName  String
  sampleUnit  String
  costGroupId Int?     // onDelete SetNull
  dtKey       String?  // itemKeyOf(estimate.itemName, estimate.unit); NULL = "chỉ gán tới nhóm"
  factor      Decimal? @db.Decimal(18, 6) // NULL = theo dõi theo giá trị (0/blank in workbook → NULL)
  status      String   // de_xuat | xac_nhan | ngoai_dt   (no row = chưa gán)
  @@unique([projectId, source, itemKey])  // no soft delete: an alias is a setting, edited in place
}
```

Changes to existing models:
- `ProjectEstimate` (`prisma/schema.prisma:380-407`) adds `costGroupId Int?` → `ProjectCostGroup` with `onDelete: SetNull`, plus `@@index([costGroupId])`. The DT line in the reports is the roll-up of estimate rows sharing a `dtKey` (the workbook's 343 unique keys over 362 rows; packet §3, §5), so no estimate row is merged or renamed.
- `ProjectSettings` (`prisma/schema.prisma:537-549`) adds `dtGeneralCostPct`, `dtTempHousingPct`, `dtUnquantifiedPct`, `dtPreTaxIncomePct`, all `Decimal? @db.Decimal(5,4)`. `vatPct` (line 539) is reused. Its only consumer today is the Cài đặt form (`app/(app)/du-an/[id]/cai-dat/cai-dat-client.tsx:37`, the only `vatPct` hit in `lib`/`app` besides ledger fields named `vatPctTt`/`vatPctHd`), so reusing it changes no existing number.
- `ProjectTransaction` (`prisma/schema.prisma:457-487`) adds `supersededByRunId Int?` (relation to `ImportRun`, `onDelete: SetNull`, indexed). This is the only change to that table. It makes the replacement of the 117 old rows reversible through the normal import rollback (§2.3).
- `ImportRun` gets the back-relation arrays for the new models.

Shared pure key function: `lib/du-an/doi-chieu/item-key.ts` exports `itemKeyOf(name, unit) = normVtName(name) + "|" + normVtName(unit)`, reusing `lib/text/norm-vt-name.ts:6-21`. Invoice and receipt keys are written by the services and the import only, so client input cannot desynchronize them.

### 2.3 Migration and the replacement of MNTC-GD1's 117 old transactions

1. **Schema migration** `prisma/migrations/<ts>_du_an_doi_chieu_streams/migration.sql`: create the tables, the partial unique indexes and the two CHECKs in raw SQL (the repo's pattern; see the comments at `prisma/schema.prisma:230,247,305,422`), add the three columns. The migration is additive only. A hand-written `down.sql` (drop the new tables and three columns) is kept in the plan's reports folder for rollback.
2. **Why the old import run cannot simply be rolled back.** The bang-can-doi adapter wrote the 362 estimates and the 117 transactions under the **same** `importRunId` (`lib/import/adapters/bang-can-doi-vat-tu.adapter.ts:512-521` and `534-547`). Rollback deletes both (`lib/import/import-rollback.ts:116-117`), which would destroy the Dự toán lines decision 1 keeps.
3. **Replacement inside the new import's commit, reversible.** In `apply`, after the new rows are written, the adapter runs `UPDATE project_transactions SET "deletedAt" = now(), "supersededByRunId" = <run> WHERE "projectId" = <p> AND "deletedAt" IS NULL AND "importRunId" IN (<committed runs of adapter 'bang-can-doi-vat-tu'>)`. Every reader already filters `deletedAt IS NULL`: `can-doi-service.ts:92,106`, `supplier-debt-service.ts:66`, `dashboard-service.ts:35`, `transaction-service.ts:13`, and `vw_project_norm` (`prisma/migrations/20260504140000_add_project_views/migration.sql:32`). The review requires an explicit ack whose code embeds the count and Σ amountHd (expected: 117 rows, 4.464.590.631 đ per packet §5), so the ack goes stale if the numbers differ.
4. **Rollback of the new run** gets one added step in `deleteRunRows` (`lib/import/import-rollback.ts:108-167`): `UPDATE project_transactions SET "deletedAt" = NULL, "supersededByRunId" = NULL WHERE "supersededByRunId" = <id>`. The old rows return exactly as they were.
5. **Protecting the kept estimates.** A guard is added so a run cannot be rolled back while any of its `project_transactions` rows carry a `supersededByRunId` of a committed run. This blocks an accidental rollback of the old bang-can-doi run, which would hard-delete the 362 estimates now carrying `costGroupId`.
6. **Backup.** Take a full `pg_dump` before the migration and again before the commit import, following the existing go-live runbook practice. Rollback order if everything must be undone: roll back the new import run (restores the 117 rows and clears `costGroupId` via `SetNull` when cost groups are deleted), then apply `down.sql`. Production (admin-pc) is untouched until a deploy is approved.

---

## 3. Report computation

All three reports are built by pure functions over one `ReportInput` (estimates with `dtKey`/`costGroupId`, cost groups, counterparties with members, invoice lines, receipts, payments, aliases, settings). `report-loader.ts` builds `ReportInput` from the database. The import adapter builds the **same** structure from the workbook so it can run the golden gates (§5). Screen, print and Excel all render the same row arrays. This follows the existing rule "Số liệu lấy từ cùng service với màn hình nên tổng luôn khớp" (`app/api/du-an/[id]/can-doi/export/route.ts:14`).

Shared derived values:
- `actual(cp)` for a đầu mối: `receipts` gives Σ receipt.amountVnd of the cp; `payments` gives Σ (bank + cash) of its payments; `manual` gives manualActualVnd.
- `toNet(x) = x / (1 + vatPct)`.
- DT line = estimates grouped by `dtKey`: KL = Σ qty, Giá trị = Σ totalVnd. Its group is the estimates' `costGroupId`; mixed groups on one key are flagged.
- Line placement: an alias with `ngoai_dt` or no alias goes to "Ngoài DT / chưa gán" under the issuing NCC's đầu mối. An alias with a group but no dtKey becomes a "↳ chỉ gán tới nhóm" row. An alias with a dtKey becomes a "↳" row under that DT line.
- KL quy đổi = Σ qty × factor. If any factor is NULL the KL cell is blank and labeled "theo giá trị".
- Tình trạng reuses `epsilon`/`bucketOf` (`lib/du-an/can-doi-metrics.ts:45-77`) so "đủ/thiếu/vượt" means the same thing on both screens.

### 3.1 In A4 – DT-HĐ (blocks per đầu mối of kind `ncc`)

| Column | Source |
|---|---|
| ĐVT, KL DT, Giá trị DT | estimates rolled up by dtKey within groups whose `counterpartyId` is the block |
| KL đã lấy HĐ (quy đổi) | invoice lines whose alias points to the dtKey: Σ qty × factor |
| KL thiếu/vượt | KL DT − KL HĐ quy đổi (blank when not comparable) |
| Giá trị HĐ chưa VAT | Σ amountVnd of those lines |
| Cân đối ròng DT − HĐ, Tình trạng | difference, then `bucketOf` |
| NCC/ghi chú | distinct suppliers of the ↳ lines; alias note |
| L thực tế chốt gồm VAT | `actual(block)` |
| M thực tế chưa VAT | `toNet(L)` |
| N HĐ do NCC xuất gộp | Σ amountVnd of all lines whose supplier ∈ members(block) |
| O gán chéo ròng | (lines of other đầu mối placed in my groups) − (my lines placed in other đầu mối's groups) |
| P còn phải lấy HĐ so thực tế | M − N **[UNVERIFIED; Phase 1 reads the formula]** |
| Q ghi chú | `ProjectCounterparty.note` |

**Tie-out row per block** ("= TỔNG HĐ DO NCC XUẤT … ✓ Khớp sổ Hóa Đơn"): mine-in-my-groups + mine-ngoài-DT/chưa-gán + mine-in-other-groups = N. Each line is assigned to exactly one bucket by a single function, so the identity proves no line is double-counted or dropped. The row shows ✓ when |Δ| ≤ 1 đ. **Global tie-out:** Σ N over blocks + lines of suppliers without a đầu mối ("NCC chưa thuộc đầu mối" block) = Σ all invoice amountVnd. Diagnostic columns R–Z are not reproduced (decision 3).

### 3.2 In A4 – DT-TT

**Phần I, vật tư chính** (groups with `isMainMaterial`), per DT line and a group subtotal:
- KL DT and giá trị DT come from estimates by dtKey. Đơn giá DT = giá trị DT / KL DT.
- KL thực nhận = Σ receipt qty × factor (aliases with source `tt` pointing to the dtKey).
- Giá trị TT chưa VAT = `toNet`(Σ receipt amountVnd). Đơn giá TT = giá trị TT / KL TT.
- Chênh = TT − DT, split into "do KL" = (KL TT − KL DT) × đơn giá DT and "do đơn giá" = (đơn giá TT − đơn giá DT) × KL TT. A check cell asserts do KL + do đơn giá = chênh.
- "↳ Thực nhận chỉ gán tới nhóm" rows hold receipts whose alias has a group but no dtKey. They are counted in the group subtotal by value only.

**Phần II, per đầu mối**, sorted by natureGroup then sortOrder:
- **A. NCC** (kind `ncc`, 28 rows) shows DT trực tiếp of its groups (Σ totalVnd), the same value gồm VAT, and H = `actual(cp)`, with chênh **[UNVERIFIED column set]**. A further column shows the basis (sổ nhập / sổ chi / chốt tay) so the accountant knows which figure is typed.
- **B. Tổ nhân công** (kind `nhan_cong`, 11 rows).
- **C. Khoản khác** (kinds `tam_ung`, `chi_khac`).
- Totals: H81 = Σ A, H95 = Σ B, H102 = A + B. The packet's goldens satisfy 6.531.555.276,72 + 1.984.224.628 = 8.515.779.904,72, so C is outside H102 or zero; Phase 1 confirms which.
- **Tie-out rows:** Σ receipts = Σ `actual` of receipt-basis đầu mối + "Chưa gán đầu mối" + receipts of đầu mối whose basis is not `receipts` (shown as "sổ nhập không dùng làm chốt"). Σ cash book = Σ by section I–IV, where the section is derived from the counterparty kind or from `supplierId` (IV).

**Phần III**, by khoản mục:
- T = VL + NC + MTC, with DT from estimates by `costGroup.costKind`. Estimates without a group appear on a "chưa phân loại" line and block the golden gate.
- C = T × dtGeneralCostPct, LT = T × dtTempHousingPct, KXĐ = T × dtUnquantifiedPct, TL = (T + GT) × dtPreTaxIncomePct, VAT = G × vatPct **[UNVERIFIED bases]**.
- The DỰ TOÁN column ends at tổng dự toán (golden 10.650.193.785,77). The THỰC TẾ column per khoản mục comes from Phần II: VL from A, NC from B, the others from C **[UNVERIFIED mapping]**.
- Missing rates hide their rows and show "Chưa nhập tỷ lệ ở Cài đặt".

### 3.3 In A4 – HĐ-TT (one row per `ProjectCounterpartySupplier` with any invoice or payment; 28 rows)

| Column | Source |
|---|---|
| A NCC | Supplier.name (+ MST) |
| E HĐ đã xuất gồm VAT | Σ (amountVnd + vatVnd) of the supplier's invoice lines |
| G đã thanh toán theo sổ chi | Σ (bank + cash) of payments with this `supplierId`. Payments recorded against a single-member đầu mối count for that member. For multi-member đầu mối they are flagged "chi chưa tách NCC". |
| H nhập rà soát thực nộp | `paidOverrideVnd` |
| I thực nộp | H ?? G |
| J cần nộp thêm | max(0, E − I) |
| K đã nộp vượt HĐ | max(0, I − E) |
| L % TT/HĐ | I / E |
| Q dòng DT-TT | counterparty name |
| R thực tế chốt dòng DT-TT | `actual(counterparty)` |
| S thực tế riêng NCC | `actualSplitVnd` |
| T thực tế | R when the đầu mối has one member, otherwise S |
| U chênh TT − HĐ | T − E |
| V nợ thực tế | T − I (ignores X, per packet) |
| W sẽ lấy về | max(0, J − V) |
| X đã lấy về | `refundedVnd` |
| Y còn phải lấy về | W − X |
| Z ghi chú | `todoNote` |

Columns B–D are confirmed in Phase 1 **[UNVERIFIED]**. Row 34 totals.

**Tie-outs:**
- Σ E equals Σ invoice gồm VAT, the same total as the DT-HĐ global tie-out but gồm VAT.
- Per multi-member đầu mối, Σ S must equal R, flagged "Tách thực tế chưa đủ" with Δ otherwise.
- Σ G + section-IV payments not linked to a NCC row = Σ section IV of the cash book.

---

## 4. Phases

Parallel file ownership: Phases 5 and 6 can run in parallel. Phase 5 owns `app/(app)/du-an/[id]/layout.tsx`, the sub-layout and everything under `bao-cao/`. Phase 6 owns the entry and mapping pages and their services. No file is touched by both.

### Phase 1: Spec lock and golden fixture (4h, no dependencies)
- **Goal:** turn every [UNVERIFIED] item above into a verified rule before code is written.
- **Files:**
  - create `lib/du-an/doi-chieu/__tests__/workbook-path.ts`, which resolves the workbook path from `DU_AN_DOI_CHIEU_XLSX` (falling back to the packet path) and is used by the smoke tests with `describe.skipIf(!existsSync(...))`, as in `lib/import/adapters/vat-tu-chuyen-doi/__tests__/real-files.smoke.test.ts:27`;
  - create `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/workbook-formula-spec.md`.
- **Steps:**
  1. With SheetJS, dump the formulas (`cell.f`) of DT-HĐ L–Q for one block; DT-TT H53–H102, D107–D119 and the Phần III formulas; and HĐ-TT B–D, I–Y.
  2. Record which H rows are SUM formulas and their `Thực Tế Nhập` ranges.
  3. Record the Phần III bases and which Phần II subtotal feeds which Phần III khoản mục.
  4. Write the confirmed formulas into the spec file.
  5. Ask the user any question the formulas cannot answer.
  - No golden numbers are committed. Tests read them from the workbook at run time.
- **Acceptance:** every [UNVERIFIED] tag in this plan is either confirmed or replaced by the rule found, and the spec file lists cell addresses for every golden value used in §5.

### Phase 2: Schema and migration (4h, depends on Phase 1)
- **Files:**
  - modify `prisma/schema.prisma`;
  - create `prisma/migrations/<ts>_du_an_doi_chieu_streams/migration.sql`;
  - create `plans/…/reports/down.sql`;
  - modify `lib/import/import-run-store.ts:101-125` (add the 7 new tables to `IMPORT_TAGGED_TABLES`);
  - modify `lib/import/import-rollback.ts` (counts in `getRollbackInfo` lines 26-105; deletes plus the `supersededByRunId` restore in `deleteRunRows` lines 108-167, deleting aliases → lines/receipts/payments → counterparty suppliers → cost groups → counterparties);
  - create `lib/import/doi-chieu-rollback-guard.ts` (refuses rollback when the project's stream tables hold rows with another `importRunId`/NULL created or updated after commit, when rows of the run were updated after commit, or when any row of the run is superseded by a committed run) and call it from `rollbackImportRun` next to `assertRollbackAllowed` (`lib/import/import-rollback.ts:187`).
- **Tests:**
  - `npx prisma migrate dev` on a scratch database;
  - `npm run test:integration` with a new `lib/import/__tests__/doi-chieu-rollback.test.ts` covering three cases: rollback restores superseded transactions; rollback is refused after a manual receipt is added; rolling back the old run is refused while it is superseded.
- **Acceptance:** the migration applies cleanly on a copy of the local DB, existing tests pass (`npm test`), and `down.sql` reverts to the previous schema.

### Phase 3: Pure report engine with golden tests (16h, depends on Phase 1; Phase 2 only for types)
- **Files (create, each under ~200 lines)** in `lib/du-an/doi-chieu/`:
  - `item-key.ts`, `report-types.ts`, `counterparty-actual.ts`, `line-placement.ts`;
  - `report-dt-hd.ts`, `report-dt-tt-material.ts`, `report-dt-tt-counterparty.ts`, `report-dt-tt-summary.ts`, `report-hd-tt.ts`;
  - `report-rows.ts` (rows to printable/xlsx cells);
  - `report-loader.ts` (`server-only`, DB → `ReportInput`).
- **Tests** (`lib/du-an/doi-chieu/__tests__/`):
  - unit tests per function with synthetic inputs: placement exclusivity, gán chéo sign, factor NULL suppression, multi-member split flag, J/K/W/Y clamps, Phần III arithmetic, tie-out identities;
  - `golden.smoke.test.ts`, which parses the workbook with the Phase 4 readers (developed together; the test lands at the end of Phase 4 if needed), runs the engine and asserts every golden cell in §5;
  - run with `npm test`.
- **Acceptance:** unit tests are green, every tie-out identity holds on randomized inputs (property-style loop), and the golden smoke test passes locally.

### Phase 4: Import adapter for the workbook (16h, depends on Phases 2 and 3)
- **Files:**
  - create `lib/import/adapters/du-an-doi-chieu/` containing `du-an-doi-chieu.adapter.ts`, `read-du-toan-map.ts`, `read-invoices.ts`, `read-receipts.ts`, `read-cash-book.ts`, `read-counterparties.ts`, `read-report-manual-cells.ts`, `read-golden.ts`, `build-report-input.ts`, `review.ts`, `apply.ts`, `types.ts`, and `__tests__/`;
  - modify `lib/import/adapters/adapter-registry.ts:19-27` (register it).
- **Steps:** see §5. The project is chosen by the user through a `project` conflict (`lib/import/conflict-resolver.ts:71`), never hardcoded (unlike `bang-can-doi-vat-tu.adapter.ts:40`). NCCs resolve by MST, then by name (`resolveSupplier`, `conflict-resolver.ts:29`). `apply` writes with `$executeRaw`, tags every row with `importRunId` and throws on the first error, as the contract requires (`lib/import/adapters/adapter-types.ts:115-122`). `review` runs in the preview transaction that is always rolled back (`adapter-types.ts:86-96`): it dry-runs `apply`, loads `ReportInput` through `report-loader.ts` and compares against the golden cells, which proves the DB round trip as well as the parser.
- **Tests:**
  - unit tests per reader on small synthetic sheets;
  - an integration test that commits the real workbook into a scratch DB, asserts the goldens, rolls back and asserts that the 117 transactions are restored;
  - `npm run test:integration`.
- **Acceptance:**
  - all gates in §5 pass on the 17/11 14:48 workbook;
  - the re-import cycle (rollback then import) yields identical report totals;
  - Cân đối VT, Công nợ and Định mức for every project other than MNTC-GD1 show identical numbers before and after (snapshot comparison of `listCanDoiVatTu` and `getProjectSupplierDebtSummary` for all projects).

### Phase 5: Report screens, A4 print and Excel export (12h, depends on Phase 3; Phase 4 for real data)
- **Files:**
  - modify `app/(app)/du-an/[id]/layout.tsx:10-24` (one tab "Đối Chiếu DT-HĐ-TT" → `/doi-chieu`);
  - create `app/(app)/du-an/[id]/doi-chieu/layout.tsx` (sub-nav: Báo cáo DT-HĐ, DT-TT, HĐ-TT, Hóa đơn, Thực tế nhập, Chi thực tế, Ánh xạ, Đầu mối & Mã nhóm);
  - create `app/(app)/du-an/[id]/doi-chieu/page.tsx` (redirect to the DT-HĐ report);
  - create `app/(app)/du-an/[id]/doi-chieu/bao-cao/{dt-hd,dt-tt,hd-tt}/page.tsx` plus one shared `report-table.tsx` (server-rendered table of `report-rows`, with tie-out rows styled, a ✓/Δ badge, and `PrintButton`/Excel button from `components/export-buttons.tsx:21,65`);
  - create `app/api/du-an/[id]/doi-chieu/export/route.ts` (`?report=dt-hd|dt-tt|hd-tt`, same guard and xlsx pattern as `app/api/du-an/[id]/can-doi/export/route.ts:85-179`);
  - modify `app/globals.css` print block (lines 278-319) only if A4 landscape needs a `@page` rule scoped by a class.
  - Read `node_modules/next/dist/docs/` for route handlers and `params` as a Promise first (AGENTS.md).
- **Tests:** a unit test on `report-rows` (labels and number formats); a manual check that A4 landscape prints with tie-out rows on the same page as their block; `npm run build`.
- **Acceptance:** after import, on-screen totals equal the goldens exactly; the Excel export opens with the same numbers; each tie-out row shows ✓.

### Phase 6: Entry, mapping and register screens (20h, depends on Phase 2; parallel with Phase 5)
- **Files** (create services in `lib/du-an/doi-chieu/`):
  - `invoice-service.ts`, `receipt-service.ts`, `cash-payment-service.ts`, `alias-service.ts`, `register-service.ts` (đầu mối, members, Mã nhóm, DT-key → group), `schemas.ts`;
  - pages under `app/(app)/du-an/[id]/doi-chieu/` for `hoa-don`, `thuc-te-nhap`, `chi-thuc-te`, `anh-xa`, `dau-moi`, each a `page.tsx` plus a `*-client.tsx` using `components/data-grid` (`CellKind` select/number/date, `types.ts:3`; bulk paste `types.ts:58`).
  - Modify `lib/du-an/schemas.ts:110-121` and `app/(app)/du-an/[id]/cai-dat/cai-dat-client.tsx` (4 rate fields, Vietnamese labels).
  - Supplier quick-create via `onCreateOption` (`types.ts:53`) exists only on branch `feat/master-data-quick-create`. If that branch is not merged first, the NCC column uses a plain select and new NCCs are created in Danh mục.
- **Day-to-day workflow the screens implement:**
  - **Accountant, Hóa đơn:**
    - The grid shows Ngày, Số HĐ, NCC (MST shown), Tên hàng, ĐVT, SL, Đơn giá, Thành tiền chưa VAT, Thuế suất, Tiền VAT, Gồm VAT (read-only), and Mã nhóm/Dòng DT with a status chip (read-only, from the alias).
    - On a new line, Thành tiền defaults to SL × ĐG, Thuế suất defaults to the previous line of the same số HĐ, and Tiền VAT defaults to round(TT × rate). All three stay editable because printed invoices round.
    - The accountant can paste a block from Excel.
    - The footer shows Σ per số HĐ.
  - **Đội, Thực tế nhập:**
    - The grid shows Ngày, Đầu mối (required select), Tên, ĐVT, KL, Đơn giá, Thành tiền gồm VAT (defaults to KL × ĐG), Đợt, Ghi chú.
    - Running Σ per đợt and per đầu mối replace the workbook's "Cộng đến" rows.
  - **Đội/accountant, Chi thực tế:**
    - The grid shows Ngày, Nội dung, Chuyển khoản, Tiền mặt, Đầu mối/NCC (one picker listing NCC grouped under their đầu mối, plus non-NCC đầu mối), and Ghi chú. Mục I–IV is shown, derived.
  - **Accountant, Ánh xạ:**
    - There are three tabs. The DT tab has one row per DT key with a Mã nhóm picker that sets `costGroupId` on all rows of the key. The HĐ and TT tabs have one row per distinct key, with line count, Σ amount and NCCs, plus pickers for Mã nhóm, Dòng DT (filtered by group), Hệ số and Trạng thái.
    - Unmapped keys come first, sorted by amount, with a header counter "Chưa gán: n dòng, x đ".
  - **Accountant, Đầu mối & Mã nhóm:**
    - The screen has a đầu mối list (kind, nature group, order, basis, thực tế chốt, and the Σ sổ nhập / Σ sổ chi shown beside it for comparison) and members (NCC, thực nộp rà soát, thực tế riêng, đã lấy về, ghi chú).
    - It also has the Mã nhóm list (code, name, VL/NC/MTC, vật tư chính, đầu mối phụ trách).
- **Rules:**
  - All writes call `requireReleasedModuleRequest("du-an", { minLevel: create|edit|delete, scope: project })`, as the existing services do (`lib/du-an/can-doi-service.ts:388-391`).
  - `itemKey` is computed server-side.
  - Deletes are soft deletes.
  - Revalidation covers the `/doi-chieu` paths.
- **Tests:**
  - unit tests on schemas and key derivation;
  - integration tests for the services (create, edit and soft-delete per stream; the đầu mối-required rule; the (supplier, số HĐ) date-consistency rule; the XOR on payments);
  - `npm run test:integration`.
- **Acceptance:**
  - A new invoice line with an unseen name appears in the report under "chưa gán" with the block tie-out still ✓. After it is mapped on Ánh xạ, it moves under its DT line and no total changes.
  - A new receipt for a receipt-basis đầu mối raises its thực tế by exactly that amount.

### Phase 7: Dry run, cutover and docs (4h, depends on Phases 4–6)
- **Files:**
  - create `plans/…/reports/cutover-runbook.md`;
  - modify `docs/user-guide/admin.md` (or the du-an user guide if one exists), with a section for the new screens and the đầu mối basis.
- **Steps:**
  1. Back up the local copy, then migrate.
  2. Import the 17/11 workbook, check the goldens, roll back, and check that the 117 rows are restored.
  3. Re-import, then have the accountant walk through one invoice, one receipt and one payment.
  4. Freeze the workbook (read-only copy archived) and take the final import from the last saved version.
  5. Production follows only after explicit approval.
- **Acceptance:** the runbook is executed end to end on the local copy with the goldens matching, and the user has signed off on the three printed reports.

**Total ≈ 76h.** Dependency graph: Phase 1 → Phase 2 → Phase 4; Phase 1 → Phase 3 → Phase 4; Phase 3 → Phase 5; Phase 2 → Phase 6; Phases 4, 5 and 6 → Phase 7.

---

## 5. Importing this workbook

| Sheet | Read | Mapping rule |
|---|---|---|
| Ánh Xạ DT A:H | STT, tên, ĐVT, KL, Giá H.T, Mã nhóm, loại | Creates `ProjectCostGroup` (code, costKind). For each row, finds ERP estimates with the same `itemKeyOf(tên, ĐVT)` and sets their `costGroupId`. Builds STT → dtKey for Ánh Xạ HĐ. **No estimate is created or changed otherwise** (decision 1). |
| Dự Toán | not read for data | Only tên/ĐVT/KL/Giá H.T matter, and Ánh Xạ DT already rolls them up (packet §3). |
| Đề Xuất NCC | Mã nhóm, col T NCC áp dụng | Sets `costGroup.counterpartyId` via the đầu mối name resolution below. |
| Ánh Xạ Tên NCC | payee text → tên chuẩn + MST; T:U NCC trên HĐ → STT dòng DT-TT; Z nhóm tính chất | Builds đầu mối membership (`ProjectCounterpartySupplier`), natureGroup, and the payee resolver for Chi Thực Tế. |
| In A4 – DT-TT rows 53–80, 84–94, C rows | name, col H value **and formula** | Creates `ProjectCounterparty` rows in sheet order (kind by section A/B/C). An H formula of SUM over Thực Tế Nhập ranges sets basis `receipts` and tags those receipt rows with this đầu mối. A typed H sets basis `manual` with that value. C rows get basis `payments`. Rates come from D107–D119 into settings if empty. |
| In A4 – HĐ-TT rows 6–33 | A (NCC), H, S, X, Z | Typed cells go to member fields. E, G, I, T and the rest are **not** imported; they are golden values only. |
| Hóa Đơn A:Q | A ngày, B số HĐ, C NCC, D MST, E tên, ĐVT, SL, đơn giá, I thành tiền, M thuế suất, O tiền VAT | Creates `ProjectInvoiceLine`. NCC resolves by MST, then by name. Any unresolved NCC blocks the import (create it in Danh mục first). |
| Ánh Xạ HĐ A:Q | key, Mã nhóm, STT dòng DT, hệ số, xác nhận | Creates `ProjectItemAlias` with source `hd`. "OK" → `xac_nhan`, "Ngoài DT" → `ngoai_dt`, mapped without confirmation → `de_xuat`. A hệ số of 0 or blank → NULL. |
| Thực Tế Nhập A:AH | A block, B tên, C ĐVT, D ngày (serial; AH text fallback), E KL, F đơn giá, G thành tiền, L/M ghi chú | Creates `ProjectReceipt`, with batchLabel = block number and counterpartyId from the H-range tagging. "Cộng đến" rows are not stored; they are kept for the gate. Dates go through `parseExcelDate` (`lib/import/adapters/excel-utils.ts:15-38`). |
| Ánh Xạ TT A:Q | key, Mã nhóm, hệ số, F (SUMIFS) | Creates aliases with source `tt`. F is kept for the gate. |
| Chi Thực Tế A:L | B ngày (text dd/mm/yyyy, handled at `excel-utils.ts:26`), C nội dung, D CK, E TM, F ghi chú, H mục, I đầu mối chuẩn | Creates `ProjectCashPayment`. An I value that resolves to a legal NCC sets `supplierId`, otherwise it sets `counterpartyId`. Each payment's mục is checked against the mục derived from that target. |
| Hợp đồng B3:D27 | NCC, nội dung, giá trị | Creates `ProjectContract` (`prisma/schema.prisma:489-511`, already rollback-aware at `import-rollback.ts:124`). "HĐNT" → valueVnd NULL with a note. |

**Gates.** Gates G1–G9 block the commit; G3 has a warning-only part, noted below.
- **G1 Dự toán.** Every Ánh Xạ DT key matches ERP estimates. Σ ERP totalVnd by key equals KL × Giá H.T within max(1 đ, 0.005%). Mismatches are listed, and the commit is blocked unless the user acks the exact list (ack code embeds Σ Δ).
- **G2 Key collisions.** No two workbook keys may normalize to the same `itemKey` with different targets.
- **G3 Sources.** Σ parsed Hóa Đơn I and O equal the sheet sums. Σ Thực Tế Nhập G equals Σ Ánh Xạ TT F. Each block's Σ G equals its "Cộng đến" row; a failure here is a **warning**, because the row is typed and can itself be wrong, so it is shown with Δ. Σ Chi Thực Tế D + E per mục equals the sheet subtotals if present.
- **G4 Membership.** Each NCC belongs to exactly one đầu mối. Every invoice NCC is resolved.
- **G5 Golden cells.** These are computed by the engine from the dry-run DB `ReportInput`:
  - **Per-row values**, which must match within ≤ 1 đ:
    - DT-TT H for all 39 A/B rows;
    - HĐ-TT E, I, T and Y for the 28 rows;
    - each DT-HĐ block tie-out total.
  - **Totals**, which must match within ≤ 10 đ (a cumulative Decimal(18,2) rounding bound):
    - H81 = 6.531.555.276,72 and H95 = 1.984.224.628;
    - H102 = 8.515.779.904,72;
    - E34 = 6.237.094.910,14, I34 = 5.736.878.767, T34 = 6.652.018.280 and X34 = 368.652.484;
    - tổng dự toán = 10.650.193.785,77.
- **G6 Empty target.** The project has no live rows in the seven stream and register tables (roll back the earlier run first).
- **G7 Replacement ack.** The ack embeds the count and Σ amountHd of the bang-can-doi transactions to be superseded (expected 117 rows and 4.464.590.631 đ).
- **G8 Parse coverage.** Every non-empty data row of each input sheet is either imported or listed as skipped with a reason. The review shows the skipped list.
- **G9 Đầu mối tagging.** Receipt rows tagged by H ranges are disjoint, and untagged receipts are listed with Σ amount.

---

## 6. Risks and out of scope

| Risk | Likelihood × impact | Mitigation |
|---|---|---|
| Workbook formulas differ from the packet's description (P, Phần III bases, Phần II columns, H ranges) | Medium × High | Phase 1 reads the formulas before code. G5 per-row goldens catch any residual difference before commit. |
| ERP estimate names differ from Ánh Xạ DT keys, so DT values or groups are missing | Medium × High | G1 lists mismatches by key and value. Decision 1 forbids overwriting DT, so the user resolves the list by editing estimate names in Dự toán or acking it. |
| Re-import loses ERP-entered data | Low × High | The rollback guard plus the G6 empty-target check. The runbook freezes the workbook at cutover. |
| Old bang-can-doi run rolled back later, deleting the kept estimates | Low × High | The superseded-row guard (Phase 2). |
| Đội forgets đầu mối on receipts, or keeps several NCC payments on one đầu mối | Medium × Medium | Required field on new rows; "chưa gán đầu mối" and "chi chưa tách NCC" rows in the reports. |
| Old Cân Đối VT / Giao Dịch tabs for MNTC-GD1 show HĐ = 0 after the replacement | High × Low | Accepted by decision 1. See question 4. |
| Rounding drift from Decimal(18,2) on 1000+ rows | Medium × Low | Amounts are stored as entered, not recomputed. Tolerances are 1 đ per row and 10 đ per total. |
| Quick-create not yet on main | Medium × Low | Plain select fallback (Phase 6). |

**Out of scope:**
- reading from or posting to the company ledger (decision 2);
- repointing the old Cân Đối VT, Định Mức, Công Nợ NCC or Giao Dịch tabs;
- DT-HĐ diagnostic columns R–Z and the intermediate sheets;
- auto "độ tin cậy" text;
- server-side PDF (browser print stays the standard, `app/globals.css:273-277`);
- per-screen permissions finer than the existing du-an project levels;
- approval workflows on receipts or payments;
- multi-project roll-ups.

---

## 7. Unresolved questions for the user

1. **D1 confirmation.** Should thực tế per đầu mối be automatic from the đội's receipt log for material NCC, with a typed "thực tế chốt" only for tổ nhân công and lump-sum lines, and the cash book for Ông Sơn and chi khác? And should the đội be required to pick a đầu mối on every receipt line? (Recommended: yes to both.)
2. **"Đã lấy về" (HĐ-TT X).** Should it stay a single typed figure per NCC, as in the workbook, or become a dated log of amounts actually retrieved? (Recommended: a single figure now, since that matches X34 = 368.652.484.)
3. **Who enters what.** Today du-an access is one level per project. Is it acceptable that anyone with `edit` on MNTC-GD1 can edit invoices, receipts and the cash book alike, or must the đội be limited to receipts and the cash book? Per-screen limits would be new scope.
4. **Old tabs for MNTC-GD1.** After the 117 old invoice rows are superseded, Cân Đối VT and Công Nợ NCC for this project show no invoices. Should those two tabs show a notice pointing to "Đối Chiếu DT-HĐ-TT" for this project (a small change), or be left as they are?

Status: DONE_WITH_CONCERNS
Summary: The plan uses three flat đội-book streams (invoice lines, receipts, cash payments), Mã nhóm and Đầu mối registers, and one alias table. Thực tế per đầu mối uses an explicit receipts/payments/manual basis. The reports come from pure functions gated cell by cell against the workbook's golden values, and the 117 old transactions are superseded reversibly inside the import run.
Concerns: Bash failed in this session, so the workbook formulas (DT-HĐ P, Phần II columns, Phần III bases, the DT-TT H SUM ranges, HĐ-TT B–D) are unverified; Phase 1 must confirm them before Phase 3.
