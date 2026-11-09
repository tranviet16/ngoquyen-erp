# Import Engine

Nạp dữ liệu lịch sử từ Excel SOP (một file) hoặc cả thư mục (gói .xlsx/.csv) qua `/admin/import`.

## Adapter đang đăng ký (`adapters/adapter-registry.ts`)

| Adapter | Nguồn | Bảng ghi |
|---|---|---|
| `bang-can-doi-vat-tu` | Bảng cân đối vật tư | `projects`, `project_estimates`, `project_transactions` |
| `du-toan-tong-hop-vt` | Dự toán tổng hợp vật tư | `project_estimates` |
| `cong-no-nhan-cong` | Quản Lý Công Nợ Nhân Công | `ledger_transactions` / `ledger_opening_balances` (labor) |
| `du-an-xay-dung` | Quản Lý Dự Án Xây Dựng | `projects`, `project_estimates`, `project_transactions`, … |
| `tai-chinh-nq` | Hệ thống quản lý tài chính NQ | `loan_contracts`, `journal_entries`, … |
| `sl-dt` | SL - DT | `sl_dt_*` (upsert, không hoàn tác theo run) |

Đã gỡ `cong-no-vat-tu`, `gach-nam-huong`, `quang-minh`: ghi sổ / phiếu vật tư không có công trình
(vi phạm CHECK bắt buộc công trình) và không chống trùng. `cong-no-vat-tu.parse.ts` được giữ vì
`cong-no-nhan-cong` dùng chung. Run cũ của các adapter đã gỡ vẫn hoàn tác được (hoàn tác không cần adapter).

## Vòng đời run (`import-engine.ts`)

| Trạng thái | Ý nghĩa |
|---|---|
| `preview` | Đã parse, lưu `sourceFile` (file hoặc gói), `reviewJson`, `reviewVersion ≥ 1` |
| `committed` | Đã ghi trong một transaction; chỉ có thể hoàn tác |
| `failed` | Lỗi khi thực thi commit (chỉ từ `preview`); xóa được nếu không có dữ liệu |
| `rolled_back` | Đã hoàn tác: dữ liệu bị xóa, `sourceFile = NULL`, run được giữ làm dấu vết |

- **Xem trước** `previewImport(buffer, adapter, fileName, user)` / `previewBundleImport(files, adapter, user, {skippedPaths})`:
  parse → validate → ánh xạ tự điền chỉ khi tên chuẩn hóa trùng khít → `review` của adapter chạy
  trong transaction riêng đã khóa `lockScope` và luôn rollback → `reviewJson`, `reviewVersion = 1`.
- **Lưu & tính lại** `refreshPreview(runId, mapping, user)`: chỉ khi `preview`; mapping kiểm bằng zod
  (`adapter.mappingSchema`, mặc định id dương | null); `reviewVersion += 1` nguyên tử (`UPDATE … RETURNING`,
  trả đúng version của review vừa ghi); xác nhận `ack:<mã>` không
  còn trong `requiredAcks` bị bỏ; xác nhận mới ghi `ackedBy` / `ackedAt`.
- **Ghi** `commitImport(runId, reviewVersion)` — một `$transaction` (timeout 300 s, maxWait 10 s):
  `SELECT … FOR UPDATE` dòng run → phải `preview` (nếu không: ném, không đổi trạng thái) → đúng
  `reviewVersion` → chống trùng hash (trong transaction, khóa theo hash) → `lockSuppliers(lockScope)`
  → `review` lại dưới khóa (không lỗi chặn, đủ xác nhận) → `apply` → `committed` cùng transaction.
  Lỗi điều kiện (`ImportPreconditionError`) giữ nguyên trạng thái; lỗi DB tạm thời (P2028, P2034,
  40P01, 55P03, 40001 — `isTransientDbError`) cũng vậy, kèm thông điệp "thử lại"; lỗi thực thi khác →
  `failed` bằng UPDATE riêng `WHERE status = 'preview'`. Không cần tải lại file.
- **Hoàn tác** `rollbackImportRun(id)` (`import-rollback.ts`): chỉ `committed`; khóa NCC của các cặp →
  `assertRollbackAllowed` (`rollback-guards.ts`) → xóa theo `importRunId` → `rolled_back`.
  Bị từ chối khi một cặp NCC × công trình của run có kỳ ký ngoài run, dòng sổ / số dư vật tư không
  thuộc run tạo hoặc sửa sau commit (`createdAt` / `updatedAt` > `committedAt`, kể cả `dieu_chinh`), hoặc
  dòng sổ trỏ `deliveryId` tới phiếu của run.
- **Xóa run** `deleteImportRun(id)`: chỉ `preview` / `failed` và không còn dòng nào mang `importRunId`.
- `listImportRuns` / `getImportRun` không kéo `sourceFile`.

## Gói thư mục (`file-bundle.ts`, `bundle-path.ts`)

JSON tất định `{v:1, files:[{path, size, sha256, data(base64)}]}` sắp theo đường dẫn. Chỉ nhận
`.xlsx` / `.csv`; thư mục/file ẩn (`.claude/**`), file tạm Excel (`~$…`) và đuôi khác bị bỏ qua và
liệt kê. Đường dẫn tương đối, NFC, không `..`, không ký tự điều khiển, ≤ 260 ký tự. ≤ 200 file,
≤ 20 MB. `bundleHash` = sha256 của JSON `[[path, sha256], …]` (là `fileHash` của run).

## Hợp đồng adapter (`adapters/adapter-types.ts`)

- `parse(buffer, ctx?: {fileName, bundle?})` — adapter `acceptsBundle` nhận gói đã giải mã ở `ctx.bundle`.
- `lockScope?(data, mapping): number[]` — NCC cần khóa trước khi review / ghi.
- `review?(data, mapping, db, {runId, phase})` → `{payload, blocking, requiredAcks}`; pha `preview`
  được chạy thử ghi (engine rollback), pha `commit` không được ghi.
- `apply(data, mapping, tx, runId)` ném lỗi ngay (không bắt lỗi từng dòng trong transaction); trả
  `expected` để engine lưu vào `reviewJson.expected` cùng lúc đổi `committed`.
- Component duyệt riêng: đăng ký vào `adapterReviewComponents` ở
  `app/(app)/admin/import/[runId]/adapter-review-components.ts` (props `AdapterReviewProps`).

## Audit bypass

`apply()` ghi bằng `$executeRaw` (bỏ qua audit extension — có chủ đích cho import lịch sử). Ghi
`import_runs` dùng `updateMany` / SQL thô trong `bypassAudit` vì audit extension của `update` /
`delete` đọc cả dòng (kể cả `sourceFile`). Bản thân `ImportRun` là dấu vết.
