# Báo cáo Phase 5 — Engine import: gói thư mục, review, guard

Ngày: 2026-11-06. Trạng thái: **xong code + unit**. **Integration / e2e / smoke chưa chạy** (Docker tắt). Chưa commit.

## 1. Kiểm tra (lệnh chạy thật)

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | exit 0, **0 lỗi toàn dự án** (baseline trước khi sửa cũng 0) |
| `npx vitest run --project unit lib/import test/unit/module-release-entrypoints.test.ts` | **19 file / 193 test pass** |
| `npx vitest run --project unit` (toàn bộ) | **106 file / 1099 test pass** |
| `npx eslint` trên mọi tệp phase này tạo/sửa | exit 0 |
| Integration, Playwright, `scripts/smoke-import-apply.ts` | **KHÔNG CHẠY**: `docker ps` báo không kết nối được Docker Desktop; `localhost:5433` ECONNREFUSED. Không chạy migrate/deploy ở DB nào. `test/integration/import-engine.integration.test.ts` đã typecheck + lint nhưng chưa chạy. |

## 2. Tệp thay đổi

**lib/import (mới)**
- `bundle-path.ts`: quy tắc đường dẫn dùng chung server + trình duyệt (NFC, tương đối, không `..`/`\`/đoạn rỗng/ký tự điều khiển, ≤ 260), bỏ qua ẩn / `~$` / đuôi khác, giới hạn 200 file / 20 MB, `BundleError`.
- `file-bundle.ts`: `encodeBundle`, `decodeBundle` (kiểm lại đường dẫn, thứ tự, sha256 từng file), `computeBundleHash`, `bundleDisplayName`.
- `import-review.ts` (thuần): hình dạng `reviewJson`, `validateMapping` (zod), `autoFillMapping`, `mergeAcks`, `missingAcks`, `normalizeAdapterReview`, `parseStoredReview`, `readStoredMapping`.
- `import-preview.ts`: `previewImport`, `previewBundleImport`, `refreshPreview`.
- `import-source.ts`: `LONG_TX_OPTIONS`, `requireAdapter`, `parseRunSource` (kiểm hash khi parse lại nguồn đã lưu).
- `import-run-store.ts`: `lockRunRow` (FOR UPDATE), `readSourceFile`, `updateRunIfStatus`, `markRunFailed`, `findRunIdsWithData`, `IMPORT_TAGGED_TABLES`.
- `import-rollback.ts`: `getRollbackInfo`, `rollbackImportRun` (→ `rolled_back`).
- `rollback-guards.ts`: `collectRunPairs`, `assertRollbackAllowed`.
- `import-errors.ts`: `ImportError`, `ImportPreconditionError`, `RollbackBlockedError`.
- Test: `__tests__/file-bundle.test.ts`, `__tests__/import-review.test.ts`.

**lib/import (sửa)**: `import-engine.ts` (commit/list/get/delete + re-export preview/rollback), `adapters/adapter-types.ts`, `adapters/adapter-registry.ts`, `adapters/excel-utils.ts` (comment), `README.md`, `__tests__/adapter-registry.test.ts`, `adapters/__tests__/adapters.test.ts`.

**Xóa (đã `git rm`, chưa commit)**: `adapters/{cong-no-vat-tu,gach-nam-huong,quang-minh}.adapter.ts`. Giữ `cong-no-vat-tu.parse.ts`.

**app/(app)/admin/import**: sửa `import-actions.ts`, `import-upload-form.tsx`, `delete-run-button.tsx`, `page.tsx`, `[runId]/page.tsx`, `[runId]/commit-panel.tsx`; tạo `run-status.ts`, `[runId]/adapter-review-types.ts`, `[runId]/adapter-review-components.tsx`, `[runId]/generic-review-section.tsx`, `[runId]/review-status-panel.tsx`.

**Khác**: `scripts/smoke-import-apply.ts`, `e2e/import-export.spec.ts`, `test/integration/import-engine.integration.test.ts` (viết lại).

Không chạm `lib/import/adapters/vat-tu-chuyen-doi/`, prisma, lib/vat-tu-ncc, docs, plan.

## 3. Hợp đồng adapter cho phase 7 (`lib/import/adapters/adapter-types.ts`)

```ts
export type MappingValue = number | string | null;
export type ImportMapping = Record<string, MappingValue>;
export interface ResolvedMapping { [sourceName: string]: number | null } // adapter một file

export interface ImportSummary {
  rowsTotal: number; rowsImported: number; rowsSkipped: number;
  errors: { rowIndex: number; message: string }[];
  /** Engine ghi vào reviewJson.expected trong CÙNG câu UPDATE đặt status='committed'. */
  expected?: Record<string, unknown>;
}

export type ImportTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface ParseContext { fileName: string; bundle?: DecodedBundle }

export interface ReviewContext { runId: number; phase: "preview" | "commit" }

export interface AdapterReview { payload: unknown; blocking: string[]; requiredAcks: string[] }

export interface ImportAdapter<M extends ImportMapping = ResolvedMapping, D extends ParsedData = ParsedData> {
  readonly name: string;
  readonly label: string;
  readonly supportsRollback?: boolean;
  readonly acceptsBundle?: boolean;
  readonly mappingSchema?: z.ZodType<M>;            // mặc định: z.record(z.string(), z.number().int().positive().nullable())
  parse(buffer: Buffer, ctx?: ParseContext): Promise<D>;
  validate(data: D): ValidationResult;
  lockScope?(data: D, mapping: M): number[];       // mã NCC
  review?(data: D, mapping: M, db: ImportTx, ctx: ReviewContext): Promise<AdapterReview>;
  apply(data: D, mapping: M, tx: any, importRunId: number): Promise<ImportSummary>;
}
export type RegisteredImportAdapter = ImportAdapter<ImportMapping, ParsedData>;
```

Gói (`lib/import/file-bundle.ts`): `DecodedBundle = { bundleHash: string; files: BundleFile[] }`, `BundleFile = { path; size; sha256; buffer: Buffer }` — gán thẳng được cho `BundleFile` của phase 6 (`{path, buffer}`).

Quy ước phase 7 cần theo:
- Adapter `acceptsBundle`: engine luôn truyền `ctx.bundle` (đã kiểm). `run.fileHash` = `bundleHash`.
- `review` pha `"preview"`: engine đã mở transaction riêng, đã `lockSuppliers(lockScope)`, và **luôn rollback** → chạy thử `apply-cutover` + `verification-queries` ngay trên `db`, KHÔNG tự mở `$transaction`. Dòng chạy thử gắn `importRunId = ctx.runId` (run đã tồn tại). Ném lỗi → engine biến thành một lỗi chặn ("Không chạy được bước duyệt…"), run vẫn lưu để sửa ánh xạ.
- `review` pha `"commit"`: chạy trong transaction commit, đã khóa, ngay trước `apply` — **không ghi gì**; chỉ guard độc quyền / blocking / requiredAcks. Engine từ chối nếu `blocking` khác rỗng hoặc có mã trong `requiredAcks` chưa được xác nhận.
- Ghi bằng `$executeRaw`. `create`/`update` qua audit extension ghi audit bằng kết nối riêng, không rollback theo transaction.
- `apply` ném lỗi ngay; không tự ghi `import_runs`; trả `expected: { cutoverDate: "2026-10-26", … }`.
- Mapping truyền cho `lockScope/review/apply` là mapping đã lưu của run, **kể cả** `ack:<mã>` = 1. Mã ack nên chứa giá trị được xác nhận (vd. `v1:<file>:<chênh>`), để số đổi thì phải xác nhận lại. Khóa `date:<file>:<sheet>!<ô>` = `"yyyy-mm-dd"` dùng được vì `MappingValue` có chuỗi; phase 7 khai báo `mappingSchema` cho mọi khóa (`entity:`, `supplier:`, `project:`, `pair:`, `cdc:`, `date:`, `ack:`…).
- Tự điền của engine: khóa `<entityType>:<sourceName>` từ `ParsedData.conflicts`, chỉ khi đúng một ứng viên trùng khít tên chuẩn hóa (NFC, gộp khoảng trắng, chữ thường). Phase 7 có thể dựa vào đó hoặc tự giải trong `review`.
- Đăng ký: thêm một dòng vào `ADAPTERS` trong `adapter-registry.ts`.

## 4. Hợp đồng component duyệt

`app/(app)/admin/import/[runId]/adapter-review-types.ts`:

```ts
export interface AdapterReviewProps {
  runId: number;
  adapterName: string;
  status: string;            // ImportRun.status
  editable: boolean;         // status === "preview"
  reviewVersion: number;
  mapping: ImportMapping;    // mapping đã lưu, kể cả ack:<mã>
  review: StoredReview;      // { payload, blocking, requiredAcks, acks: Record<mã,{ackedBy, ackedAt}>, bundle?, expected? }
  missingAcks: string[];
}
```

- Đăng ký: `adapterReviewComponents` trong `app/(app)/admin/import/[runId]/adapter-review-components.tsx` (đuôi **.tsx**), ví dụ `"vat-tu-chuyen-doi": CutoverReview`. Không đăng ký thì dùng `GenericReviewSection` (liệt kê `requiredAcks` kèm người / thời điểm xác nhận).
- Trang đã hiển thị: trạng thái, `reviewVersion`, danh sách lỗi chặn, xác nhận còn thiếu, file trong gói / file bị bỏ qua, nút Ghi (gửi `reviewVersion`, khóa khi còn lỗi chặn hoặc thiếu xác nhận). Component chỉ cần hiển thị `payload` và cho sửa ánh xạ.
- Sửa ánh xạ: `refreshPreviewAction(runId: number, mapping: unknown)` (`import-actions.ts`) → `{ ok: true, reviewVersion, blockingCount, missingAckCount } | { ok: false, message }`; sau đó `router.refresh()`.

## 5. Lệch so với spec (kèm lý do)

1. **Lỗi điều kiện không đánh `failed`.** Các lỗi sau ném `ImportPreconditionError` và giữ nguyên trạng thái run: không còn preview, sai `reviewVersion`, còn lỗi chặn, thiếu xác nhận, trùng hash, mapping đã lưu không hợp lệ, mất nguồn. Nếu đánh `failed`, run sẽ không "tải lại trang rồi ghi" được nữa (refresh chỉ chạy khi preview). Chỉ lỗi khi thực thi (parse, review hoặc apply ném, timeout) mới chuyển `failed`, bằng `UPDATE … WHERE status='preview'`.
2. **Khóa advisory theo hash file** (`import-file:<hash>`) trước khi kiểm trùng trong commit. Không có khóa này, hai run cùng hash có thể cùng lọt kiểm tra (READ COMMITTED). Khóa theo từng hash, không phải khóa import toàn cục.
3. **Guard hoàn tác chặt hơn spec ở hai điểm:**
   - tính cả `ledger_opening_balances` vật tư không thuộc run tạo sau commit (sổ cái gồm cả số dư);
   - điều kiện "event trỏ tới phiếu của run" tính cả event đã xóa mềm, và loại event của chính run.
4. **Hoàn tác từ chối adapter `supportsRollback: false`.** Nếu không, run sẽ thành `rolled_back` trong khi dữ liệu upsert vẫn còn. Adapter đã gỡ khỏi registry vẫn hoàn tác được.
5. **Engine sở hữu transaction chạy thử của `review`**, kèm `ReviewContext.phase` (xem §3). Phase 7 không tự mở transaction.
6. **`ImportSummary.expected`.** Engine ghi `reviewJson.expected` cùng lúc đổi `committed`, nên adapter không ghi `import_runs`. Mốc chuyển đổi luôn có trong cùng transaction.
7. **`ImportMapping` nhận chuỗi; thêm `mappingSchema` zod theo adapter.** Lý do: khóa `date:` của phase 6 có giá trị `"yyyy-mm-dd"`. Mapping lưu ở `ImportRun.mapping` khi preview / refresh, nên commit không nhận mapping.
8. **Server action trả `{ ok, … }` thay vì ném** (theo mẫu `delivery-actions.ts`): ở production thông điệp lỗi ném ra bị ẩn. Mỗi action vẫn có đúng một `await requireReleasedModuleRequest("admin.import")`; test entrypoint xanh.
9. **Ghi `import_runs` không qua audit `update`/`delete`.** Lý do: extension đọc cả dòng, gồm `sourceFile` tới ~27 MB, vào audit log. Thay vào đó dùng `updateMany` trong `bypassAudit` (luôn có điều kiện `status`) hoặc `DELETE` thô; `create` dùng `select: {id}`.
10. **Trình duyệt chỉ gửi nội dung .xlsx/.csv.** File khác chỉ gửi đường dẫn để liệt kê. Server tự tính lại lý do bỏ qua, và từ chối nếu một đường dẫn "bị bỏ qua" thực ra hợp lệ, để không lặng lẽ thiếu file.
11. **Trang chi tiết:** `GenericReviewSection` chỉ liệt kê `requiredAcks` kèm trạng thái, vì lỗi chặn và xác nhận còn thiếu đã có ở panel "Duyệt" cấp trang. Không có UI sửa ánh xạ chung; adapter cũ chưa từng có.
12. **`listImportRuns` bỏ cả `reviewJson`** (payload chuyển đổi có thể lớn); `getImportRun` chỉ bỏ `sourceFile`. Run `pending` cũ không còn xóa được, vì spec chỉ cho xóa preview / failed.
13. **Smoke script:** thư mục `SOP/` không có file công nợ nhân công, nên case `cong-no-nhan-cong` dựng workbook nhỏ trong script. Đã bỏ case `gach-nam-huong` / `quang-minh`.
14. **Adapter cũ chưa refactor fail-fast.** `cong-no-nhan-cong`, `du-an-xay-dung`, `tai-chinh-nq`, `sl-dt`, `bang-can-doi`, `du-toan` vẫn `try/catch` từng dòng trong `apply`; quy tắc fail-fast mới chỉ ghi trong hợp đồng. Với engine mới, transaction Postgres đã bị hủy không còn bị ghi `committed`: câu UPDATE trạng thái chạy trong cùng transaction nên sẽ lỗi → `failed`. Lỗi JS thuần vẫn cho "nhập một phần" như trước.

## 6. Integration test viết lại (chưa chạy)

Chạy trên adapter `cong-no-nhan-cong` và `fake-bundle` (đăng ký qua `vi.mock` registry). Các ca:
- lưu nguồn; commit không cần buffer;
- hai commit đồng thời: một thắng, ca kia `ImportPreconditionError`, run vẫn `committed`;
- commit lại sau `committed`; `reviewVersion` cũ;
- refresh kiểm zod; refresh sau `committed` bị từ chối;
- hoàn tác → `rolled_back`, `sourceFile` NULL, master data còn;
- trùng hash; xóa run theo trạng thái;
- gói: danh sách bỏ qua, chạy thử của review đã rollback, `expected` được ghi;
- apply lỗi → không dòng nào, `failed`, xóa được;
- lỗi chặn / thiếu ack / ack thừa bị bỏ / ack mới đòi dưới khóa; `ackedBy` / `ackedAt`;
- guard hoàn tác: kỳ ký ERP, `dieu_chinh` sau commit, event trỏ phiếu của run (đã xóa mềm); hoạt động ở cặp khác không chặn.

Cách chạy khi có Docker:
```
npx prisma migrate deploy   # trên DB *_test của .env.test
npx vitest run --project integration test/integration/import-engine.integration.test.ts
npx playwright test e2e/import-export.spec.ts
npx tsx --env-file=.env.test scripts/smoke-import-apply.ts cong-no-nhan-cong
```

## 7. Câu hỏi còn mở

- Mục 1 ở §5 (lỗi điều kiện giữ trạng thái `preview`) đúng ý người dùng chưa? Spec chỉ nói "failed chỉ từ preview".
- Phase 8 cần cập nhật `docs/system-architecture.md:231` và `docs/codebase-summary.md:214,263`: danh sách adapter mới, trạng thái `rolled_back`, gói thư mục.
