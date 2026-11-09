# Báo cáo thực hiện Phase 1 + Phase 2 — Công nợ vật tư theo cặp NCC × công trình

Ngày: 2026-11-06. Trạng thái: **xong phần code + unit**; **integration chưa chạy được** (Docker tắt, không có DB `_test` nào nghe ở 5433). Chưa commit/push.

## 1. Kết quả kiểm tra (lệnh chạy thật)

| Lệnh | Kết quả |
|---|---|
| `npx prisma validate` / `npx prisma generate` | hợp lệ / sinh client v7.8.0 thành công |
| `npx prisma migrate diff --from-schema <schema HEAD> --to-schema prisma/schema.prisma --script` | dùng để lấy đúng tên index/FK Prisma sinh; khớp migration viết tay |
| `npx tsc --noEmit` | **0 lỗi** (kể cả test, scripts, và `lib/import/adapters/vat-tu-chuyen-doi/**` của agent khác — không có lỗi nào ở đó) |
| `npx vitest run --project unit` | **92 file / 960 test pass** (gồm `test/unit/module-release-entrypoints.test.ts`) |
| `npx eslint <51 tệp .ts/.tsx đã đổi/tạo, trừ lib/import>` | exit 0, không cảnh báo |
| Integration | **BỎ QUA**: `docker ps` báo không kết nối được Docker Desktop; `localhost:5433` ECONNREFUSED. Không chạy `migrate deploy` ở bất kỳ DB nào. Hai file integration mới và 5 file cập nhật đã typecheck nhưng **chưa chạy** |

Baseline trước khi sửa: `tsc` 0 lỗi.

## 2. Tệp thay đổi

**Phase 1**
- `prisma/schema.prisma`: `SupplierReconciliation.projectId Int` + relation `Project` (Restrict), index `(supplierId, projectId, periodFrom)`; `Project.supplierReconciliations`; `SupplierDeliveryDaily @@index([projectId, date])`; `ImportRun.sourceFile Bytes?`, `reviewJson Json?`, `reviewVersion Int @default(0)`, `rolledBackAt DateTime?`, comment trạng thái thêm `rolled_back`; comment CHECK ở sổ/số dư/phiếu. (Đã hoàn tác phần `prisma format` tự đổi khoảng trắng ở model khác.)
- Tạo `prisma/migrations/20261106090000_vat_tu_pair_scope_and_import_review/migration.sql`: pre-check `RAISE` khi còn kỳ đối chiếu; cột `projectId NOT NULL` + FK; drop `supplier_recon_period_unique` → tạo `supplier_recon_pair_period_unique`; thay index `(supplierId, periodFrom)`; index phiếu `(projectId, date)`; 3 CHECK kiểm ngay (`ledger_material_project_required`, `ledger_opening_material_project_required`, `supplier_delivery_project_required`); 4 cột `import_runs`. Không CHECK trên `payment_round_items`, không index sổ cái mới.

**Phase 2 — lib**
- Tạo `lib/vat-tu-ncc/pair-scope.ts` (không "use server"): `MaterialScopeError` (mã), `requireProjectId`, `resolveMaterialEntityId`, hằng/kiểu hợp đồng mốc, `parseCutoverDate`, `getMaterialCutoverDate`, `assertAfterMaterialCutover`.
- Tạo `lib/vat-tu-ncc/reconciliation-compute.ts` (không "use server"): `computeReconciliation`, `headerNames`, `freezeReconciliationSnapshot`, kiểu `Recon*` (Payment/Tax row có `projectId`).
- Sửa `lib/vat-tu-ncc/{period-lock, supplier-balance, reconciliation-derive-service, reconciliation-service, period-close-service, delivery-service, period-recon-check-service, schemas}.ts`.
- Sửa `lib/ledger/ledger-service.ts`, `lib/cong-no-vt/{material-ledger-service, schemas}.ts`, `lib/payment/{payment-ledger-sync, payment-service}.ts`.

**Phase 2 — UI tối thiểu để chạy đúng**
- Tạo `components/vat-tu-ncc/pair-project-required.tsx` (`parseProjectIdParam` + bộ chọn công trình tối thiểu khi thiếu `?projectId=`).
- Tạo `components/ledger-grid/new-row-project-select.tsx`; sửa `components/ledger-grid/{transaction-grid,opening-grid}.tsx` (prop `requireProject`), dùng ở `app/(app)/cong-no-vt/{nhap-lieu,so-du-ban-dau}/page.tsx`.
- Sửa `app/(app)/vat-tu-ncc/[supplierId]/{chot-ky,doi-chieu,kiem-tra-khop,thanh-toan}/page.tsx` + client tương ứng (đọc `?projectId=`, thiếu thì hiện bộ chọn); `{ngay,thang}/page.tsx` (lọc theo `projectId` khi có); `doi-chieu/[reconciliationId]/page.tsx` (link quay lại giữ `?projectId=`).
- Sửa `components/vat-tu-ncc/{delivery-form,delivery-grid,reconciliation-form}.tsx` (công trình bắt buộc, form đối chiếu nhận `projectId`).
- Sửa kiểu tối thiểu `components/ledger/{opening-balance-client,transaction-form-dialog,transaction-grid}.tsx` (xem lệch #9).

**Test**
- Tạo `lib/vat-tu-ncc/__tests__/period-lock-pairs.test.ts` (thay `period-lock-supplier-ids.test.ts` — đã xoá, **đã stage việc xoá** vì test entrypoint đọc `git ls-files`), `lib/vat-tu-ncc/__tests__/pair-scope.test.ts`.
- Sửa `lib/vat-tu-ncc/__tests__/period.test.ts`, `lib/cong-no-vt/__tests__/schemas.test.ts`, `lib/payment/__tests__/payment-service.test.ts` (+9 ca: thiếu công trình, suy Chủ thể, missing_entity, duyệt/từ chối/duyệt cả đợt/đóng đợt với dòng cũ, guard mốc khi đóng đợt).
- Tạo `test/integration/vat-tu-schema-constraints.integration.test.ts`, `test/integration/vat-tu-ncc-khoa-theo-cap.integration.test.ts` (ca a–h).
- Sửa fixture `test/integration/{vat-tu-ncc-chot-ky-linh-hoat, vat-tu-ncc-pilot, vat-tu-ncc-thanh-toan, ledger-business-date, cong-no-thue-hd}.integration.test.ts`. `payment-service`, `cong-no-luy-ke`, `cong-no-window` không cần sửa (đã có công trình hoặc dùng loại `khac`).

## 3. Lệch so với phase spec (kèm lý do)

1. **Migration viết tay**, phần Prisma-managed lấy từ `migrate diff --from-schema` (offline). `--from-migrations` cần shadow DB mà Docker tắt.
2. **Guard mốc nằm ở `pair-scope.ts`** (period-lock re-export `getMaterialCutoverDate`) để giữ period-lock gọn; `isCutoverMarker` ở period-lock như spec.
3. **Chủ thể**: schema `cong-no-vt` vẫn bắt buộc `entityId` (vì `lib/ledger/ledger-types.ts` ngoài phạm vi sở hữu), nhưng server **luôn thay** bằng `Project.entityId` (sổ, số dư, phiếu→event, dòng đợt `vat_tu`, đồng bộ đợt). `upsertFromDelivery` bỏ trường `entityId` khỏi đầu vào và chỉ dành cho sổ vật tư.
4. **`dieu_chinh` giờ đi qua guard mốc** (trước đây không kiểm gì) — đúng quy tắc "dieu_chinh phải mang ngày > mốc". Khoá kỳ đã ký vẫn không áp cho dieu_chinh.
5. **Số dư ban đầu vật tư**: ngoài khoá theo cặp, `asOfDate` (cả dòng mới lẫn dòng bị ghi đè/xoá) phải sau mốc. Gom về `LedgerService.assertOpeningEditable(partyId, projectId, asOfDate, client)` → `assertPairOpeningEditable` + guard mốc; patch/bulk của cong-no-vt dùng chung.
6. **Thanh toán**: không có CHECK nên không có 23514 ở duyệt/từ chối/làm mới. Quy tắc service: tạo/sửa dòng `vat_tu` bắt buộc công trình; **duyệt (số > 0), duyệt cả đợt, làm mới số dư, đóng đợt** từ chối dòng `vat_tu` cũ thiếu công trình với lỗi liệt kê `#id`; **từ chối dòng vẫn được** (lối ra cho dòng cũ, soDuyet=0 không ghi sổ).
7. `checkPeriodConsistency` trả thêm `historicalEvents` (dòng Nhập Liệu lay_hang trong kỳ chuyển đổi), không chỉ `historicalDeliveries` — tránh báo "event mồ côi" giả cho dữ liệu Excel.
8. Sửa luôn lỗi cũ ở `listDeliveries`: `dateFrom` + `dateTo` cùng lúc ghi đè nhau; giờ dùng cận `< dateTo + 1 ngày`.
9. `components/ledger/{opening-balance-client,transaction-form-dialog,transaction-grid}.tsx` **không còn được dùng** (grep từ hai trang cong-no-vt chỉ thấy shim không ai import) nhưng vẫn bị `tsc` biên dịch → chỉ sửa kiểu tối thiểu (0 = chưa chọn, server từ chối "Chọn công trình"). Đề xuất phase 8 xoá cùng `components/cong-no-vt/{transaction-form-dialog,transaction-grid}.tsx` và `so-du-ban-dau-client.tsx`.
10. Test pre-check migration: chạy lại **đúng khối DO đầu tiên** trích từ `migration.sql` trên DB test (không dựng DB tạm) — kiểm cùng logic, không cần quyền CREATE DATABASE.
11. Không đọc được `node_modules/next/dist/docs` (hook chặn `node_modules`); dùng đúng mẫu `searchParams: Promise<...>` đang có trong repo.
12. Ngoài phạm vi trang NCC, list kỳ ở tab Đối chiếu ẩn nút gỡ ký/xoá cho marker chuyển đổi (hiện "Kỳ chuyển đổi (khóa)") để không có nút chắc chắn lỗi; nhãn/404 đầy đủ để phase 3.

## 4. Những gì phase 3 / 5 / 7 cần biết

### API theo cặp (không có giá trị mặc định cho supplierId/projectId)
- `period-lock.ts`:
  - `findSignedPeriodCovering(supplierId, projectId, date, client = prisma)`
  - `assertPeriodOpen(supplierId, projectId, date, client = prisma, opts?: MaterialWriteGuardOptions)` — guard mốc + kỳ ký của cặp
  - `assertMaterialTypeWritable(transactionType, supplierId, projectId, date, client, opts?)` — loại khoá kỳ → `assertPeriodOpen`; dieu_chinh → chỉ guard mốc
  - `assertPairOpeningEditable(supplierId, projectId, client)`
  - `loadPeriodBoundsContext(supplierId, projectId, client = prisma)`, `assertPeriodBounds(supplierId, projectId, range, client = prisma, selfId?)`, `suggestRangeForPair(supplierId, projectId, ctx, client = prisma)`
  - `isCutoverMarker({ importRunId })`, `CUTOVER_MARKER_LOCKED_MESSAGE`; `lockSuppliers` không đổi.
- `supplier-balance.ts`: `pairBalanceAsOf(supplierId, projectId, asOf, db = prisma)`; `supplierBalanceAsOf(supplierId, asOf, db)` giữ lại (tổng NCC).
- Server actions: `previewPeriodClose(s, p, range?)`, `commitPeriodClose(s, p, range, prices)`, `listReconciliationsDerived(s, p)` (dòng có `projectId`, `cutoverMarker`), `getReconciliationView(id)` (thêm `projectId`, `cutoverMarker`), `signReconciliation(id)`, `unsignReconciliation(id)`, `listReconciliations(s, p)`, `checkReconciliationRange(s, p, range?)`, `createReconciliation({supplierId, projectId, periodFrom, periodTo, note?})`, `updateReconciliation(id, input)` (không đổi được cặp), `softDeleteReconciliation(id, supplierId)`, `listDeliveries(s, {projectId?, dateFrom?, dateTo?})`, `listDeliveriesMonthly(s, {projectId?})`, `checkPeriodConsistency(s, p, dateFrom, dateTo)`.
- `LedgerService("material", { cutoverImportRunId? })`; `upsertFromDelivery({deliveryId, date, partyId, projectId, itemId, qty, unitPrice, content?}, client)`.

### Guard mốc chuyển đổi (phase 5, 7)
- `getMaterialCutoverDate(db: Pick<prisma,"importRun">): Promise<Date | null>` — run mới nhất `adapter = "vat-tu-chuyen-doi"` (`MATERIAL_CUTOVER_ADAPTER`) và `status = "committed"` (sắp `committedAt desc, id desc`; chỉ select `id, reviewJson`, không kéo `sourceFile`). Run `rolled_back` không tính. Không có run → `null`.
- **Hình dạng `reviewJson` được đọc** (`MaterialCutoverReviewJson`): `{ expected: { cutoverDate: "YYYY-MM-DD" } }` — ngày nghiệp vụ cuối cùng do Excel quản lý, bao gồm (ví dụ `"2026-10-26"`). Các khoá khác của `expected`/`reviewJson` tuỳ adapter.
- Run `committed` mà thiếu/sai `expected.cutoverDate` → **fail closed** (`MaterialScopeError` mã `cutover_invalid`, chặn mọi ghi vật tư). Vì vậy phase 7 phải ghi `expected.cutoverDate` **trong cùng transaction và không muộn hơn** bước đổi `status = 'committed'`.
- Ghi của chính run import: truyền `opts.cutoverImportRunId = <id run>` (cho `assertPeriodOpen`/`assertMaterialTypeWritable`/`assertAfterMaterialCutover`) hoặc dùng `new LedgerService("material", { cutoverImportRunId })`.
- Lỗi chặn: `MaterialScopeError` mã `cutover_locked`, áp mọi loại kể cả dieu_chinh; áp cho phiếu ngày, sổ tay, số dư ban đầu, đồng bộ đợt.

### Marker chuyển đổi
- `freezeReconciliationSnapshot(db: ReconFreezeClient, reconId: number): Promise<ReconSnapshot>` trong `lib/vat-tu-ncc/reconciliation-compute.ts` — tính bảng của đúng cặp + biên của marker, ghi 4 cột tổng + `signedSnapshotJson`, đặt `signedBySupplier = true`, `signedDate = now`. Không khoá, không kiểm "mọi phiếu có event": caller phải `lockSuppliers(tx, [supplierId])` trước và gọi trong transaction commit.
- Marker có `importRunId` → `unsignReconciliation`, `updateReconciliation`, `softDeleteReconciliation` đều từ chối.

### Ràng buộc DB phase 7 phải tuân
- INSERT thô vào `ledger_transactions`/`ledger_opening_balances` (material) và `supplier_delivery_daily` **phải có `projectId`**; `entityId` lấy từ `Project.entityId` (dùng `resolveMaterialEntityId`, công trình thiếu Chủ thể → `missing_entity`).
- Kỳ đối chiếu bắt buộc `projectId`; unique một phần theo `(supplierId, projectId, periodFrom, periodTo)`.

## 5. Rủi ro / việc còn mở
- **Integration chưa chạy.** Cần chạy khi có Docker: `npx prisma migrate deploy` trên DB `_test` rồi `npx vitest run --project integration test/integration/vat-tu-schema-constraints.integration.test.ts test/integration/vat-tu-ncc-khoa-theo-cap.integration.test.ts test/integration/vat-tu-ncc-chot-ky-linh-hoat.integration.test.ts test/integration/vat-tu-ncc-pilot.integration.test.ts test/integration/vat-tu-ncc-thanh-toan.integration.test.ts test/integration/ledger-business-date.integration.test.ts test/integration/cong-no-thue-hd.integration.test.ts test/integration/payment-service.integration.test.ts`.
- `test/integration/import-engine.integration.test.ts` (adapter cũ `cong-no-vat-tu`, thuộc lib/import) có thể vỡ vì CHECK nếu dòng mẫu không có công trình; ba adapter cũ ghi SQL thô không công trình và không qua guard — phase 5/7 gỡ khỏi registry như kế hoạch.
- Phase 3: tab ở layout chưa giữ `?projectId=`; trang chi tiết đối chiếu chưa 404 khi `projectId` lệch; `round-detail-client.tsx` chưa buộc chọn công trình cho `vat_tu` (server đã từ chối với lỗi rõ); form Thanh toán vẫn có ô Chủ thể (server thay theo công trình; trang chỉ liệt kê Chủ thể của công trình khi đã gán).
- Bộ chọn công trình tối thiểu (`pair-project-required.tsx`) chỉ liệt kê công trình đã có phiếu/sổ/kỳ của NCC; phase 3 thay bằng `pair-project-picker`.

## Câu hỏi chưa giải quyết
- Run `committed` thiếu mốc đang **chặn mọi ghi vật tư** (fail closed). Nếu muốn bỏ qua guard thay vì chặn, cần quyết định của người dùng.
