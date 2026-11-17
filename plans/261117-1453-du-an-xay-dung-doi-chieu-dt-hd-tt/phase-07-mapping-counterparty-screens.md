---
phase: 7
title: "Ánh xạ, Đầu mối and Mã nhóm screens"
status: pending
priority: P2
effort: "1.5d"
dependencies: [5]
---

# Phase 7: Ánh xạ, Đầu mối and Mã nhóm screens

## Goal
Users can do the following without the workbook:
- map new names after entry;
- manage Mã nhóm, đầu mối and their NCC links;
- type the HĐ-TT figures.

## Files to Create / Modify
- Create in `lib/du-an/dt-hd-tt/`: `alias-service.ts`, `group-code-service.ts`, `counterparty-service.ts` (all `"use server"`, guarded), `__tests__/alias-rules.test.ts`.
- Create in `app/(app)/du-an/[id]/dt-hd-tt/`: `anh-xa/page.tsx`, `anh-xa/anh-xa-client.tsx`, `dau-moi/page.tsx`, `dau-moi/dau-moi-client.tsx`, `ma-nhom/page.tsx`, `ma-nhom/ma-nhom-client.tsx`.
- Create: `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts`.

## Tasks & Steps
1. **Ánh xạ** has three tabs: DT, HĐ and TT.
   - One row per distinct key, built from lines LEFT JOIN alias, with line count, Σ amount and NCC.
   - The "chưa gán" counter comes first.
   - Pickers for Mã nhóm and Dòng DT (filtered by group), plus hệ số, Xác nhận / Ngoài DT, and loại on DT keys.
   - A list of orphan aliases.
   - Writes use `findFirst({ projectId, source, itemKey, deletedAt: null })` followed by an audited `create`/`update`. P2002 maps to a Vietnamese message. A bulk confirm writes an explicit audit row.
   - Changing an hd alias regenerates the derived transactions of the affected invoice lines through `invoice-transaction-sync`.
2. **Đầu mối:**
   - name, kind, sort group / order, thực tế basis, manual figure, payment section;
   - linked NCC with H, S, X and Z;
   - one đầu mối per NCC, with the unique-index error shown in Vietnamese.
3. **Mã nhóm:** code, name, NCC phụ trách (đầu mối), main-material flag.
4. **Rules for every write:**
   - Access: `create` to add, `edit` to change or delete; H / X / S / Z require `edit`.
   - Foreign ids are checked against the project.
   - `lockProjectDtHdTt` is taken.
   - The report pages and the old tabs are revalidated.

## Verification
- Unit tests for the alias rules (status transitions; hệ số 0 → null).
- Integration test, run through the real extended Prisma client, output attached to `reports/`:
  - confirming an alias moves an invoice line from "chưa gán" into its DT line, and moves its derived transaction to the estimate's category / itemCode;
  - changing a basis changes HĐ-TT T;
  - a cross-project groupCodeId is refused.
- `npm run build`.
