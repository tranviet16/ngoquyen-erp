---
phase: 5
title: "Engine import: gói thư mục, review, guard"
status: pending
priority: P1
effort: "12h"
dependencies: [1]
---

# Phase 5: Engine import — gói thư mục, review, guard

<!-- Updated: Red Team 2026-11-06 — bỏ digest và khóa toàn cục; số phiên bản review; khóa NCC trước review; failed chỉ từ preview; hoàn tác giữ run rolled_back; review mờ do adapter hiển thị; vệ sinh gói và sourceFile; bỏ "Dùng lại ánh xạ" -->

## Goal

Engine import phải chở được một lần chuyển đổi nhiều file (D7): người dùng chọn một thư mục, xem và duyệt, rồi ghi mà không tải lại file. Commit nguyên tử, ghi đúng phiên bản người dùng đã xem; hoàn tác có guard; run đã ghi không bao giờ bị xóa hay đổi trạng thái sai. Phase này không chứa logic nghiệp vụ công nợ.

## Hiện trạng cần sửa (đã kiểm ở code)

- Không có UI ánh xạ: `app/(app)/admin/import/[runId]/commit-panel.tsx:26` luôn gửi `mapping = "{}"` và bắt tải lại file.
- Preview không lưu nội dung đã parse (`lib/import/import-engine.ts:61-73`).
- `commitImport` kiểm trùng hash ngoài transaction (`:110`) và ghi `committed` sau khi transaction đã đóng (`:124-132`); timeout mặc định 5 giây. Mọi lỗi, kể cả khi run đã `committed`, đều ghi `failed` (`:149-157`). Run `failed` xóa được (`delete-run-button.tsx:17-46`), làm FK `importRunId` (`SetNull`, `schema.prisma:617-618`) mất dấu trên dữ liệu đã ghi.
- `rollbackImportRun` xóa luôn `ImportRun` (`:314`), làm mất dấu vết duy nhất.
- `listImportRuns` / `getImportRun` không giới hạn cột (`:162-172`).

## Files to Create / Modify

| Tệp | Thay đổi |
|---|---|
| `lib/import/file-bundle.ts` (tạo) | `encodeBundle(files)` / `decodeBundle(buf)`: JSON `{v:1, files:[{path, size, sha256, data(base64)}]}`, sắp theo path. Chỉ nhận `.xlsx` và `.csv`; bỏ qua và liệt kê file khác (ví dụ `.claude/**`). Đường dẫn phải là đường tương đối chuẩn hóa NFC, không có `..`, không có ký tự điều khiển, ≤ 260 ký tự. Giới hạn ≤ 200 file và ≤ 20 MB. `bundleHash` = sha256 của JSON chuẩn tắc `[[path, sha256], …]`. |
| `lib/import/adapters/adapter-types.ts` | `parse(buffer, ctx?: {fileName})`. Thêm `acceptsBundle?`, `lockScope?(data, mapping): number[]` (NCC cần khóa), `review?(data, mapping, db): Promise<{payload: unknown, blocking: string[], requiredAcks: string[]}>`. Quy tắc ghi rõ: `apply` ném lỗi ngay, không bắt lỗi từng dòng trong transaction (khác adapter cũ ở `cong-no-vat-tu.adapter.ts:204`). |
| `lib/import/import-engine.ts` | Xem chi tiết ở mục "Vòng đời run". |
| `lib/import/rollback-guards.ts` (tạo) | `assertRollbackAllowed(tx, run)`, dùng **cùng điều kiện** với guard độc quyền của adapter (phase 7). Từ chối nếu một cặp của run có: kỳ ký với `importRunId` khác run; dòng sổ vật tư (kể cả `dieu_chinh`) không thuộc run nhưng tạo sau thời điểm commit; event có `deliveryId` trỏ tới phiếu của run. |
| `app/(app)/admin/import/import-actions.ts` | `startPreview` nhận nhiều file kèm đường dẫn tương đối khi adapter `acceptsBundle`. `refreshPreviewAction(runId, mapping)` kiểm `mapping` bằng zod (khóa và giá trị theo kiểu adapter khai báo). `doCommit(runId, reviewVersion)`. Giữ guard `admin.import`. Ghi `ackedBy`, `ackedAt` cho từng `ack:` vào `reviewJson`. |
| `app/(app)/admin/import/import-upload-form.tsx` | Adapter `acceptsBundle` thì dùng ô chọn thư mục (`webkitdirectory`) và gửi `webkitRelativePath`; nhận `.xlsx`, `.csv`. |
| `app/(app)/admin/import/[runId]/page.tsx` | Hiện trạng thái run, lỗi chặn, phần `ack` còn thiếu. Phần duyệt riêng của adapter được render qua map nhỏ `adapterReviewComponents[adapterName]` (phase 7 đăng ký component). Hiện số phiên bản review. |
| `app/(app)/admin/import/[runId]/commit-panel.tsx` | Commit gửi `reviewVersion` đang hiển thị; khóa nút khi còn lỗi chặn hoặc thiếu `ack`; bỏ tải lại file. |
| `app/(app)/admin/import/delete-run-button.tsx` | Chỉ hiện với run `preview` hoặc `failed` không có dữ liệu. |
| `lib/import/adapters/adapter-registry.ts` | Gỡ `CongNoVatTuAdapter`, `GachNamHuongAdapter`, `QuangMinhAdapter`. Lý do: cả ba ghi dòng không có công trình, vi phạm CHECK ở phase 1 (`gach-nam-huong`/`quang-minh` không có `projectId`); adapter file tổng còn không chống trùng. `vat-tu-chuyen-doi` thay thế cả ba. Run cũ vẫn hoàn tác được vì rollback không cần adapter. |
| Xóa `lib/import/adapters/{cong-no-vat-tu.adapter,gach-nam-huong.adapter,quang-minh.adapter}.ts` | **Giữ** `cong-no-vat-tu.parse.ts`, vì `cong-no-nhan-cong.adapter.ts:20,70-71` dùng chung. |
| `scripts/smoke-import-apply.ts` (`:38-39`, `:115`) | Đổi sang adapter nhân công và chữ ký `commitImport` mới. |
| `e2e/import-export.spec.ts` (`:10`) | Đổi từ adapter `cong-no-vat-tu` sang adapter nhân công. |
| `lib/import/README.md`, `docs/system-architecture.md:231`, `docs/codebase-summary.md:214,263` | Cập nhật danh sách adapter và hợp đồng mới. Phần docs làm ở phase 8, nhưng ghi ở đây để không sót. |

## Vòng đời run (`import-engine.ts`)

- **Preview** (`status = preview`):
  - lưu `sourceFile` (bundle hoặc file đơn);
  - tự điền ánh xạ chỉ khi tên chuẩn hóa trùng khít;
  - chạy `review`, lưu `reviewJson = {payload, blocking, requiredAcks, acks}`;
  - `reviewVersion = 1`.
- **Refresh** (chỉ khi `status = preview`, ngược lại từ chối): kiểm mapping bằng zod → chạy lại `review` → lưu lại → `reviewVersion += 1`. `ack` cũ bị xóa nếu mã của nó không còn trong `requiredAcks`.
- **Commit** `commitImport(runId, reviewVersion)`, chạy trong `$transaction({timeout: 300_000, maxWait: 10_000})`:
  1. `SELECT … FROM import_runs WHERE id = $1 FOR UPDATE`. Nếu `status ≠ preview` thì ném lỗi "Run đã được ghi hoặc hoàn tác" **mà không đổi trạng thái**. Nếu `reviewVersion` khác bản đã lưu thì ném "Bản xem trước đã thay đổi, tải lại trang".
  2. Kiểm trùng hash trong transaction (một run `committed` khác cùng hash thì từ chối).
  3. `lockSuppliers(tx, adapter.lockScope(data, mapping))` **trước** khi kiểm, theo quy ước "khóa rồi mới kiểm".
  4. Chạy lại `review` dưới khóa; yêu cầu `blocking` rỗng và đủ `requiredAcks`.
  5. `apply` (adapter tự chạy đối soát và ném lỗi khi lệch, xem phase 7).
  6. `UPDATE import_runs SET status = 'committed', committedAt = now()` trong cùng transaction.
- **Lỗi khi commit**: transaction rollback. Run chỉ chuyển `failed` nếu nó vẫn đang `preview`; ghi trong transaction riêng có điều kiện `WHERE status = 'preview'`. Run đã `committed` không bao giờ thành `failed`.
- **Hoàn tác** (chỉ khi `status = committed`), trong transaction: `lockSuppliers` → `assertRollbackAllowed` → xóa dữ liệu theo `importRunId` (đã có ở `import-engine.ts:286-303`, gồm cả marker) → `status = 'rolled_back'`, `rolledBackAt`, `sourceFile = NULL`. **Không xóa** `ImportRun`.
- **Xóa run**: chỉ khi `status ∈ {preview, failed}` và không có dòng nào mang `importRunId` của run.
- `listImportRuns` / `getImportRun` dùng `omit: { sourceFile: true }`. Chỉ commit đọc `sourceFile` qua truy vấn riêng.

## Tasks & Steps

1. Viết `file-bundle.ts` và test.
2. Mở rộng hợp đồng adapter; các adapter một file vẫn chạy (bỏ qua `ctx`, không có `review` thì `blocking` rỗng).
3. Sửa engine theo vòng đời run; viết `rollback-guards.ts`.
4. Sửa action, form tải lên, trang run, commit panel, nút xóa.
5. Gỡ 3 adapter; sửa script smoke, test registry, adapters, e2e.

## Tests

- `lib/import/__tests__/file-bundle.test.ts`:
  - tất định khi đảo thứ tự file; hash đổi khi sửa một file;
  - từ chối `../x.xlsx` và tên chứa ký tự điều khiển;
  - bỏ qua `.claude/agent-memory/a.md`;
  - vượt giới hạn thì báo lỗi.
- `lib/import/__tests__/adapter-registry.test.ts`, `lib/import/adapters/__tests__/adapters.test.ts`: bỏ phần của adapter đã xóa; các adapter còn lại vẫn xanh.
- Viết lại `test/integration/import-engine.integration.test.ts` trên `cong-no-nhan-cong` và một adapter gói giả lập đăng ký trong test:
  - Nguồn được lưu; commit không cần buffer.
  - Hai commit đồng thời cùng run: một thắng, run kia nhận lỗi mà **không** chuyển `failed`.
  - Commit lần hai sau khi đã `committed`: lỗi, trạng thái vẫn `committed`.
  - `apply` lỗi: không dòng nào được ghi, run `failed`.
  - `reviewVersion` cũ: commit bị từ chối.
  - Còn `blocking` hoặc thiếu `ack`: commit bị từ chối.
  - Refresh sau khi `committed`: bị từ chối.
  - Hoàn tác: run thành `rolled_back`, không bị xóa, `sourceFile` bị xóa.
  - Hoàn tác bị từ chối khi có kỳ ERP ký, có `dieu_chinh` ghi sau commit trong cặp của run, hoặc có event trỏ tới phiếu của run.
  - Xóa run `committed` hoặc `rolled_back` bị từ chối.
  - `listImportRuns` không trả `sourceFile`.
- `e2e/import-export.spec.ts` xanh; `npx tsx scripts/smoke-import-apply.ts` chạy được trên DB test.

## Ownership & Rollback

- Sở hữu: `lib/import/*` (trừ thư mục `lib/import/adapters/vat-tu-chuyen-doi/` của phase 6 và 7), `app/(app)/admin/import/*`, `scripts/smoke-import-apply.ts`, `e2e/import-export.spec.ts`.
- Phase 7 chỉ thêm một dòng vào `adapter-registry.ts` và một mục vào `adapterReviewComponents`, sau phase này.
- Rollback: git revert phần code (cột mới nullable hoặc có mặc định); dữ liệu import cũ không phụ thuộc cột mới.

## Verification

- `npx vitest run --project unit lib/import`
- `npx vitest run --project integration test/integration/import-engine.integration.test.ts`
- `npx playwright test e2e/import-export.spec.ts`
- `npx tsc --noEmit`, `pnpm lint`
