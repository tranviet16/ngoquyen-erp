---
title: "Import-run rollback (revert dữ liệu đã commit theo run)"
status: completed
priority: P2
created: 2026-05-05
---

# Import-run rollback

## Goal
Cho phép admin **hoàn tác** một lần import đã `committed`: xóa toàn bộ rows đã insert kèm chính `ImportRun`, không động đến dữ liệu khác. Khắc phục use case vừa rồi (import sai → phải `psql` xóa thủ công).

## Non-goals
- KHÔNG full DB restore.
- KHÔNG rollback các bảng master (Supplier/Entity/Project) auto-created — chỉ rollback ledger rows. Lý do: master records có thể đang được dùng bởi run khác / tx tay; xóa cascade quá rủi ro.

## Scope
| File excel adapter | Bảng ledger ghi vào |
|---|---|
| `cong-no-vat-tu` | `ledger_transactions`, `ledger_opening_balances` (ledgerType=`material`) |
| `gach-nam-huong`, `quang-minh` | `ledger_transactions` (ledgerType=`material`) |
| `sl-dt` | `sl_dt_targets`, `sl_dt_actuals`, … (TBD per adapter) |

V1 chỉ làm cho 2 bảng ledger (`ledger_transactions` + `ledger_opening_balances`). Adapter khác sẽ extend sau khi pattern ổn định.

## Design

### 1. Schema thay đổi
Thêm cột `importRunId` (nullable, FK → `import_runs.id`, `ON DELETE SET NULL`) vào:
- `ledger_transactions`
- `ledger_opening_balances`

```prisma
model LedgerTransaction {
  …
  importRunId  Int?
  importRun    ImportRun? @relation(fields: [importRunId], references: [id], onDelete: SetNull)
  @@index([importRunId])
}

model LedgerOpeningBalance {
  …
  importRunId  Int?
  importRun    ImportRun? @relation(fields: [importRunId], references: [id], onDelete: SetNull)
  @@index([importRunId])
}

model ImportRun {
  …
  ledgerTransactions     LedgerTransaction[]
  ledgerOpeningBalances  LedgerOpeningBalance[]
}
```

Migration: `prisma migrate dev --name add_import_run_id_to_ledger`.

### 2. Adapter contract đổi
`apply(data, mapping, tx, importRunId)` — engine truyền `importRunId` xuống. Mọi `INSERT` raw SQL gắn thêm `"importRunId" = ${importRunId}`.

Sửa: `cong-no-vat-tu.adapter.ts` (cả 2 bảng), `gach-nam-huong.adapter.ts`, `quang-minh.adapter.ts`. SL-DT hoãn (không đụng V1).

### 3. Engine
`import-engine.ts` — chỗ gọi `adapter.apply(parsedData, mapping, tx as any)` thêm tham số `run.id`.

### 4. Server action `rollbackRun(id)`
File: `app/(app)/admin/import/import-actions.ts`

```ts
export async function rollbackRun(id: number) {
  const session = await requireAdmin();
  const run = await prisma.importRun.findUnique({ where: { id } });
  if (!run) throw new Error("Run không tồn tại");
  if (run.status !== "committed") throw new Error("Chỉ rollback được run đã commit");

  await prisma.$transaction(async (tx) => {
    await tx.ledgerTransaction.deleteMany({ where: { importRunId: id } });
    await tx.ledgerOpeningBalance.deleteMany({ where: { importRunId: id } });
    await tx.importRun.delete({ where: { id } });
  });
  await writeAuditLog({ action: "import.rollback", entity: "ImportRun", entityId: id, userId: session.user.id });
  revalidatePath("/admin/import");
}
```

### 5. UI
`delete-run-button.tsx` đổi tên thành `run-actions.tsx`, render 2 nút:
- `committed` → "Hoàn tác" (gọi `rollbackRun`, confirm 2 lần với cảnh báo "Sẽ xóa N rows")
- `pending`/`preview`/`failed` → "Xóa" (giữ logic cũ `deleteRun`)

Cảnh báo confirm hiển thị số rows: `await prisma.ledgerTransaction.count({ where: { importRunId: id } })` — fetch trên server, render vào button title hoặc lấy lazy on click.

### 6. Existing data (runs cũ chưa có importRunId)
Runs trước migration không có `importRunId` trên rows → button rollback **disabled** với title "Run này thuộc trước rollback feature, không thể hoàn tác."

Detect: nếu `run.createdAt < migrationDate` HOẶC count rows-with-id = 0. Đơn giản hơn: nếu `count(importRunId=id) = 0` → disable.

## Implementation steps

1. **Schema + migration** (`prisma/schema.prisma` + `prisma migrate dev`)
2. **Engine truyền `runId`** (`lib/import/import-engine.ts`: thêm param vào `adapter.apply`)
3. **Adapter signature** (`lib/import/adapters/adapter-types.ts`: thêm `importRunId: number` vào `apply`)
4. **3 adapters** insert thêm `importRunId`:
   - `cong-no-vat-tu.adapter.ts` (2 bảng)
   - `gach-nam-huong.adapter.ts`
   - `quang-minh.adapter.ts`
5. **Server action `rollbackRun`** (`import-actions.ts`)
6. **UI button** (`delete-run-button.tsx` → render Hoàn tác / Xóa theo status)
7. **Test thủ công**: import file → rollback → verify 0 rows còn lại với `importRunId = X`

## Success criteria
- [ ] Re-import `Quản Lý Công Nợ Vật Tư.xlsx` → click Hoàn tác → all 335 rows xóa, ImportRun xóa
- [ ] Master data (Supplier/Entity/Project auto-created) **vẫn còn** (không bị xóa cascade)
- [ ] Re-import lại lần 2 → idempotent vẫn hoạt động (no duplicate)
- [ ] Run cũ (không có importRunId) → button disabled

## Risks
- **Rollback xóa rows mà user đã edit thủ công sau import**: chấp nhận, V1 không track edit-after-import. Audit log ghi lại để truy vết.
- **FK ON DELETE SET NULL** trên các bảng khác link đến `LedgerTransaction` (nếu có): chưa có, ledger_transactions là leaf node trong V1.
- **Concurrency**: 2 admin cùng rollback 1 run → `prisma.importRun.delete` throw P2025 cho người thứ 2, ok.

## Files
- Modify: `prisma/schema.prisma`, `lib/import/import-engine.ts`, `lib/import/adapters/adapter-types.ts`, `lib/import/adapters/cong-no-vat-tu.adapter.ts`, `lib/import/adapters/gach-nam-huong.adapter.ts`, `lib/import/adapters/quang-minh.adapter.ts`, `app/(app)/admin/import/import-actions.ts`, `app/(app)/admin/import/delete-run-button.tsx`, `app/(app)/admin/import/page.tsx`
- Create: migration file (auto-generated)

## Effort
~2-3h. Single phase, không cần break thành phase nhỏ.
