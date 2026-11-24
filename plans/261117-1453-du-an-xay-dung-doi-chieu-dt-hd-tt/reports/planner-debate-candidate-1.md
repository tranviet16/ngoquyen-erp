# Candidate plan #1 — "Dự án xây dựng": Dự toán / Hóa đơn / Thực tế and the three A4 reports

Lens: reuse-first, smallest change that fully delivers the outcome. Date 2026-11-17. Base: `origin/main` (a77f7c4).

Verification note: every repo claim below was re-read on 2026-11-17 and cites `file:line`. The workbook itself could not be opened in this session: the Bash tool failed on every command with `ENAMETOOLONG: uv_spawn`, including `echo`, so node/SheetJS never ran. Workbook facts therefore come from the evidence packet. Formula shapes the packet does not give are tagged **[UNVERIFIED]**, and Phase 1 settles them before any report code is written.

---

## 1. Approach summary and answers to D1–D6

The plan keeps what already fits:
- `ProjectEstimate` stays the source of Dự toán lines.
- `Supplier.taxCode` is the MST.
- `ProjectSettings` holds the rates.
- `ProjectContract` holds Hợp đồng.
- The import engine with preview/review/ack/rollback is reused as is.
- The `bucketOf` status rule from `can-doi-metrics.ts` is reused.
- The data-grid, export-route and print-CSS patterns are reused.

Reuse fails in three places, and the plan says so plainly:
- `ProjectTransaction` cannot hold invoices, receipts or payments, because its join key `categoryId + itemCode` is fixed when the row is entered (`lib/du-an/can-doi-service.ts:90-92`, `prisma/schema.prisma:462-463`).
- `ProjectMaterialGroup` cannot be the Mã nhóm, because a group must stay inside one hạng mục (`lib/du-an/material-group-service.ts:126-137`) and it drives the Định mức flags (`lib/du-an/material-group-rollup.ts:1-7`).
- `SupplierDeliveryDaily` and `ledger_transactions` are excluded by decision 2.

So the plan adds seven small, flat tables: four for structure (Mã nhóm, alias mapping, đầu mối, đầu mối↔NCC) and three for the input streams (invoice lines, receipts, cash payments). It adds one marker column to `ProjectTransaction` so the 117 old rows can be swapped out reversibly, and four rate columns to `ProjectSettings`. All report math lives in pure functions. Delivery order is: Phase 1 locks the spec, then the schema, then the import plus the three reports proven against the golden totals, then the entry screens and the mapping screen.

### D1 — Source of "thực tế" per đầu mối: hybrid (a)+(b), chosen explicitly per đầu mối

Each đầu mối carries `actualSource ∈ {receipts, payments, manual}`:
- **receipts:** thực tế = Σ amount of receipts tagged to that đầu mối. This matches DT-TT rows whose H cell is a SUM over Thực Tế Nhập ranges. The importer reads those ranges and tags the receipt rows.
- **manual:** thực tế = `actualManualVnd`. This matches typed H cells and the 11 tổ nhân công, which are typed per the packet.
- **payments:** thực tế = Σ cash payments tagged to that đầu mối. This is for Phần II C (Ông Sơn vật tư lẻ, chi khác) **[UNVERIFIED whether those H cells read Chi Thực Tế]**.

Option (c), the company ledger, is rejected as a source. Decision 2 keeps the đội's book separate, the ledger has no tổ nhân công, Ông Sơn or chi khác (packet §5), and the 25/26 agreement is a one-time reconciliation fact, not an invariant. If the report were coupled to the ledger, every company-side correction would silently change the đội's report.

- **Assumption it depends on most:** DT-TT H53:H80 formulas are plain `SUM(...)` over Thực Tế Nhập G ranges, so they can be parsed.
- **How it fails first:** an H cell such as `=SUM(G10:G40)-1500000` or a SUMIFS cannot be turned into row tags. Fallback: the importer stores that đầu mối as `manual` with the cell's cached value and lists it in review as a warning. Parity still holds; only the drill-down from that đầu mối to its receipts is lost.

### D2 — Data model: new streams, reuse everything that carries the data

- Invoice lines, receipts and cash payments get new flat tables.
- The mapping, đầu mối and Mã nhóm get new tables.
- `ProjectTransaction` is not extended with streams. It only gains `supersededByRunId` for the replacement.
- No invoice header table. The Hóa Đơn sheet carries VAT per line (M thuế suất, O tiền VAT dòng), so the header (ngày, số HĐ, NCC) is derived by grouping.
- **Assumption it depends on most:** the user accepts that the old Cân đối VT, Định mức, Công nợ NCC and Giao dịch tabs show no HĐ for MNTC-GD1 once the 117 rows are superseded. All of them read only `project_transactions` with `deletedAt IS NULL`: `can-doi-service.ts:92,106`, `supplier-debt-service.ts:64-66`, `dashboard-service.ts:34-36`, and `vw_project_norm` in `prisma/migrations/20260504140000_add_project_views/migration.sql:32`. The new DT-HĐ report takes over their role for this project.
- **How it fails first:** the user expects the old Cân đối VT tab to show the new invoices. That is unresolved question 1.

### D3 — Mapping: one alias table, decided after entry, not at entry

- One `ProjectItemAlias` keyed by (project, source `dt|hd|tt`, normKey of `tên|ĐVT`). It points to a Mã nhóm, a DT line key, a hệ số (null means "theo dõi theo giá trị") and a status (`xac_nhan|de_xuat|ngoai_dt`).
- The "chưa gán" state is not stored. It is a line whose key has no alias row, found with a LEFT JOIN, so entering data never writes mapping rows as a side effect.
- **Assumption it depends on most:** `normKey = normVtName(tên) + "|" + normVtName(ĐVT)` (`lib/text/norm-vt-name.ts:6-21`) folds spelling variants without merging different items.
- **How it fails first:** two workbook keys with different Mã nhóm collapse to one normKey. The import blocks and lists the collisions. The fix is to rename one source line, or to tighten normKey to accent-preserving trim and lowercase. Phase 1 measures the collision count on the real file before the choice is fixed.

### D4 — Đầu mối model

- `ProjectCounterparty` is the DT-TT Phần II line, with kind `ncc|to_nhan_cong|khac`, sort group and the actual rule.
- `ProjectCounterpartySupplier` links a legal NCC to exactly one đầu mối per project (Sobek ← Chương Dương + LPP). It is also the HĐ-TT row and holds that row's manual inputs: H thực nộp override, S thực tế tách riêng, X đã lấy về, Z việc cần làm.
- Tổ nhân công, Ông Sơn and chi khác are đầu mối with no linked supplier.
- `ProjectGroupCode.counterpartyId` is the "NCC phụ trách" from Đề Xuất NCC col T.
- **Assumption it depends on most:** Ánh Xạ Tên NCC T:U maps each legal NCC to a single DT-TT line.
- **How it fails first:** one NCC appears on two lines. The unique (project, supplier) index rejects it at import as a blocking message, and the user must choose a line.

### D5 — Order: spec, schema, import and reports (parity), then screens

The import is a generic adapter. It has no hardcoded project: the project is resolved through the engine's `project:` conflict mapping, the same pattern as `lib/import/adapters/cong-no-nhan-cong.adapter.ts:142` and `lib/import/conflict-resolver.ts:71-82`. It is gated by the golden totals and is fully reversible. The reports are built and proven on real data before any entry screen, because parity is where the design can be wrong.

Until the entry screens ship, the workbook stays the master. Re-sync means rolling back the run and importing again; the re-import guard forces that order.

- **Assumption it depends on most:** the workbook as saved on 17/11 14:48 is stable between the local dry run and the production import.
- **How it fails first:** the đội edits the file in between. The gates are recomputed from the file's own cached report cells at each preview, so a changed file either passes again or blocks. Nothing stale gets committed.

### D6 — Phần III inputs

- Add `generalCostPct` (7%), `tempHousingPct` (1%), `unmeasuredPct` (3%) and `presumptiveIncomePct` (6%) to `ProjectSettings`.
- Reuse `vatPct` (`prisma/schema.prisma:539`), set to 8% for MNTC-GD1.
- Users with du-an `edit` enter them on the Cài đặt tab (`lib/du-an/settings-service.ts:16-22`).
- The importer does **not** write settings, because settings rows carry no `importRunId` and could not be rolled back. Instead, review blocks when the settings differ from the rates in DT-TT column D, rows 106–119.
- **Assumption it depends on most:** the rates are project-wide and apply to fixed bases.
- **How it fails first:** the bases (for example, whether nhà tạm is 1% of T or of T+C) are wrong. The gate "Phần III dự toán = 10.650.193.785,77" fails. Phase 1 reads the formulas and pins the bases **[UNVERIFIED]**.

---

## 2. Data model

### Data flow

```
Workbook ──adapter(parse→review gates→apply, importRunId on every row)──┐
Entry screens (Hóa đơn / Thực tế / Ánh xạ & Đầu mối / Cài đặt) ─────────┤
                                                                         ▼
 project_estimates (kept) ─┐   project_invoice_lines ─┐   project_actual_receipts ─┐  project_cash_payments ─┐
                           └──── project_item_aliases (dt|hd|tt) ──── project_group_codes ── project_counterparties ── project_counterparty_suppliers
                                                                         ▼
                   report-loader (one read per table, project-scoped)  →  pure fns (dt-hd, dt-tt, phan-iii, hd-tt)
                                                                         ▼
                                   /du-an/[id]/doi-chieu screen  ·  A4 print (globals.css @media print)  ·  .xlsx export route
```

### Changes to existing models (`prisma/schema.prisma`)

| Model | Change | Reason |
|---|---|---|
| `ProjectTransaction` (457-487) | add `supersededByRunId Int?` and `@@index([supersededByRunId])` | Reversible replacement of the 117 old rows. Every consumer already filters `deletedAt IS NULL`, so no consumer changes. |
| `ProjectSettings` (537-549) | add `generalCostPct`, `tempHousingPct`, `unmeasuredPct`, `presumptiveIncomePct`, all `Decimal(5,4)` with defaults 0.07 / 0.01 / 0.03 / 0.06 | Phần III (D6). `vatPct` is reused. |
| `ProjectEstimate`, `ProjectContract`, `Supplier` | none | The DT line = estimates grouped by normKey across categories. Contracts are imported with `partyName` = canonical supplier name and `docType = "contract"`. |

### New models (all have `projectId`, `note String?`, `deletedAt`, `createdAt`, `updatedAt`, `importRunId Int?` → `ImportRun` `onDelete: SetNull`, and `@@index([projectId])`)

1. **`ProjectGroupCode`** (`project_group_codes`), the Mã nhóm: `code`, `name`, `counterpartyId Int?` (NCC phụ trách), `isMainMaterial Boolean @default(false)` (membership of DT-TT Phần I), `sortOrder Int`. Partial unique `(projectId, code) WHERE deletedAt IS NULL`, written as raw SQL in the migration (the convention noted at `schema.prisma:422`).
2. **`ProjectItemAlias`** (`project_item_aliases`): `source` (`dt|hd|tt`), `normKey`, `itemName`, `unit` (display), `groupCodeId Int?`, `dtKey String?` (normKey of the target DT line; hd/tt only), `factor Decimal(18,6)?` (null = value-only; the importer turns 0/blank into null), `kind String?` (`VL|NC|MTC`, dt only, from Ánh Xạ DT loại), `status` (`xac_nhan|de_xuat|ngoai_dt`). Partial unique `(projectId, source, normKey)`.
   - The DT line is referenced by key, not by `estimateId`, because one workbook DT line is the sum over up to 6 hạng mục rows.
3. **`ProjectCounterparty`** (`project_counterparties`), the đầu mối / DT-TT Phần II line: `name`, `kind` (`ncc|to_nhan_cong|khac`), `sortGroup String?` (Ánh Xạ Tên NCC col Z), `sortOrder Int`, `actualSource` (`receipts|payments|manual`), `actualManualVnd Decimal(18,2)?`, `vatPct Decimal(5,4)?` (null = project vatPct). Partial unique `(projectId, name)`.
4. **`ProjectCounterpartySupplier`** (`project_counterparty_suppliers`), the HĐ-TT row: `counterpartyId`, `supplierId`, `splitActualVnd Decimal?` (S), `paidOverrideVnd Decimal?` (H), `recoveredVnd Decimal?` (X), `todoNote String?` (Z). Partial unique `(projectId, supplierId)`.
5. **`ProjectInvoiceLine`** (`project_invoice_lines`): `supplierId` (required), `invoiceDate`, `invoiceNo`, `itemName`, `unit`, `qty Decimal(18,4)`, `unitPrice Decimal(18,2)`, `amountVnd Decimal(18,2)` (chưa VAT, as printed on the invoice; an input, not a derived total), `vatPct Decimal(5,4)?`, `vatVnd Decimal(18,2)`. Indexes `(projectId, supplierId)` and `(projectId, invoiceDate)`.
6. **`ProjectActualReceipt`** (`project_actual_receipts`): `date`, `itemName`, `unit`, `qty Decimal?`, `unitPrice Decimal?`, `amountVnd Decimal(18,2)` (gồm VAT), `counterpartyId Int?`, `blockNo Int?` (Thực Tế Nhập col A lot number).
7. **`ProjectCashPayment`** (`project_cash_payments`): `date`, `content`, `bankVnd`, `cashVnd` (both `Decimal(18,2) @default(0)`), `section` (`I|II|III|IV`), `expenseGroup String?` (nhóm chi), `counterpartyId Int?`, `supplierId Int?` (legal NCC, used for HĐ-TT G).

All foreign keys to project-scoped parents use `onDelete: Restrict`. Deletion goes through soft delete in the services, and the import rollback goes through the explicit guard below.

### Migration notes

- One migration, `prisma/migrations/<YYYYMMDDHHMMSS>_du_an_doi_chieu_dt_hd_tt/migration.sql`, purely additive: new tables, nullable or defaulted columns, partial unique indexes. Other projects are unaffected because no existing row changes.
- **Replacing MNTC-GD1's 117 old `project_transactions`:**
  1. **Backup:** run `pg_dump -Fc` of the target DB before any commit. The local copy comes first; production only after deploy approval. Record the file path in the go-live runbook.
  2. **Review (in the new adapter):** select rows of the chosen project with `deletedAt IS NULL` whose `importRunId` belongs to a committed run of adapter `bang-can-doi-vat-tu`. Show the count and Σ `amountHd` (expected 117 and 4.464.590.631 from packet §5: 3.654.194.738 + 153.530.093 + 416.607.407 + 240.258.393). Require the ack `replace-ptx:v1:<count>:<sumHd>`, so any change in the numbers forces a new ack (pattern from `lib/import/adapters/adapter-types.ts:98-109`). Rows not created by that adapter are never touched and are listed as information.
  3. **Apply:** one `$executeRaw` sets `deletedAt = NOW(), "supersededByRunId" = <runId>`. It runs in the same commit transaction as the inserts (rules at `adapter-types.ts:116-122`).
  4. **Rollback:** extend `deleteRunRows` (`lib/import/import-rollback.ts:108-137`) with `UPDATE project_transactions SET "deletedAt" = NULL, "supersededByRunId" = NULL WHERE "supersededByRunId" = ${id}`, plus DELETEs for the 7 new tables, children first. Extend `getRollbackInfo` (`import-rollback.ts:26-105`) with the new counts.
  5. **Guards (new `lib/du-an/doi-chieu/rollback-guard.ts`, called from `rollbackImportRun` next to `assertRollbackAllowed`, `import-rollback.ts:187`):**
     - Refuse to roll back a new run while rows created outside that run point to its counterparties or group codes. This prevents FK errors and silent loss.
     - Refuse to roll back the old `bang-can-doi-vat-tu` run while any of its transactions has `supersededByRunId` set by a committed run (newer run first). Rolling the old run back would also delete the 362 estimates the reports key on.
  6. **Last resort:** `pg_restore` of the dump.
- The old adapter stays registered (`lib/import/adapters/adapter-registry.ts:19-27`). No change.

---

## 3. Report computation

Common terms:
- **DT line L:** the estimates of the project with the same normKey. KL = Σ `qty`, value = Σ `totalVnd`, Giá H.T = value / KL.
- **Kind of L:** the `kind` of its dt alias.
- **Mã nhóm of L:** `groupCodeId` of its dt alias.
- **Đầu mối B of a Mã nhóm:** `counterpartyId`.
- **Legal NCC → B:** via `ProjectCounterpartySupplier`.
- **vat(B):** `B.vatPct ?? settings.vatPct`.
- **actual(B):** follows the D1 rule; implemented as one pure function, `actual-per-counterparty.ts`.

### DT-HĐ (`dt-hd-report.ts`)

Hierarchy: block B → Mã nhóm (`counterpartyId = B`) → DT line → "↳" invoice lines whose hd alias has `dtKey = L`. Lines with an alias to a group but no `dtKey` appear as "↳ chỉ gán tới nhóm" under the group.

| Column | Source |
|---|---|
| ĐVT, KL DT, Giá trị DT | estimates grouped by normKey |
| KL đã lấy HĐ (quy đổi) | Σ `invoice.qty × alias.factor`. Blank ("theo giá trị") if any member line has a null factor. |
| KL thiếu/vượt | KL DT − KL HĐ, only when KL HĐ is defined |
| Giá trị HĐ chưa VAT | Σ `invoice.amountVnd` |
| Cân đối ròng | Giá trị DT − Giá trị HĐ |
| Tình trạng | `bucketOf` reused from `lib/du-an/can-doi-metrics.ts:56-77` |
| NCC / ghi chú | distinct supplier names of the member invoices, plus the alias note |
| L thực tế chốt gồm VAT | actual(B), block row |
| M thực tế chưa VAT | L / (1 + vat(B)) |
| N HĐ do NCC xuất gộp | Σ `amountVnd` of all invoices whose supplier maps to B |
| O gán chéo ròng | (B's invoices mapped into other blocks' groups) − (other suppliers' invoices mapped into B's groups) **[UNVERIFIED sign]** |
| P còn phải lấy HĐ so thực tế | M − N **[UNVERIFIED: M − N vs M − (N − O)]** |
| Q ghi chú | `ProjectCounterparty.note` |

Tie-out rows:
- **Per block:** HĐ in B's groups + B's invoices with no alias or `ngoai_dt` + B's invoices in other blocks' groups − other suppliers' invoices in B's groups must equal N. The row shows "✓ Khớp sổ Hóa Đơn" when |Δ| ≤ 1 đ.
- **Grand:** Σ N over blocks + invoices of suppliers linked to no đầu mối (pseudo-block "Chưa có đầu mối") must equal Σ of all invoice lines.
- **Phần B:** invoices outside DT, listed by NCC. Columns R–Z are not reproduced (decision 3).

### DT-TT

- **Phần I** (`dt-tt-report.ts`), groups with `isMainMaterial`, one row per DT line:
  - KL DT and đơn giá DT from L.
  - KL thực nhận = Σ `receipt.qty × tt-alias.factor` over receipts with tt alias `dtKey = L`.
  - TT chưa VAT = Σ `receipt.amountVnd / (1 + vat)`.
  - Đơn giá TT = TT chưa VAT / KL thực nhận.
  - Chênh do KL = (KL TT − KL DT) × giá DT. Chênh do đơn giá = (giá TT − giá DT) × KL TT. Check: the two parts sum to TT − DT.
  - "↳ Thực nhận chỉ gán tới nhóm" rows come from receipts whose tt alias has a group but no `dtKey`.
  - The receipts VAT uses the project `vatPct`, with the đầu mối override when the receipt is tagged.
- **Phần II:**
  - **A:** đầu mối of kind `ncc`.
  - **B:** kind `to_nhan_cong`.
  - **C:** kind `khac`.
  - Per line: DT trực tiếp = Σ DT value of its Mã nhóm, shown with and without VAT; H thực tế chốt = actual(B); chênh = H − DT gồm VAT **[UNVERIFIED: columns other than H]**.
  - Totals: H81 = Σ A, H95 = Σ B, H102 = A + B. The packet's numbers satisfy 6.531.555.276,72 + 1.984.224.628 = 8.515.779.904,72, so C is not part of H102 **[confirm in Phase 1]**.
  - Check row: Σ receipts tagged to any đầu mối + Σ untagged receipts = Σ Thực Tế Nhập.
- **Phần III** (`phan-iii.ts`):
  - T = Σ DT value of lines by kind (VL + NC + MTC).
  - The indirect items (chi phí chung, nhà tạm, không xác định KL), thu nhập chịu thuế tính trước and VAT come from the settings rates on bases pinned in Phase 1.
  - Thực tế per khoản mục: VL+MTC from Phần II A, NC from B, khác from C **[UNVERIFIED mapping]**.
  - Check rows: "DT chưa phân loại" = Σ DT of lines with no dt alias, which must be 0, and computed dự toán = 10.650.193.785,77 ± 1 đ on MNTC-GD1.

### HĐ-TT (`hd-tt-report.ts`)

Rows are `ProjectCounterpartySupplier` ∪ suppliers that have invoices, sorted by đầu mối `sortGroup` / `sortOrder`.

| Col | Formula / source |
|---|---|
| E | Σ (`amountVnd + vatVnd`) of the supplier's invoice lines |
| G | Σ (`bankVnd + cashVnd`) of payments with that `supplierId` |
| H | `paidOverrideVnd` |
| I | H ?? G |
| J | max(0, E − I) |
| K | max(0, I − E) |
| L | I / E (null when E = 0) |
| Q | đầu mối name |
| R | actual(đầu mối) |
| S | `splitActualVnd` |
| T | S ?? R. A warning appears when the đầu mối has more than one supplier and S is null. |
| U | T − E |
| V | T − I |
| W | max(0, J − V) |
| X | `recoveredVnd` |
| Y | W − X |
| Z | `todoNote` |

Row 34 = column sums. Check: Σ E = Σ invoice lines gồm VAT.

### Golden gates (packet §3)

These are tested in the real-file smoke test and in the local dry run:
- H81 = 6.531.555.276,72; H95 = 1.984.224.628; H102 = 8.515.779.904,72.
- E34 = 6.237.094.910,14; I34 = 5.736.878.767; T34 = 6.652.018.280; X34 = 368.652.484.
- Plus per-row parity for DT-TT rows 53–80 and 84–94 and HĐ-TT rows 6–33, with tolerance ≤ 1.000 đ per row and ≤ 1 đ for totals derived from typed figures.

---

## 4. Phases

Total effort is about 12.5 dev-days. The dependency chain is P1 → P2 → (P3 ∥ P4) → P5 → P8 (release 1: reports on imported data), then P6 → P7 (release 2: entry and mapping). P6 may start right after P2 if staffed, because its file set is disjoint.

### Phase 1 — Spec lock from the workbook (0.5 d, no repo code)

- **Goal:** settle every [UNVERIFIED] item before writing code.
- **Files:** `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/workbook-spec-dump.md` (planning artifact).
- **Steps:**
  1. Write a throwaway node + SheetJS script in the scratchpad that dumps the formulas (`.f`) and cached values of:
     - DT-HĐ L–Q on 3 sample blocks;
     - DT-TT H53:H94, the C rows, D/H106:H119 and row 3;
     - HĐ-TT A–Z rows 6–34;
     - Thực Tế Nhập "Cộng đến" rows;
     - Chi Thực Tế H/I/J samples.
  2. Count normKey collisions across Ánh Xạ DT/HĐ/TT.
  3. Compare the Ánh Xạ DT keys with the DB's 362 estimates (normKey, Σ qty, Σ totalVnd) on the local copy.
- **Acceptance:**
  - Each [UNVERIFIED] formula is written down with its cell reference.
  - The collision count is known.
  - The DT key match rate is known. If it is below 100%, unresolved question 2 goes to the user before Phase 4.
- **Depends on:** none.

### Phase 2 — Schema, migration, rollback extension, settings rates (1 d)

- **Goal:** the tables exist, rollback is symmetric, and the rates are editable.
- **Files:**
  - Modify: `prisma/schema.prisma`, `lib/import/import-rollback.ts`, `lib/du-an/schemas.ts` (`settingsSchema` at 110-121), `lib/du-an/settings-service.ts`, `app/(app)/du-an/[id]/cai-dat/cai-dat-client.tsx`.
  - Create: `prisma/migrations/<ts>_du_an_doi_chieu_dt_hd_tt/migration.sql`, `lib/du-an/doi-chieu/keys.ts` (normKey and the DT-line grouping helper), `lib/du-an/doi-chieu/types.ts`, `lib/du-an/doi-chieu/rollback-guard.ts`.
- **Steps:**
  1. Add the models and the partial unique indexes.
  2. Add the 4 rate fields to the schema, service and form.
  3. Add the supersede-restore step and the new-table deletes to `deleteRunRows` and the counts to `getRollbackInfo`.
  4. Add both rollback guards.
- **Tests:**
  - `npx prisma validate`, `npx prisma migrate dev`, `npx tsc --noEmit`.
  - Unit tests in `lib/du-an/doi-chieu/__tests__/keys.test.ts`.
  - Integration test `test/integration/du-an-doi-chieu-rollback.integration.test.ts`: superseded rows come back on rollback; the guard blocks the old run while a newer run supersedes it.
- **Acceptance:**
  - The migration applies on an empty DB and on the local copy.
  - The existing suites `npm test` and `npm run test:integration` stay green.
- **Rollback:** drop the migration. The change is additive, so no data migrates.
- **Depends on:** P1.

### Phase 3 — Pure report math and loader (2 d)

- **Goal:** the three reports are computed from plain inputs.
- **Files (create, `lib/du-an/doi-chieu/`):**
  - `actual-per-counterparty.ts`, `dt-hd-report.ts`, `dt-tt-report.ts`, `phan-iii.ts`, `hd-tt-report.ts`.
  - `report-loader.ts` (`"use server"`, one `findMany` per table, guarded by `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } })` as in `can-doi-service.ts:70-73`).
  - Tests in `__tests__/`.
- **Steps:** implement the formulas in §3 with the Phase 1 bases. Every tie-out returns `{expected, actual, ok}`. No numbers are formatted here.
- **Tests:** `npx vitest run --project unit lib/du-an/doi-chieu`. Synthetic cases:
  - fold of 2 NCC into one đầu mối;
  - cross-assigned invoice, where the tie-out identity holds;
  - null hệ số;
  - group-only receipts;
  - S split;
  - H override;
  - Phần III against a hand-computed example.
- **Acceptance:** every tie-out identity is proven by a test; files stay under 200 lines.
- **Depends on:** P2 (types).
- **Owns:** only the files above.

### Phase 4 — Import adapter for the workbook (2.5 d)

- **Goal:** a reversible, gated import into any chosen project.
- **Files:**
  - Create in `lib/import/adapters/doi-chieu-dt-hd-tt/`: `doi-chieu.adapter.ts`, `sheet-readers.ts`, `dtt-formula-ranges.ts`, `gates.ts`, `apply.ts`, `__tests__/sheet-readers.test.ts`, `__tests__/real-file.smoke.test.ts` (skipped when the env var `DOI_CHIEU_WORKBOOK` is unset, same idea as `vat-tu-chuyen-doi/__tests__/cutover-plan.real-folder.smoke.test.ts`).
  - Modify: `lib/import/adapters/adapter-registry.ts` (add to `ADAPTERS`).
  - Integration test: `test/integration/du-an-doi-chieu-import.integration.test.ts`.
- **Steps:** see §5. The adapter name is `doi-chieu-dt-hd-tt`, because `du-an-xay-dung` is taken (`du-an-xay-dung.adapter.ts:54`).
  - `supportsRollback: true`.
  - The project comes from the `project:` conflict.
  - Suppliers are matched by MST to `Supplier.taxCode` first, then by `supplier:` conflict (`conflict-resolver.ts:29-40`); a `"new"` choice creates the supplier inside apply.
  - `review()` returns blocking messages and acks, rendered by the generic section (`app/(app)/admin/import/[runId]/generic-review-section.tsx:8-33`).
- **Tests:**
  - The smoke test parses the real file and feeds the parsed rows straight into the Phase 3 functions in memory. All golden gates must pass with no DB involved.
  - The integration test covers: commit into a seeded project; 2 old rows superseded; another project untouched; re-import blocked; rollback restores everything.
- **Acceptance:** the smoke test is green on the 17/11 file, and the integration test is green.
- **Depends on:** P2. Runs in parallel with P3; the smoke test needs P3 merged.

### Phase 5 — Report screen, A4 print, Excel export (2 d)

- **Goal:** the three reports are visible, printable and exportable.
- **Files:**
  - Create: `app/(app)/du-an/[id]/doi-chieu/page.tsx` (server, `?bao-cao=dt-hd|dt-tt|hd-tt`), `dt-hd-view.tsx`, `dt-tt-view.tsx`, `hd-tt-view.tsx`, `app/api/du-an/[id]/doi-chieu/export/route.ts`, `lib/du-an/doi-chieu/export-sheets.ts` (AOA builders).
  - Modify: `app/(app)/du-an/[id]/layout.tsx` (add the "Đối Chiếu" tab to `TABS`, lines 10-24) and `app/globals.css` (A4 landscape rules inside the existing `@media print` block at 278).
- **Steps:**
  1. Read `node_modules/next/dist/docs/` for App Router page and route-handler conventions (AGENTS.md).
  2. Render the tables as server components. Check and tie-out rows are styled ✓/✗.
  3. Print with "In A4" = `window.print()`, following the existing approach (comment at `globals.css:273-277`).
  4. The export copies the guard, AOA and number-format pattern of `app/api/du-an/[id]/can-doi/export/route.ts:85-179`, one sheet per report.
- **Tests:**
  - Unit tests for `export-sheets.ts` (header and total rows).
  - Manual check on the local copy: the on-screen totals equal the export totals equal the golden totals.
  - `npm run build`.
- **Acceptance:** the three reports render for MNTC-GD1 after the P8 dry run, and both the A4 print preview and the .xlsx open correctly.
- **Depends on:** P3, and P4 for real data.

### Phase 6 — Entry screens (2.5 d)

- **Goal:** places to enter Hóa đơn, Thực tế nhập, Chi thực tế and đầu mối figures.
- **Files:**
  - Create: `lib/du-an/doi-chieu/invoice-service.ts`, `receipt-service.ts`, `payment-service.ts`, `counterparty-service.ts`, `entry-schemas.ts`, `app/(app)/du-an/[id]/hoa-don/page.tsx`, `hoa-don-client.tsx`, `app/(app)/du-an/[id]/thuc-te/page.tsx`, `thuc-te-nhap-client.tsx`, `chi-thuc-te-client.tsx`.
  - Modify: `layout.tsx` TABS ("Hóa Đơn", "Thực Tế").
- **Steps:**
  - CRUD services follow `transaction-service.ts` (ACL per action, soft delete, `revalidatePath` of `/doi-chieu`).
  - The grids use the dynamic `DataGrid` pattern of `giao-dich-client.tsx:22-32`.
  - The supplier column uses the inline quick-create once `feat/master-data-quick-create` is merged; until then, a plain select.
  - The receipt grid has an optional "Đầu mối" column.
  - The payment grid has Mục I–IV, Đầu mối and NCC.
- **Tests:**
  - Unit tests for the zod schemas.
  - Integration test of create, edit, soft delete and ACL (read-only user refused).
  - Manual check: a new invoice line appears in DT-HĐ ("chưa gán" if its key is new).
- **Acceptance:** every field the reports need can be entered without the workbook.
- **Depends on:** P2, and the quick-create merge for the nice-to-have column.

### Phase 7 — Ánh xạ & Đầu mối screen (1.5 d)

- **Goal:** map keys after entry; manage Mã nhóm, đầu mối, NCC links and the HĐ-TT manual figures.
- **Files:**
  - Create: `lib/du-an/doi-chieu/alias-service.ts`, `group-code-service.ts`, `app/(app)/du-an/[id]/anh-xa/page.tsx`, `anh-xa-client.tsx`, `dau-moi-client.tsx`, `ma-nhom-client.tsx`.
  - Modify: `layout.tsx` TABS ("Ánh Xạ").
- **Steps:**
  1. List the distinct keys from lines LEFT JOIN alias, with counts and amounts, and the "chưa gán" counter first.
  2. Provide pickers for Mã nhóm and DT line, plus hệ số, Xác nhận and Ngoài DT.
  3. List orphan aliases, where the DT key is no longer present.
  4. Đầu mối tab: kind, actualSource, manual figure, VAT, linked NCC with H/S/X/Z.
- **Tests:**
  - Unit tests for alias upsert rules.
  - Integration test: a confirmed alias moves the line in the DT-HĐ report.
- **Acceptance:** an unseen invoice name goes from "chưa gán" into its DT line after one confirmation.
- **Depends on:** P2 and P3.

### Phase 8 — Dry run on the local copy, then production runbook (0.5 d, plus approval wait)

- **Goal:** parity on real data before production.
- **Files:**
  - Modify: `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md`, or create a dedicated runbook in this plan's `reports/`.
  - Update `docs/user-guide/` for du-an if a du-an page exists (check first).
- **Steps:**
  1. `pg_dump` the local copy.
  2. Enter the rates on Cài đặt.
  3. Run the import with preview, resolve conflicts, ack the replacement, commit.
  4. Compare the screens against the golden totals.
  5. Roll back, check the 117 rows are restored, re-import.
  6. Write the production steps.
- **Acceptance:**
  - All golden gates match.
  - Rollback restores the exact pre-import counts (117 transactions, 362 estimates).
  - Other projects' Cân đối VT export is byte-identical before and after.
- **Depends on:** P4 and P5.

---

## 5. Import of this workbook (`doi-chieu-dt-hd-tt` adapter)

**Read order and mapping:**

| Sheet / range | Rows → target | Rules |
|---|---|---|
| Ánh Xạ DT A1:H346 | 343 → `ProjectItemAlias(source=dt)` + `ProjectGroupCode` (distinct Mã nhóm) | Key matched to DB estimates by normKey. KL and Giá H.T are compared to the DB, not written. Loại → `kind`. The Dự Toán sheet is not imported (decision 1 keeps the DB lines). |
| Đề Xuất NCC A1:AG101 | 91 groups → `ProjectGroupCode.counterpartyId` | NCC ÁP DỤNG (col T) resolved to a đầu mối through Ánh Xạ Tên NCC. Blank → null (pseudo-block). |
| DT-TT A53:H80, A84:H94, C rows | → `ProjectCounterparty` (kind ncc / to_nhan_cong / khac, sortOrder = sheet order) | H with SUM-over-Thực Tế Nhập formula → `receipts` plus receipt tags from the parsed ranges (`dtt-formula-ranges.ts`). Typed → `manual` with the value. **[C-row rule from Phase 1]** |
| Ánh Xạ Tên NCC A1:AA72 | → `ProjectCounterpartySupplier` (T:U), sortGroup (Z), payee→supplier map (for payments) | MST → `Supplier.taxCode`. |
| HĐ-TT rows 6–33 | → `ProjectCounterpartySupplier` H/S/X/Z | Only typed cells (no `.f`) become overrides. Formula cells are ignored. |
| Hóa Đơn A1:Q286 | ~285 → `ProjectInvoiceLine` | A date (`parseExcelDate`, `excel-utils.ts:15`), B số HĐ, C/D NCC/MST, E tên, ĐVT, SL, đơn giá, I amount, M vatPct, O vatVnd. Numbers via `parseVndNumber` (`excel-utils.ts:45`). |
| Ánh Xạ HĐ A1:Q237 | → alias source=hd | STT dòng DT → `dtKey` through the Ánh Xạ DT row. Hệ số 0/blank → null. OK → `xac_nhan`, Ngoài DT → `ngoai_dt`, else `de_xuat`. |
| Thực Tế Nhập A1:AH1014 | ~1000 → `ProjectActualReceipt` | Block no. carried down from col A. Skip "Cộng đến…" rows (kept for the gate). Date D serial, else AH text via `parseNlDate` (`vat-tu-chuyen-doi/dirty-date.ts:202`). G = amount gồm VAT. L/M → note. Helper cols Y–AG are not read. |
| Ánh Xạ TT A1:Q148 | → alias source=tt | Same rules as HĐ. |
| Chi Thực Tế A1:L153 | ~145 → `ProjectCashPayment` | B text date dd/mm/yyyy, C content, D CK, E TM, F note, H section, I đầu mối (cached value) → counterpartyId, supplierId via the payee map, J → expenseGroup. |
| Hợp đồng B3:D27 | → `ProjectContract` (`docType=contract`, partyName, valueVnd null when "HĐNT") | |

**Review gates.** All are blocking unless marked as a warning. Golden values are read from the file's own cached cells at each preview, and the smoke test also asserts the packet's numbers.

1. A project is resolved, and that project has no active rows in the new tables (re-import guard).
2. The replacement ack `replace-ptx:v1:<count>:<sumHd>` is given.
3. Every Ánh Xạ DT key with KL > 0 matches a DB DT line. Σ KL agrees within 0,1% and the value within 1.000 đ. Blocking list of up to 20 keys.
4. No normKey collision with conflicting mappings, within any source.
5. Every hd/tt alias `dtKey` exists among the dt keys.
6. Every invoice NCC is resolved to a supplier, by MST or mapping.
7. Σ invoice amount and Σ VAT equal the Hóa Đơn sheet totals; HĐ-TT E34 = 6.237.094.910,14.
8. Σ receipts per block equals its "Cộng đến" row (warning), and Σ G per key equals Ánh Xạ TT col F.
9. Recomputed DT-TT H per row equals the cached H (≤ 1.000 đ); H81, H95 and H102 are exact to 1 đ.
10. Recomputed HĐ-TT I34, T34 and X34 equal the cached values.
11. Project settings rates equal DT-TT D106:D119, and `vatPct` equals the row-3 default (8%).
12. Phần III dự toán = 10.650.193.785,77.

**Apply** uses `$executeRaw` inserts carrying `importRunId` (`adapter-types.ts:116-122`), in this order: group codes → counterparties → counterparty-suppliers → aliases → invoices → receipts → payments → contracts → supersede old transactions. Gates 9–12 run in `review` with `phase="preview"`. As the engine contract allows (`adapter-types.ts:86-96`), the dry-run write goes through the same `apply` code path, and the reports are recomputed through the Phase 3 functions.

---

## 6. Risks and out of scope

| Risk | L × I | Mitigation |
|---|---|---|
| DB's 362 estimate names do not match Ánh Xạ DT's 343 keys (the DB lines came from a different sheet, the bảng cân đối) | M × H | Measured in Phase 1. Gate 3 blocks. The user decides on renaming (Q2). |
| A formula shape breaks D1 tagging (non-SUM H) | M × M | Fallback to `manual` with a warning; parity is kept. |
| Phần III bases misread | M × M | Phase 1 dump plus gate 12. |
| Old tabs empty of HĐ for MNTC-GD1 surprise the users | M × M | Q1 is asked before Phase 4 commits on production. User-guide note. |
| Someone rolls back the old run and deletes the estimates | L × H | New guard refuses it while a newer run supersedes the old one. |
| Rollback deletes rows edited after import | M × M | Same behaviour as today's adapters. Runbook: roll back only before the switch to entry screens. The guard refuses when manual rows reference imported parents. |
| Duplicate invoices from a second import | L × H | Re-import guard (gate 1). |
| Alias orphaned after a DT line is renamed in the Dự toán tab | M × L | "Orphan alias" list on the Ánh xạ screen, and the "DT chưa phân loại" check row. |
| `layout.tsx` gets 3 more tabs (16 total) | H × L | Already scrolls horizontally (`layout.tsx:81`). |

**Out of scope:**
- Porting the intermediate sheets.
- DT-HĐ R–Z and other diagnostic columns.
- Confidence text.
- Linking to or posting into vat-tu-ncc / cong-no-vt (decision 2).
- Changing the old Cân đối VT, Định mức, Công nợ NCC and Giao dịch tabs.
- A ledger cross-check column.
- Editing the Dự Toán price chain.
- Production import before deploy approval.

---

## 7. Unresolved questions for the user

1. After the 117 old invoice rows are replaced, the old tabs Cân đối VT, Định mức, Công nợ NCC and Giao dịch of MNTC-GD1 will show no hóa đơn, and the new "Đối Chiếu → DT-HĐ" report becomes the place for it. Is that acceptable, or must the old Cân đối VT tab also read the new invoice book? The second option is extra work that was not requested.
2. If Phase 1 finds that some of the 362 Dự toán lines in the ERP are named differently from the workbook's Ánh Xạ DT, which side should win? (a) Keep the ERP names and map them once during import. (b) Rename the ERP lines to the workbook names.
3. Until the entry screens ship (release 2), is the workbook still the master, with each update brought in by "hoàn tác + nhập lại"? And from what date does the đội enter directly in the ERP?
4. Going forward, should the đội tag each thực tế nhập row with its đầu mối, so that thực tế per NCC is computed? Or should they keep typing one "thực tế chốt" figure per đầu mối, as the workbook does for some lines today?

Status: DONE_WITH_CONCERNS
Summary: Reuse-first plan. Keep the estimates, settings, contracts, suppliers, import engine and status rule. Add seven flat tables plus one marker column for the reversible replacement of the 117 old rows. Prove the three reports against the golden totals through a gated, project-agnostic import before building the entry and mapping screens.
Concerns: The workbook could not be opened in this session (the Bash tool failed with ENAMETOOLONG on every command). The formula shapes for DT-HĐ L–Q, DT-TT Phần II C and Phần III bases, and the HĐ-TT columns not listed in the packet, are marked [UNVERIFIED], and Phase 1 must settle them first.
