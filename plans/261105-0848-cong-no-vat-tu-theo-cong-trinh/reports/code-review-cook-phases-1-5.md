# Code review: cook phase 1–5 (+ script phase 8a)

Ngày: 2026-11-06. Người review: code-reviewer (chỉ báo cáo, không sửa tệp).

## Phạm vi

- Schema và migration: `prisma/schema.prisma`, `prisma/migrations/20261106090000_vat_tu_pair_scope_and_import_review/migration.sql`.
- Lib: `lib/vat-tu-ncc/**`, `lib/ledger/ledger-service.ts`, `lib/payment/**`, `lib/cong-no-vt/**`, `lib/master-data/**`, `lib/export/**`, và `lib/import/**` **trừ** `adapters/vat-tu-chuyen-doi/**`.
- App và route: `app/api/export/excel/route.ts`; `app/(app)/{vat-tu-ncc,cong-no-vt,admin/import (trừ cutover-review*),master-data/projects,thanh-toan,du-an/[id]/cong-no}`.
- Components: `components/vat-tu-ncc/**`, `components/ledger-grid/**`.
- Script: `scripts/vat-tu-cutover-{inventory,cleanup}.sql`.
- Đối chiếu với `plan.md` (D1–D7, V1–V6, I1–I8, Red Team #1–#15) và các báo cáo cook 01-02, 03, 04, 05, 08a.

Lệnh đã chạy trong lần review này:

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --project unit` | 111 file, 1133 test pass |
| `npx eslint` trên toàn bộ phạm vi (trừ adapter chuyển đổi) | exit 0 |
| Integration, migrate deploy, script SQL, e2e, `pnpm build` | **Không chạy được.** Docker Desktop tắt (`dockerDesktopLinuxEngine` không tồn tại). |

## Đánh giá chung

Lõi phạm vi cặp làm đúng hướng:
- mọi đường ghi vật tư đã xem đều theo thứ tự khóa rồi mới kiểm;
- guard mốc fail closed;
- run import có máy trạng thái chặt (FOR UPDATE, `updateRunIfStatus`, chỉ `preview` mới thành `failed`);
- script dọn có điều kiện độc lập và mặc định ROLLBACK.

Không thấy lỗi Critical về logic. Hai rủi ro chặn phát hành:
1. **Chưa có gì được chạy trên PostgreSQL thật.** Migration, CHECK, script dọn và khoảng 8 bộ integration (cặp, import engine, ràng buộc schema) mới chỉ typecheck.
2. `getMaterialCutoverDate` kéo **cả** `reviewJson` của run chuyển đổi, payload review có thể nhiều MB, ở **mỗi** lần kiểm guard, tức nhiều lần trong một giao dịch.

## Bảng phát hiện

| # | Mức | Vị trí | Tóm tắt |
|---|---|---|---|
| 1 | High | toàn bộ phạm vi | Migration, CHECK, script dọn, integration và e2e chưa từng chạy trên DB thật |
| 2 | High | `lib/vat-tu-ncc/pair-scope.ts:90-95` | Mỗi lần kiểm guard mốc đọc cả `reviewJson` (payload review rất lớn), N lần trong một giao dịch |
| 3 | Medium | `lib/cong-no-vt/material-ledger-service.ts:265-295`, `lib/ledger/ledger-service.ts:469-503` | Sửa số dư ban đầu (đổi công trình, hoặc Chủ thể lưu ≠ Chủ thể công trình) **tạo dòng mới** thay vì sửa dòng, nên số dư bị tính hai lần |
| 4 | Medium | `scripts/vat-tu-cutover-cleanup.sql:262-295`, `lib/master-data/project-service.ts:128` | I2 không được kiểm cho dòng giữ lại (đã có công trình) và cho lần gán Chủ thể đầu tiên |
| 5 | Medium | `scripts/vat-tu-cutover-cleanup.sql:242-249` | Kiểm "event mồ côi" tính cả event đã xóa mềm. Không có cách duyệt, script dừng mà không có lối ra |
| 6 | Medium | `scripts/vat-tu-cutover-cleanup.sql:90-111` | Xóa **mọi** sổ và số dư vật tư ≤ 26/10 của mọi NCC, danh sách duyệt không loại trừ được NCC nào. Chưa có bước đối chiếu với tập NCC có trong gói Excel |
| 7 | Medium | `chot-ky-client.tsx:117`, `doi-chieu-client.tsx:69-92`, `thanh-toan-client.tsx:174-189`, `components/ledger-grid/*` | Chốt kỳ, ký, tạo kỳ, thanh toán và sổ vẫn **ném lỗi**. Ở production, thông điệp khóa kỳ / `cutover_locked` / `missing_entity` bị ẩn |
| 8 | Low | `lib/import/import-engine.ts:104-113` | Engine không kiểm `expected.cutoverDate` trước khi đặt `committed`. Adapter quên trả là mọi ghi vật tư toàn hệ thống bị chặn |
| 9 | Low | `lib/import/rollback-guards.ts:103,109` | Guard hoàn tác dựa vào `createdAt > committedAt`. Có thể lọt dòng ghi bởi giao dịch chờ khóa trong lúc commit, hoặc event được khôi phục (revive) |
| 10 | Low | `lib/import/import-engine.ts:129` | Lỗi tạm thời (deadlock, hết 300 giây vì chờ khóa NCC của lần "tính lại") cũng đánh run `failed`, phải tải lại gói 20 MB |
| 11 | Low | `lib/import/import-preview.ts:243-253` | `refreshPreview` đọc lại `reviewVersion` sau UPDATE, nên có thể trả version của lần tính lại khác (race) |
| 12 | Low | `lib/master-data/project-service.ts:118-162` | Kiểm "công trình đã có dữ liệu vật tư" rồi mới update, không khóa (TOCTOU với ghi vật tư đầu tiên) |
| 13 | Low | `lib/vat-tu-ncc/period-recon-check-service.ts:116-121` | Phiếu lịch sử trước 01/01/2026 (D6) nằm ngoài marker nên bị báo "phiếu mồ côi" giả |
| 14 | Low | `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx:58-60` | Cờ `locked` của dòng không tính mốc chuyển đổi. Nút sửa vẫn hiện, server từ chối |
| 15 | Low | `lib/vat-tu-ncc/reconciliation-compute.ts:236-247` | `freezeReconciliationSnapshot` ghi qua `update` có audit. Audit ghi bằng kết nối riêng (`before = null`), còn lại kể cả khi commit import rollback |
| 16 | Low | `components/ledger/{opening-balance-client,transaction-form-dialog,transaction-grid}.tsx`, `components/cong-no-vt/*`, `so-du-ban-dau-client.tsx` | Code chết, chỉ còn để `tsc` biên dịch được |

## Chi tiết

### 1. [High] Chưa xác minh trên PostgreSQL thật

- **Hiện trạng.** Báo cáo cook 01-02, 05, 08a đều ghi integration "BỎ QUA" vì Docker tắt. Lần review này cũng không chạy được. Những phần chưa từng thực thi:
  - `migration.sql`: khối DO, các CHECK kiểm ngay, DROP/CREATE index;
  - script dọn (42 câu lệnh, 7 khối DO, `\copy`, `\if`);
  - `vat-tu-schema-constraints`, `vat-tu-ncc-khoa-theo-cap`, `import-engine`, `vat-tu-ncc-cong-trinh`, `cong-no-tong-hop-cong-trinh`;
  - 5 bộ integration đã sửa fixture.
- **Kịch bản.** Một lỗi SQL (ví dụ tên cột trong `rollback-guards.ts` hoặc `ARRAY_AGG(...)[1:3]`) chỉ lộ ra khi admin bấm Hoàn tác trên dữ liệu thật. Lỗi cú pháp psql trong script dọn chỉ lộ ra trong cửa sổ go-live.
- **Đề xuất.** Chặn phát hành cho tới khi:
  - `prisma migrate deploy` chạy trên DB `_test`;
  - toàn bộ `pnpm test:integration` xanh;
  - hai script SQL chạy ít nhất một lần trên bản sao DB thật (runbook Phần A);
  - `pnpm build` xanh.

### 2. [High] `getMaterialCutoverDate` kéo nguyên `reviewJson` ở mỗi lần kiểm guard

- **Hiện trạng.** `pair-scope.ts:91-95` gọi `findFirst({ select: { id, reviewJson } })`. Payload review của adapter chuyển đổi (`review-builder.ts` `buildPayload`) chứa catalog, các cặp, ngày, phiếu, chẩn đoán và kết quả đối soát, nên dễ lên hàng trăm KB tới vài MB.
- **Số lần gọi.** Guard chạy trong `assertPeriodOpen` / `assertAfterMaterialCutover`:
  - mỗi phiếu khi chốt kỳ (`period-close-service.ts:295`, gọi `upsertFromDelivery` → `assertMaterialTypeWritable`), cộng thêm một lần nếu event còn sống;
  - mỗi dòng bulk sổ (2 lần mỗi dòng khi sửa);
  - mỗi phiếu khi sửa (3 lần);
  - mỗi dòng đợt khi đóng.
- **Kịch bản.** Sau go-live, chốt kỳ 150 phiếu dẫn tới khoảng 150–300 lần detoast và parse JSON nhiều MB, trong giao dịch 60 giây đang giữ khóa advisory của NCC. Hậu quả: hết giờ giao dịch, mọi ghi vào NCC đó bị nghẽn, tải DB và Node tăng vọt.
- **Đề xuất.** Đọc đúng một trường, ví dụ ``SELECT ("reviewJson"->'expected'->>'cutoverDate') AS d FROM import_runs WHERE adapter = … AND status = 'committed' ORDER BY "committedAt" DESC NULLS LAST, id DESC LIMIT 1``. Hoặc thêm cột `cutoverDate DATE` trên `import_runs`. Thêm nhớ tạm theo giao dịch nếu cần. Đo thử với `reviewJson` thật trong lần chạy thử.

### 3. [Medium] Sửa số dư ban đầu tạo bản sao thay vì sửa dòng

- **Hiện trạng.**
  - `patchMaterialOpeningBalanceInternal` gộp patch rồi gọi `setOpeningBalance`.
  - `setOpeningRow` tìm dòng theo `(ledgerType, entityId, partyId, projectId)`, với `entityId` **đã được thay** bằng `Project.entityId` (`scopeMaterialInput`), không theo `id` của dòng đang sửa.
- **Kịch bản A (lỗi có từ trước, nay nằm trên đường găng của cặp).** Kế toán đổi công trình của dòng số dư #10 từ X sang Y trong lưới `so-du-ban-dau`. Dòng #10 (X) giữ nguyên và một dòng mới (Y) được tạo, nên `pairBalanceAsOf` và báo cáo cộng số dư hai lần.
- **Kịch bản B (do phase 2 gây ra).** Dòng giữ lại có `entityId` lưu = E1, còn công trình thuộc E2 (xem #4). Chỉ sửa `balanceTt` cũng không tìm thấy (E2, NCC, công trình), nên tạo dòng thứ hai, số dư nhân đôi.
- **Đề xuất.** Patch theo `id` thì `update` đúng dòng `id` (sau guard của cả cặp cũ lẫn cặp mới). `setOpeningBalance` chỉ dành cho dòng mới. Hoặc chặn đổi NCC/công trình của một dòng số dư.

### 4. [Medium] I2 (Chủ thể = `Project.entityId`) không được kiểm ở hai chỗ

- **Script dọn (`cleanup.sql:262-295`).** Chỉ kiểm lệch Chủ thể cho dòng `assign`. Dòng sổ/số dư vật tư > 26/10 **đã có** `projectId` từ trước thì giữ nguyên mà không ai so `entityId` với `projects.entityId`.
- **`assertProjectEntityChangeAllowed` (`project-service.ts:128`).** Luôn cho gán khi `project.entityId` đang NULL, kể cả khi công trình đã có dòng vật tư mang Chủ thể khác. Đây đúng là trường hợp runbook bước 8: công trình vừa được gán cho dòng cũ.
- **Kịch bản.**
  - Báo cáo `queryDetailReport` tách một cặp thành hai nhóm Chủ thể.
  - Sửa một dòng sổ cũ sẽ lặng lẽ đổi `entityId` của nó.
  - Sửa số dư sinh bản sao (#3).
- **Đề xuất.**
  - Thêm vào script dọn (bước 6) và inventory một kiểm "dòng vật tư còn hiệu lực có `projectId` mà `entityId` ≠ `projects.entityId` (khi công trình đã có Chủ thể)".
  - Ở `assertProjectEntityChangeAllowed`, khi gán lần đầu, từ chối nếu tồn tại dòng vật tư của công trình có `entityId` ≠ `nextEntityId`.

### 5. [Medium] Script dọn có thể dừng mà không có lối ra (event đã xóa mềm)

- **Hiện trạng.** `cleanup.sql:242-249` báo lỗi khi có event trỏ tới phiếu sắp xóa mà event không nằm trong danh sách xóa. Kiểm này **không lọc** `t."deletedAt" IS NULL`.
- **Kịch bản.**
  1. Phiếu (> 26/10) bị sửa về "không công trình" (code cũ cho phép `projectId ?? null`): event bị xóa mềm nhưng vẫn mang `projectId` X.
  2. Phiếu sau đó bị xóa mềm, nên phiếu rơi vào `vt_pred_delivery_delete`.
  3. Event không thuộc `vt_pred_ledger_delete` (có công trình, ngày > 26/10).
  4. Danh sách duyệt phải trùng khít điều kiện, nên người dùng không thêm được event đó. Script luôn RAISE.
- Với event đã xóa mềm, FK `SET NULL` vô hại.
- **Đề xuất.**
  - Chỉ kiểm event còn hiệu lực (`AND t."deletedAt" IS NULL`).
  - Hoặc thêm vào điều kiện xóa sổ: "event đã xóa mềm của phiếu bị xóa". Nếu chọn cách này thì sửa inventory mục 13 cùng lúc.

### 6. [Medium] Xóa sổ/số dư ≤ 26/10 theo kiểu tất cả hoặc không

- **Hiện trạng.** Điều kiện `vt_pred_ledger_delete` và `vt_pred_opening_delete` phủ mọi NCC. Danh sách duyệt bắt buộc trùng khít, nên không loại trừ được NCC nào.
- **Kịch bản.** Một NCC có công nợ trong ERP nhưng không có trong gói "Quản Lý Công Nợ" (hoặc bị bỏ qua do sai tên file) sẽ mất toàn bộ lịch sử tới 26/10. Import không bù lại, vì cặp không có trong gói.
- **Đề xuất.** Thêm một mục vào inventory: danh sách NCC có dòng sẽ bị xóa, để người dùng đối chiếu tay với danh sách NCC trong Nhập Liệu / Số Dư / CSV. Hoặc để adapter, khi xem trước, cảnh báo NCC có dữ liệu ERP ≤ mốc trong bản sao lưu mà không có trong gói. Cần người dùng xác nhận V2 áp cho mọi NCC.

### 7. [Medium] Lỗi nghiệp vụ mới bị ẩn ở production

- **Hiện trạng.** Chỉ `delivery-actions.ts`, `import-actions.ts` và `patchProjectEntity` trả `{ok, message}`. Các action còn lại vẫn ném lỗi, và client hiển thị `err.message`:
  - `commitPeriodClose`, `previewPeriodClose`;
  - `createReconciliation`, `signReconciliation`, `unsignReconciliation`, `softDeleteReconciliation`;
  - `createMaterialTransaction` / `bulkUpsert*` / `patch*` (lưới sổ, tab Thanh toán).
- Ở bản build production, React Flight chỉ gửi `digest` (chính comment trong `delivery-actions.ts` nêu điều này).
- **Kịch bản.** Ngay sau go-live, kế toán sửa dòng 20/10 hoặc chốt kỳ chồng marker và chỉ thấy "An error occurred…". Không biết đó là `cutover_locked` hay "kỳ đã ký". Goal 2 ("lỗi khóa kỳ hiện trên UI") chỉ đạt cho phiếu ngày.
- **Đề xuất.** Bọc các action trên theo đúng mẫu `run()` / `userFacingMessage` (có thể dùng chung một helper), rồi sửa client kiểm `result.ok`.

### 8. [Low] Engine không chặn commit run chuyển đổi thiếu mốc

- **Hiện trạng.** `import-engine.ts:110-112` chỉ ghi `expected` khi adapter trả về. Guard fail closed với `cutover_invalid`.
- **Kịch bản.** Adapter quên trả `expected.cutoverDate`: run vẫn thành `committed`, và **mọi** ghi vật tư của mọi NCC bị chặn cho tới khi hoàn tác.
- **Đề xuất.** Trong `commitInTransaction`, với `run.adapter === MATERIAL_CUTOVER_ADAPTER`, kiểm `parseCutoverDate({ expected: summary.expected })` khác null trước `updateRunIfStatus`. Nếu null thì ném để rollback.

### 9. [Low] Guard hoàn tác dựa vào `createdAt`

- `createdAt` là `CURRENT_TIMESTAMP`, tức thời điểm **bắt đầu giao dịch**. Một giao dịch ERP bắt đầu trong 300 giây commit và chờ `lockSuppliers` sẽ ghi sau commit nhưng có `createdAt` < `committedAt`, nên guard 2 bỏ sót.
- `upsertDeliveryRow` khôi phục event đã xóa mềm (`createdAt` cũ) cũng lọt.
- Rủi ro thấp vì module đóng khi go-live, nhưng lệch I8.
- **Đề xuất.** Ghi `max(id)` của `ledger_transactions` / `ledger_opening_balances` vào `expected` lúc commit và so theo `id`. Hoặc so thêm `updatedAt`.

### 10. [Low] Lỗi tạm thời biến run thành `failed`

- `commitImport` đánh `failed` cho mọi lỗi không phải precondition, gồm deadlock 40P01, hết giờ giao dịch Prisma, hết giờ chờ kết nối.
- **Kịch bản.** Hai tab: một tab "Lưu & tính lại" (giao dịch chạy thử giữ khóa NCC tới 300 giây, sau đó cần KEY SHARE trên dòng run), tab kia "Ghi" (giữ FOR UPDATE dòng run, chờ khóa NCC). Deadlock xảy ra, run bị `failed`, phải tải lại cả thư mục.
- **Đề xuất.** Coi lỗi tạm thời (P2028, P2034, 40P01, 55P03) như precondition: giữ `preview`, báo "thử lại".

### 11. [Low] `refreshPreview` trả sai `reviewVersion` khi tính lại đồng thời

- `import-preview.ts:249` đọc lại version sau UPDATE, nên có thể nhận version của lần tính lại thứ hai trong khi trả `review` của lần thứ nhất.
- Commit hiện dùng version của trang (đọc cùng dòng với review), nên chưa gây sai.
- **Đề xuất.** Dùng `UPDATE … RETURNING "reviewVersion"` (SQL thô).

### 12. [Low] Đổi Chủ thể không khóa

- `assertProjectEntityChangeAllowed` đếm dữ liệu rồi `project.update` mà không khóa. Một ghi vật tư đầu tiên chen giữa sẽ mang Chủ thể cũ.
- **Đề xuất.** Giao dịch có `SELECT … FROM projects WHERE id = $1 FOR UPDATE`, và `resolveMaterialEntityId` đọc `FOR SHARE` trong giao dịch ghi. Hoặc chấp nhận rủi ro vì đây là thao tác admin hiếm.

### 13–16. [Low] Nhận xét ngắn

- **#13.** `inCutoverMarker` chỉ xét khoảng của marker. Theo D6, phiếu lịch sử có thể trước 01/01/2026, nên tab "Kiểm tra khớp" báo mồ côi giả. Đề xuất: phân loại theo `importRunId` của run chuyển đổi đã commit, hoặc theo "ngày ≤ mốc".
- **#14.** Tính thêm `date ≤ cutover` vào `locked` ở `thanh-toan/page.tsx`, để nút sửa không hiện cho dòng chắc chắn bị từ chối.
- **#15.** Audit của marker (`before = null`) ghi ngoài giao dịch. Nếu commit rollback sau bước đông cứng thì còn audit rác. Có thể dùng `$executeRaw` hoặc `bypassAudit` cho đường import và ghi một audit tổng.
- **#16.** Đề xuất phase 8 xóa các tệp chết đã liệt kê (báo cáo 01-02 mục 3.9 cũng đề nghị như vậy).

## Đã kiểm và thấy đúng (vùng rủi ro)

- **Khóa rồi mới kiểm (I6).**
  - `createDelivery`, `updateDelivery` (cặp cũ + ngày cũ, cặp mới + ngày mới, cặp + ngày của event) và `softDeleteDelivery` đều đọc lại dưới khóa.
  - `commitPeriodClose` tìm `existingRecon` theo `(NCC, công trình, biên)` ✓.
  - `signReconciliation`, `unsignReconciliation` (chỉ xét kỳ sau của cùng cặp), `create/update/softDeleteReconciliation` ✓.
  - `LedgerService.create/update/softDelete/upsertFromDelivery/setOpeningBalance` ✓.
  - `bulkUpsert*` khóa một lần theo thứ tự tăng dần ✓.
  - `adminPatchMaterialTransaction` ✓; `syncClosedRoundToLedger` ✓.
  - Commit import: FOR UPDATE run → khóa hash → `lockSuppliers(lockScope)` → review lại → apply ✓.
  - Hoàn tác: FOR UPDATE → khóa NCC của các cặp → guard → xóa ✓.
- **Guard mốc.**
  - Chỉ run `committed` của `vat-tu-chuyen-doi`; `rolled_back`, `preview` và `failed` không tính ✓.
  - `dieu_chinh` bỏ qua khóa kỳ nhưng vẫn phải sau mốc ✓.
  - Số dư ban đầu kiểm cả `asOf` mới lẫn `asOf` cũ ✓.
  - `cutoverImportRunId` không lộ ra server action nào ✓.
- **Marker chuyển đổi.** Gỡ ký, sửa, xóa đều bị từ chối, kiểm cả trước lẫn sau khi khóa. Chốt lại đúng biên marker bị `validatePeriodBounds` chặn vì chồng lấn kỳ đã ký ✓.
- **Chủ thể suy từ công trình.** Sổ, số dư, event chốt kỳ, dòng đợt `vat_tu` (`upsertItem`, `refreshItemBalances`) và đồng bộ đợt đều làm vậy. Công trình thiếu Chủ thể báo `missing_entity` ✓.
- **Nhân công không đổi.** `inMaterialTx`, `lockParties`, `scopeMaterialInput`, `assertOpeningEditable` đều no-op với labor. Lưới `ledger-grid` mặc định `requireProject = false`. `cong-no-nc` dùng schema riêng ✓.
- **Migration.**
  - Pre-check tính cả dòng xóa mềm (cần vì NOT NULL).
  - Tên index bị DROP tồn tại trong `20260504160000…:50` và `20260729162000…:24`, không migration nào đổi tên.
  - Tên index và FK mới khớp quy ước Prisma (≤ 63 ký tự).
  - CHECK sổ và số dư chỉ áp cho `material`.
  - Không có CHECK trên `payment_round_items` (đúng plan).
  - Script nhiều câu lệnh chạy trong giao dịch ngầm, nên CHECK lỗi là rollback toàn bộ.
- **Engine import.**
  - `failed` chỉ từ `preview`.
  - Đúng `reviewVersion`; không có review hoặc còn lỗi chặn thì từ chối.
  - Chống trùng hash trong giao dịch, có khóa advisory theo hash; run `rolled_back` được phép import lại.
  - Hoàn tác giữ run ở `rolled_back` và xóa `sourceFile`.
  - Xóa run chỉ khi `preview` hoặc `failed` và không còn dữ liệu. `IMPORT_TAGGED_TABLES` đủ 23 bảng, đều tồn tại.
  - `sourceFile` không bị kéo ở list, get, refresh, `lockRunRow` hay guard.
  - Đường dẫn gói: NFC, tương đối, không `..` / `\` / ký tự điều khiển, trùng là lỗi, sha256 từng file, giới hạn 200 file / 20 MB (< `bodySizeLimit` 25 MB).
  - Mọi server action có `admin.import` + `requireActiveAdmin` và trả `{ ok, … }`.
  - Audit của `importRun.create` chỉ chép `{ id }`.
- **Phân quyền.**
  - `listPairsOfProject` kiểm lại `canAccess("cong-no-vt")`, gồm cả kiểm module đã phát hành, trước khi trả số nợ.
  - Trang chi tiết đối chiếu: 404 khi `supplierId` hoặc `projectId` lệch.
  - Route export `cong-no-cong-trinh`: `canAccess(cong-no-vt, read)`, kiểm tham số bằng `parseProjectDebtQuery`, không lộ chi tiết lỗi.
  - Trang thanh toán dùng guard `cong-no-vt`.
- **Pivot và Excel.** Cùng `queryDetailReport` và `buildProjectPivot`. Tổng chung không phụ thuộc chiều xoay. Excel nhận đúng cửa sổ ISO như trang. Chế độ lũy kế khi không có `from` ✓.
- **Script dọn.**
  - Chỉ chạy trên schema cũ; có khóa bảng.
  - Danh sách duyệt phải trùng khít điều kiện độc lập (thiếu hoặc thừa đều RAISE).
  - Mỗi lệnh DELETE/UPDATE lọc theo cả danh sách duyệt lẫn điều kiện; số đã xử lý được so với cả hai.
  - Kiểm mồ côi event → phiếu; dòng đợt thanh toán phải duyệt riêng; chặn khi còn đợt `vat_tu` mở.
  - Kiểm lại điều kiện migrate; mặc định ROLLBACK; xuất CSV đủ để khôi phục.
- **Hồi quy.**
  - `tsc` 0 lỗi; mọi nơi gọi có kiểu đã cập nhật (grep `assertPeriodOpen`, `upsertFromDelivery`, `supplierBalanceAsOf`, `assertSupplierOpeningEditable`).
  - Test `period-lock-supplier-ids` được thay bằng `period-lock-pairs.test.ts`, giữ đủ ca `collectSupplierIds` / `lockSuppliers`.
  - Test adapter cũ bị gỡ cùng adapter; `cong-no-vat-tu.parse.ts` vẫn được `cong-no-nhan-cong` dùng.

## Theo dõi kế hoạch (không sửa plan)

- **Phase 1, 2, 3, 4, 5.** Code xong. Chưa đạt tiêu chí "integration xanh" (#1).
- **Phase 8a.** Script và runbook xong. Chưa chạy thử.
- **Việc tiếp theo.**
  - Sửa #2–#7.
  - Chạy integration và `pnpm build` khi có Docker.
  - Chạy thử runbook Phần A, đo kích thước `reviewJson` và thời gian chốt kỳ sau import.

## Câu hỏi chưa giải quyết

1. V2 có áp cho **mọi** NCC không, kể cả NCC không có trong gói Excel (#6)?
2. Có muốn giữ fail closed toàn hệ thống khi run chuyển đổi thiếu mốc, hay chặn ngay ở engine (#8)?
3. I8 (guard hoàn tác = guard import lại) chưa kiểm được: phía "import lại" nằm trong `adapters/vat-tu-chuyen-doi/**`, ngoài phạm vi review này.


## Sửa theo code review

Ngày: 2026-11-06. Người sửa: fullstack-developer. Sửa #2–#16 (đều đã được chấp nhận); #1 không thuộc danh sách sửa (cần Docker). Chưa commit / push. Không migrate / deploy DB nào.

### Kết quả kiểm tra (lệnh chạy thật)

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | exit 0, **0 lỗi** |
| `npx vitest run --project unit` | **122 file / 1204 test pass** (trước sửa: 111 / 1133) |
| `npx eslint .` | exit 0, **0 lỗi, 0 cảnh báo** |
| `npx next build` | **thành công** (exit 0, đủ route `/vat-tu-ncc/...`, `/cong-no-vt/...`) |
| Integration (`--project integration`) | **Không chạy.** Docker Desktop tắt (`//./pipe/dockerDesktopLinuxEngine` không tồn tại), không có DB `*_test` nào. Các bộ integration vẫn qua `tsc`. |
| Script SQL | **Không chạy trên DB nào.** Parse bằng `pglast` 8.7 (libpg_query, ngữ pháp PostgreSQL thật): inventory 36 câu lệnh; cleanup 46 câu lệnh + 8 thân `DO` (parse dạng PL/pgSQL). Meta-command psql (`\if`, `\copy`, `\echo`, `\pset`, `\o`) chỉ rà bằng mắt. Tên cột đối chiếu với schema cũ (HEAD): chỉ dùng cột đã có (`partyId`, `projectId`, `entityId`, `deletedAt`, `deliveryId`, `paymentRoundItemId`, `asOfDate`, `supplierId`, `projects."entityId"`, `suppliers.name`). |

### Từng phát hiện

| # | Trạng thái | Cách sửa | Test |
|---|---|---|---|
| 2 | Đã sửa | `getMaterialCutoverDate` (`lib/vat-tu-ncc/pair-scope.ts`) đọc **một trường** bằng SQL: `SELECT id, ("reviewJson" -> 'expected' ->> 'cutoverDate') … WHERE adapter = 'vat-tu-chuyen-doi' AND status = 'committed' ORDER BY "committedAt" DESC NULLS LAST, id DESC LIMIT 1`, qua client được truyền (transaction). Run committed mà mốc thiếu / sai → vẫn `cutover_invalid` (fail closed). Kiểu client đổi `importRun` → `$queryRaw` (`CutoverClient`, `PeriodLockClient`, `LedgerWriteClient`, `SyncClient`, `assertOpeningEditable`). Tách `parseCutoverDateValue`. | `pair-scope.test.ts` (SQL chỉ đọc trường mốc, không `reviewJson`/`sourceFile`; null / chuỗi sai / ngày không tồn tại → `cutover_invalid`), `period-lock-pairs.test.ts`, `payment-service.test.ts` cập nhật mock. |
| 3 | Đã sửa | `LedgerService.updateOpeningBalance(id, input, client)` (`lib/ledger/ledger-service.ts`): khoá NCC cũ + mới, đọc lại dòng dưới khoá, `assertOpeningEditable` cho **cặp cũ (ngày cũ)** và **cặp mới (ngày mới)**, Chủ thể suy từ công trình mới, từ chối nếu bộ (Chủ thể, NCC, công trình) đã thuộc dòng khác, rồi `update` đúng `id`. `patchMaterialOpeningBalanceInternal` (patch + dòng có id trong bulk) gọi hàm này; `setOpeningBalance` chỉ còn cho dòng mới. Sổ nhân công không đổi. | `lib/ledger/__tests__/ledger-service-opening.test.ts` (10 ca: đổi công trình X→Y sửa #10, Chủ thể lưu ≠ Chủ thể công trình không nhân đôi, khoá NCC cũ+mới, cặp cũ / mới đã ký, ngày cũ / mới ≤ mốc, trùng unique, không tồn tại, `missing_entity`); `lib/cong-no-vt/__tests__/material-opening-patch.test.ts` (đi qua server action thật: patch và bulk không bao giờ tạo dòng thứ hai). |
| 4a | Đã sửa | Hai script dùng chung view `vt_entity_check`: dòng sổ (còn hiệu lực) / số dư vật tư **không bị xoá** và có công trình mà Chủ thể ≠ `projects."entityId"` (`lech`), hoặc công trình chưa có Chủ thể (`nhieu_chu_the` khi dòng mang ≥ 2 Chủ thể, `chua_co_chu_the` khi một Chủ thể). Inventory: mục 1 dòng 10 (đếm `lech` + `nhieu_chu_the`) và mục 11f (liệt kê theo công trình). Cleanup bước 9 (sau khi xoá / gán, trong transaction): còn `lech` / `nhieu_chu_the` → RAISE; `chua_co_chu_the` được liệt kê trong bảng "công trình chưa có Chủ thể — bước 8 gán", nay gồm cả công trình của dòng giữ nguyên. | `pglast` parse; chưa chạy trên DB. |
| 4b | Đã sửa | `assertProjectEntityChangeAllowed` (`lib/master-data/project-service.ts`): gán lần đầu (từ NULL) bị từ chối nếu công trình có dòng sổ (chưa xoá) / số dư vật tư mang Chủ thể khác Chủ thể sẽ gán. | `patch-actions.test.ts`: gán lần đầu được khi không có dòng khác Chủ thể (đếm đúng `entityId: { not }`), bị từ chối khi có. |
| 5 | Đã sửa | Chọn phương án "đưa vào điều kiện xoá": `vt_pred_ledger_delete` thêm `deletedAt IS NOT NULL AND deliveryId ∈ vt_pred_delivery_delete` (event đã xoá mềm đi cùng phiếu). Kiểm mồ côi giữ nguyên, nên chỉ event **còn hiệu lực** mới chặn. Inventory: mục 11d viết lại đúng điều kiện mồ côi của script dọn; candidates ghi chú "event của phiếu sẽ xoá — xoá cùng phiếu"; số đếm, mục 10, 11b, 12, 13 dùng chung các view. | `pglast` parse; chưa chạy trên DB. |
| 6 | Đã sửa | Danh sách tuỳ chọn `/tmp/cutover/keep-suppliers.csv` (`supplier_id,note`), bật bằng `-v giu_ncc=on` ở **mọi** lần kiểm kê và dọn. Sổ, số dư **và phiếu** ≤ 26/10 của NCC giữ không bị xoá; dòng thiếu công trình của họ thuộc tập `assign` (danh sách duyệt phải trùng khít, thiếu → RAISE). Kiểm sau dọn và inventory mục 1 loại NCC giữ. Cleanup kiểm NCC lặp / không tồn tại, ghi `keptSuppliers` vào audit, in bảng số dòng giữ theo NCC. Inventory mục 0b (NCC giữ) và mục 14: theo NCC, số dòng ≤ 26/10 sẽ xoá (sổ, sổ còn hiệu lực + tổng TT, số dư + tổng, phiếu) và số dòng giữ, để đối chiếu với danh sách NCC trong gói Excel. Inventory tạo bảng / view **tạm** trước `BEGIN … READ ONLY` (transaction chỉ đọc không cho CREATE), không ghi bảng thật. Runbook: mục 0.4, mục mới 0.5, bước 4, 5 (bước duyệt NCC giữ), 6, 8, P2. | `pglast` parse; chưa chạy trên DB. |
| 7 | Đã sửa | Helper chung `lib/vat-tu-ncc/action-result.ts` (`runAction`, `userFacingMessage`, `ActionResult`), `delivery-actions.ts` chuyển sang dùng. Action mới trả `{ ok: true, … } \| { ok: false, message }`, vẫn có guard module ở mỗi action và guard nghiệp vụ ở service: `period-close-actions.ts` (xem trước / chốt kỳ), `reconciliation-actions.ts` (tạo / ký / gỡ ký / xoá), `lib/cong-no-vt/material-ledger-actions.ts` (tạo / sửa / sửa admin / xoá giao dịch, bulk sổ, patch / bulk / xoá số dư). Lỗi nghiệp vụ (MaterialScopeError, ModuleRequestError, `Error` thuần, zod) trả nguyên văn; lỗi khác → thông điệp chung + `console.error`. Client chuyển sang action mới và `toast.error(message)`: chốt kỳ, đối chiếu, nút ký, tab Thanh toán. Lưới dùng chung `components/ledger-grid/*` xử lý cả hai hình dạng qua `unwrap-action-result.ts` (`ok: false` → `Error(message)` ở client, DataGrid hiện toast và hoàn tác ô); trang `cong-no-vt/{nhap-lieu,so-du-ban-dau}` truyền action mới; sổ nhân công giữ action cũ (ném lỗi), không đổi hành vi. Hàm service gốc giữ nguyên cho trang server và integration test. | `period-close-reconciliation-actions.test.ts`, `material-ledger-actions.test.ts`, `test/unit/ledger-grid-unwrap-action-result.test.ts`, `delivery-actions.test.ts` (vẫn xanh). |
| 8 | Đã sửa (chỉ test) | Không đổi engine. | `lib/import/adapters/vat-tu-chuyen-doi/__tests__/adapter-expected-cutover.test.ts`: `apply` (lớp DB / ghi / đối soát giả) luôn trả `expected.cutoverDate = "2026-10-26"`, `parseCutoverDate` của guard đọc được; marker đông cứng sau đối soát; hằng `CUTOVER_DATE`, `cutoverConstantsForReview()` thống nhất; tên adapter = `MATERIAL_CUTOVER_ADAPTER`. |
| 9 | Đã sửa | `rollback-guards.ts`: dòng sổ / số dư vật tư không thuộc run trong cặp của run chặn khi `createdAt > committedAt` **hoặc** `updatedAt > committedAt`. Thông điệp thêm "(tạo mới hoặc sửa)", vẫn giữ cụm "ghi sau khi run được commit" mà integration test so khớp. Ghi trong commit đều có `updatedAt` trước `committedAt` (đặt sau `apply`), nên không tự chặn. | `lib/import/__tests__/rollback-guards.test.ts`. |
| 10 | Đã sửa | `isTransientDbError` (`import-errors.ts`) duyệt mã lỗi ở `code` / `originalCode` qua `meta` / `cause` / `driverAdapterError` (driver adapter pg lồng mã Postgres): P2028, P2034, 40P01, 55P03, 40001. `commitImport`: lỗi tạm thời → `ImportPreconditionError(TRANSIENT_COMMIT_MESSAGE)`, run giữ `preview`, ghi `console.warn`; lỗi khác vẫn `failed`. | `lib/import/__tests__/import-engine-commit-transient.test.ts`. |
| 11 | Đã sửa | `saveReviewIfPreview` (`import-run-store.ts`): `UPDATE import_runs SET mapping, "reviewJson", "reviewVersion" = "reviewVersion" + 1 WHERE id AND status = 'preview' RETURNING "reviewVersion"` (SQL thô, không qua audit). `refreshPreview` trả đúng version đó, không đọc lại. | `lib/import/__tests__/import-preview-refresh.test.ts`. |
| 12 | Đã sửa | Đổi Chủ thể chạy trong `prisma.$transaction`: `SELECT "entityId" FROM projects WHERE id = … AND "deletedAt" IS NULL FOR UPDATE` rồi mới đếm và `update`. `resolveMaterialEntityId`: với client transaction (khác `prisma` gốc) đọc `… FOR SHARE`; với `prisma` gốc đọc thường. Mọi đường ghi vật tư (LedgerService, đồng bộ đợt, commit import) đều gọi với client transaction. | `patch-actions.test.ts` (FOR UPDATE trước update, sửa trường khác không mở transaction, công trình không tồn tại); `pair-scope.test.ts` (FOR SHARE trong transaction, client gốc đọc thường). |
| 13 | Đã sửa | `checkPeriodConsistency`: phiếu / dòng `lay_hang` có ngày ≤ mốc đã commit (`getMaterialCutoverDate`) là lịch sử, kể cả ngoài marker; giữ thêm điều kiện "trong marker của cặp". Nhãn tab Kiểm tra khớp đổi thành "Giai đoạn chuyển đổi từ Excel (tới mốc)". | `period-recon-check-service.test.ts`. |
| 14 | Đã sửa | `thanh-toan/page.tsx`: `locked` = ngày ≤ mốc (mọi loại) hoặc loại khoá kỳ trong kỳ đã ký, cùng điều kiện với `assertMaterialTypeWritable`; thêm `lockReason`. Client: cột Khoá hiện "Đã chuyển đổi" / "Kỳ đã ký", ẩn nút Sửa / Xoá; form hiện gợi ý "Ngày ghi sổ phải sau dd/mm/yyyy" (đỏ khi ngày đang chọn ≤ mốc). | `tsc`, `next build`. |
| 15 | Đã sửa | `freezeReconciliationSnapshot`: UPDATE bằng `bypassAudit(() => db.supplierReconciliation.updateMany(...))` trên client transaction (kiểm `count = 1`), rồi ghi **một dòng `audit_logs` trong cùng transaction** (`db.auditLog.create`, model bị extension bỏ qua). Ký tay truyền `auditUserId` (người ký; id không còn trong `users` thì null), marker import ghi `event: cutover_marker_signed`. Commit import rollback thì mất cả hai. | `reconciliation-freeze.test.ts`. |
| 16 | Đã sửa | Grep xác nhận không còn nơi import (chỉ shim chết tham chiếu lẫn nhau): xoá `components/ledger/{opening-balance-client,transaction-form-dialog,transaction-grid}.tsx`, `components/cong-no-vt/{debt-matrix,monthly-report,transaction-form-dialog,transaction-grid}.tsx`, `app/(app)/cong-no-vt/so-du-ban-dau/so-du-ban-dau-client.tsx`. Đã `git rm` (stage việc xoá, chưa commit) vì `scripts/verify-risk-manifest.ts` đọc `git ls-files -- app`. | `tsc`, `next build`. |

### Tài liệu đã cập nhật

- `reports/go-live-runbook.md`: mục 0.4 (điều kiện mới, kiểm Chủ thể cho mọi dòng còn lại), mục mới 0.5 (NCC giữ lịch sử), bước 4–6 (`$giu`, mục 11f / 14), bước 8 (gán Chủ thể lần đầu có điều kiện), P2.
- `docs/system-architecture.md`: luật gán Chủ thể lần đầu, khoá FOR UPDATE / FOR SHARE, guard mốc đọc một trường.
- `lib/import/README.md`: `reviewVersion` nguyên tử, lỗi DB tạm thời giữ `preview`, guard hoàn tác xét `updatedAt`.

### Lựa chọn cần người dùng biết

1. **#4a, công trình chưa có Chủ thể:** script dọn chỉ dừng khi công trình nhận dòng của ≥ 2 Chủ thể. Công trình chưa có Chủ thể mà mọi dòng cùng một Chủ thể được liệt kê để gán ở bước 8, đúng luồng runbook hiện có. App giờ từ chối gán lần đầu khác Chủ thể của dòng (#4b), nên không thể lệch. Nếu muốn chặn cứng mọi công trình chưa có Chủ thể ngay ở script dọn, phải chuyển bước gán Chủ thể lên trước bước 6.
2. **#6 áp cho cả phiếu:** NCC giữ cũng giữ phiếu ≤ 26/10. Nếu chỉ giữ sổ / số dư như đề bài, event còn hiệu lực của phiếu bị xoá sẽ luôn làm kiểm mồ côi dừng.
3. **#15:** marker import giờ có một dòng audit mỗi marker (khoảng 95 dòng), ghi trong transaction commit.
