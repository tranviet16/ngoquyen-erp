---
phase: 3
title: "Pure report engine with golden tests"
status: pending
priority: P1
effort: "2.5d"
dependencies: [1]
---

# Phase 3: Pure report engine with golden tests

## Goal
The three reports and their tie-outs are computed by pure functions from plain inputs, with no database and no formatting. A test proves each identity.

## Files to Create / Modify
- Create in `lib/du-an/dt-hd-tt/` (pure, no `"use server"`):
  - `actual-per-counterparty.ts`
  - `dt-hd-report.ts`
  - `dt-tt-report.ts` (Phần I, Phần II)
  - `phan-iii.ts`
  - `hd-tt-report.ts`
  - `report-inputs.ts`
  - `__tests__/*.test.ts`
- Create `lib/du-an/dt-hd-tt/report-service.ts` (`"use server"`). It is the only exported entry point:
  - `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } })`, as in `can-doi-service.ts:70-73`;
  - one `findMany` per table, project-scoped, filtering `deletedAt`;
  - when the settings row is missing, it uses default rates (vatPct 0.08 per the workbook's default VAT, 0.07, 0.01, 0.03, 0.06) and flags "chưa cài đặt".
- Modify `lib/du-an/__tests__/project-service-acl-contract.test.ts`: scan `lib/du-an/dt-hd-tt/*-service.ts` too.

## Computation rules
- **DT line L:** estimates grouped by `itemKeyOf`. Loại and Mã nhóm come from the `dt` alias.
- **Đầu mối B of a Mã nhóm:** `groupCode.counterpartyId`. A group without a B, or whose B is not of kind `ncc`, belongs to the "Chưa có đầu mối" block.
- **vat:** `settings.vatPct`.
- **actual(B):**
  - `receipts`: Σ receipts with `counterpartyId = B`.
  - `invoices`: Σ invoice `amountVnd` of B's suppliers × (1 + vat).
  - `payments`: Σ (bank + cash) of payments with `counterpartyId = B`, or with `section = B.paymentSection` when the payment has no counterparty.
  - `manual`: `actualManualVnd`.
- **DT-HĐ.** Blocks per `ncc` đầu mối, plus "Chưa có đầu mối". Inside a block: Mã nhóm → DT line → "↳" invoice lines whose hd alias has `dtKey = L`. Lines with a group but no dtKey sit under the group as "↳ chỉ gán tới nhóm".
  - KL HĐ quy đổi = Σ qty × factor. It is blank if any line has a null factor.
  - Thiếu / vượt, giá trị DT (raw DT, as the workbook uses), giá trị HĐ chưa VAT, cân đối ròng.
  - Tình trạng uses a local rule, not `bucketOf` (phase 1 spec §1), in this order:
    1. "Chưa có HĐ";
    2. "Chưa kết luận (thiếu hệ số)";
    3. "Theo dõi theo giá trị";
    4. otherwise, with 2 % tolerance: "Vượt", "Đủ", "Còn thiếu".
    
    Group rows show the counts.
  - O = N − S − T and P = M − N (pinned in phase 1).
  - L = actual(B). M = L / (1 + vat). N = Σ invoices of B's suppliers. O and P as pinned in phase 1.
  - Block tie-out: HĐ in B's groups + B's unmapped / ngoài DT + B's invoices in other blocks (including "Chưa có đầu mối") − other suppliers' invoices in B's groups = N. Shown ✓ when |Δ| ≤ 1 đ.
  - Phần B: invoices outside DT, by NCC.
  - Grand check: Σ N + invoices of suppliers without an đầu mối = Σ all invoice lines.
- **DT-TT Phần I.** Groups with `isMainMaterial`.
  - KL thực nhận = Σ qty × tt factor.
  - TT chưa VAT = Σ amount / (1 + vat).
  - Đơn giá TT = TT chưa VAT / KL thực nhận.
  - Do KL = (KL DT − KL TT) × giá DT. Do đơn giá = (giá DT − giá TT) × KL TT. The two parts add up to the total.
  - "↳ Thực nhận chỉ gán tới nhóm" rows.
- **DT-TT Phần II.**
  - A = `ncc`, B = `to_nhan_cong`, C = `khac`.
  - DT trực tiếp of each line's Mã nhóm, with and without VAT; H = actual; chênh.
  - H81 = Σ A, H95 = Σ B, H102 = A + B. C is outside H102.
  - Check: Σ tagged receipts + Σ untagged receipts = Σ receipts.
- **Phần III.**
  - T = Σ DT value by loại.
  - Chung, nhà tạm and không xác định KL = T × rate; GT = their sum.
  - Thu nhập chịu thuế = (T + GT) × rate. G = T + GT + TN. VAT = G × vatPct.
  - Thực tế per khoản mục as pinned in phase 1.
  - Check row: "DT lines without loại" must be 0.
- **HĐ-TT.** One row per `ProjectCounterpartySupplier` ∪ suppliers with invoices or payments, sorted by đầu mối sortGroup and sortOrder.
  - E = Σ (amount + vat).
  - G = Σ payments with that supplierId. H = override. I = H ?? G.
  - J = max(0, E − I). K = max(0, I − E). L = I / E.
  - T = S; else, for a multi-NCC đầu mối, actual(B) − Σ over the other NCC of (S ?? E); else actual(B); else E with the warning "chưa chốt thực tế (tạm = HĐ)".
  - U = T − E. V = T − I. W = max(0, J − V). X = recovered. Y = W − X. Z = todo.
  - Totals row.
  - Check rows: Σ E = Σ invoice lines gồm VAT; Σ T − Σ thực tế đầu mối NCC, explained per line (temporary = HĐ, or đầu mối not on HĐ-TT).
- **Legacy projection** (for phase 4 / 6): `deriveTransactions(invoiceLines, aliases, dtLines)` → one HĐ-only `ProjectTransaction` input per line.
  - Mapped line: the categoryId / itemCode of the largest-value estimate of its DT key.
  - Unmapped line: categoryId of the first category of its loại and a synthetic itemCode `HD-<supplierId>-<itemKey hash>`.
  - transactionType comes from loại (VL → lay_hang, NC → nhan_cong, MTC → may_moc).
  - partyName = supplier name, amountHd = amountVnd, qtyHd = qty × factor, invoiceNo, date.

## Tasks & Steps
1. Implement the rules. Every tie-out returns `{ expected, actual, ok }`.
2. Write synthetic tests:
   - 2 NCC folded into one đầu mối;
   - a cross-assigned invoice;
   - a group with no NCC ("Chưa có đầu mối");
   - a null hệ số;
   - a group-only receipt or invoice;
   - S split;
   - a multi-NCC line without S (T rule);
   - H override;
   - X with V ignoring X;
   - each actual basis, including `payments` by section;
   - Phần III by hand;
   - "chưa gán" lines still counted;
   - missing settings;
   - a legacy projection for a key spanning two hạng mục.
3. Keep files under 200 lines.

## Verification
- `npx vitest run lib/du-an/dt-hd-tt` is green; the ACL contract test is green with the new service.
- Phase 4's real-file smoke test feeds parsed rows into these functions and must hit every golden.
