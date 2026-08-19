# Phase 01 — Schema `qtyHd` + wiring form/adapter/service

## Context links

- Design (DECISION 4): `plans/reports/brainstorm-260819-can-doi-vat-tu-ux-analytics.md` §Mode 3.
- Schema hôm nay: `prisma/schema.prisma:433-461` (model `ProjectTransaction`).
- Form giao dịch: `app/(app)/du-an/[id]/giao-dich/giao-dich-client.tsx:112-128` (block SL / ĐG HĐ / ĐG TT).
- Service: `lib/du-an/transaction-service.ts` (create/update/adminPatch).
- Adapter: `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts:525-549` (INSERT project_transactions).
- Test: `lib/import/adapters/__tests__/bang-can-doi-vat-tu.test.ts` (16 test hiện có).

## Overview

Tách "số lượng hóa đơn" khỏi "số lượng thực tế" bằng cột nullable `qtyHd`. Backfill `qtyHd = qty` cho mọi dòng đã có `amountHd <> 0` để không phá vỡ mode-1 hôm nay. Cập nhật form/adapter/service để duy trì (create/update) và ghi khi import. Không đụng gì tới `vw_project_norm`.

## Key insights

- `qty` giữ ý nghĩa "khối lượng thực tế" — dùng ở `dinh-muc` (view `used_pct`) và các consumer khác.
- `qtyHd null` = "chưa tách" (dùng qty). Không backfill toàn bộ về `qty` — sẽ mất ý nghĩa cột. Chỉ backfill khi dòng đó thực sự có hóa đơn (`amountHd <> 0`).
- Không cần sửa `adminPatchTransaction` — cột `qtyHd` là input người dùng bình thường, không phải override tính toán.

## Requirements

- Thêm `qtyHd Decimal? @db.Decimal(18, 4)` vào `ProjectTransaction`.
- Migration SQL: `ALTER TABLE project_transactions ADD COLUMN "qtyHd" DECIMAL(18,4) NULL;` + `UPDATE project_transactions SET "qtyHd" = qty WHERE "amountHd" <> 0;` (single tx).
- `transactionSchema` (zod): thêm `qtyHd: z.number().positive().optional()`.
- Form field "SL HĐ" giữa "SL" và "ĐG HĐ", `placeholder="Mặc định = SL"`, optional.
- `createTransaction` / `updateTransaction`: nếu `qtyHd` truyền vào → lưu; ngược lại lưu `null`.
- Grid `giao-dich-client.tsx` columns: thêm `qtyHd` (kind: number, title "SL HĐ", width 90) ngay sau `qty`. `patchTx` map `qtyHd` như `qty`.
- Adapter `pushTxn` + INSERT: thêm `qtyHd = qty` cho mọi dòng invoice emit (invoice sub-lines, orphan mode, CPC header, tổng hợp fallback).
- Test adapter: thêm 1 test kiểm `every transaction row has qtyHd === qty` trên real CSV.
- Contract test git-ls-files (nếu có) vẫn pass.

## Architecture

Data flow không đổi. Chỉ mở rộng column.

```
Form/Grid ──qtyHd?──▶ transactionSchema ──▶ transaction-service ──▶ project_transactions.qtyHd
Adapter parse ────────▶ pushTxn(qty, qtyHd=qty) ─▶ INSERT with qtyHd
can-doi-service (phase 02) reads qtyHd via COALESCE(qtyHd, qty)
```

## Related code files

- Modify: `prisma/schema.prisma` (+1 line trong ProjectTransaction).
- Create: `prisma/migrations/20260819090000_add_transaction_qty_hd/migration.sql`.
- Modify: `lib/du-an/schemas.ts` (transactionSchema).
- Modify: `lib/du-an/transaction-service.ts` (create/update, không đụng adminPatch).
- Modify: `app/(app)/du-an/[id]/giao-dich/giao-dich-client.tsx` (form field + grid column + patchTx + TxGridRow interface).
- Modify: `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts` (pushTxn signature + INSERT SQL + subtotalMeta fallback).
- Modify: `lib/import/adapters/__tests__/bang-can-doi-vat-tu.test.ts` (+1 test).

## Implementation steps

1. Thêm field vào `ProjectTransaction` (Prisma). Chạy `pnpm exec prisma generate`.
2. Tạo migration file (tên: `20260819090000_add_transaction_qty_hd`) với ALTER + UPDATE.
3. Áp lên dev DB: `pnpm exec prisma migrate deploy` (hoặc `dev` với `--create-only=false`). Verify: `SELECT COUNT(*) FROM project_transactions WHERE "qtyHd" IS NULL AND "amountHd" <> 0;` → 0.
4. Cập nhật `transactionSchema` + `TransactionInput` type dùng lại tự động.
5. Cập nhật `createTransaction` / `updateTransaction` — thêm `qtyHd: data.qtyHd ?? null` trong data payload.
6. Form (`TxFormFields`): chèn FormField `qtyHd` (number input, step 0.0001) trong grid cols-3 kế bên `qty`.
7. Grid: mở rộng `TxGridRow` với `qtyHd: number | null`, `columns[]` thêm cột "SL HĐ", `patchTx` thêm branch giống `qty`.
8. Adapter: sửa `pushTxn` — nhận thêm `qtyHd?`; mọi call site invoice truyền `qtyHd: qty`. SQL INSERT thêm cột `"qtyHd"` với `${row.data.qtyHd ?? null}`.
9. Thêm test adapter kiểm mọi transaction row có `qtyHd == qty`.
10. `pnpm exec vitest run lib/import/adapters/__tests__/bang-can-doi-vat-tu.test.ts` → pass 17 test.

## Todo list

- [ ] schema.prisma diff
- [ ] migration file (ALTER + UPDATE backfill)
- [ ] apply migration on dev DB
- [ ] schemas.ts (zod)
- [ ] transaction-service.ts create/update
- [ ] giao-dich-client form field
- [ ] giao-dich-client grid column + patchTx
- [ ] adapter pushTxn + SQL INSERT
- [ ] adapter subtotal fallback (dòng "tổng hợp")
- [ ] adapter test mới
- [ ] chạy vitest adapter → pass
- [ ] `pnpm exec tsc --noEmit` sạch trên các file đụng vào

## Success criteria

- `prisma migrate status` sạch; cột `qtyHd` tồn tại nullable.
- Test cũ 16 pass, test mới +1 pass.
- Form tạo mới không nhập SL HĐ → DB lưu `qtyHd = NULL`, `qty` vẫn ghi bình thường.
- Import lại CSV: 117 giao dịch hiện tại → sau import, mỗi dòng có `qtyHd = qty` (đo bằng query).
- Không có regression trên `dinh-muc` / `dashboard` (dùng `qty` chứ không phải `qtyHd`).

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backfill UPDATE lock bảng project_transactions | Low (117 rows dev) | Low | Chạy trong migration tx, sản phẩm chưa lên prod với data lớn. |
| Test contract quét git-ls-files fail vì migration mới | Low | Low | Migration file phải add vào git trước khi chạy test. |
| Adapter breaking rollback semantics | Low | Med | Rollback đã dùng importRunId → không cần thay đổi; qtyHd đi cùng row bị xóa. |
| Grid inline edit qtyHd = 0 gây confusion "chưa nhập" vs "0" | Med | Low | zod optional + form default null; grid hiển thị "—" khi null (đọc format hiện có). |
| Người dùng nhập qtyHd âm | Low | Low | zod `.positive()` chặn. |

## Security considerations

- `updateTransaction` đã có ACL scope project — thêm field không đổi mặt quyền.
- Không expose `qtyHd` cho endpoint public — chỉ đi qua server action.
- `qtyHd null` không rò rỉ thông tin — cùng semantics với các nullable field khác.

## Next steps

Phase 02 dùng `COALESCE("qtyHd", qty)` trong per-stream aggregate query. Chờ phase này xong (DB migration đã áp) mới bắt đầu.
