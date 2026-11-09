# Báo cáo thực hiện Phase 3: Cửa vào theo công trình, master data Chủ thể

Ngày: 2026-11-06. Trạng thái: **code + unit đã xong**. **Integration và e2e đã viết, đã typecheck nhưng chưa chạy**, vì Docker đang tắt (`docker ps` không kết nối được Docker Desktop). Chưa commit, chưa push, chưa stage tệp nào.

## 1. Kết quả kiểm tra (lệnh chạy thật)

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` (baseline, trước khi sửa) | 0 lỗi |
| `npx tsc --noEmit` (sau khi sửa) | **0 lỗi ở tệp thuộc phase 3**. Có 4 lỗi TS2554 ở `scripts/smoke-import-apply.ts:115` và `test/integration/import-engine.integration.test.ts:72,94,102`. Đây là nơi gọi `lib/import/**`, do agent khác đang sửa song song; tôi không đụng các tệp này. |
| `npx vitest run --project unit lib/master-data lib/vat-tu-ncc test/unit/module-release-entrypoints.test.ts` | 10 file, 178 test pass |
| `npx vitest run --project unit` (toàn bộ) | 105 file, 1087 test pass |
| `npx eslint` trên 32 tệp đã đổi hoặc tạo | exit 0, không có cảnh báo |
| Kiểm guard `requireReleasedModuleRequest` cho server action mới | Chạy bằng script cùng regex với `module-release-entrypoints.test.ts`, vì test đó chỉ quét tệp đã được git track. Mọi `export async function` của `project-overview-service.ts`, `delivery-actions.ts` và `project-service.ts` đều có guard. |
| Integration `test/integration/vat-tu-ncc-cong-trinh.integration.test.ts` | **BỎ QUA.** Docker tắt; không chạy migrate hay deploy trên DB nào. |
| E2E `e2e/vat-tu-ncc-cong-trinh.spec.ts` | **BỎ QUA**, cùng lý do. |

## 2. Tệp thay đổi

**Tạo mới**
- `lib/vat-tu-ncc/project-overview-service.ts` ("use server", guard `vat-tu-ncc`), gồm ba hàm:
  - `listProjectsWithMaterial()`;
  - `listPairsOfProject(projectId, { includeDebt })`: cột nợ lấy từ `queryDetailReport` và cộng theo NCC. Chỉ trả khi `canAccess(user, "cong-no-vt", read)`, tức có quyền và module đã phát hành. Quyền luôn kiểm ở server; `includeDebt` chỉ là yêu cầu của trang;
  - `listSupplierProjects(supplierId)`.
  - Cặp được coi là "có hoạt động" khi có phiếu, sổ vật tư, số dư ban đầu vật tư hoặc kỳ đối chiếu.
- `lib/vat-tu-ncc/delivery-actions.ts` ("use server"): `createDeliveryAction`, `updateDeliveryAction`, `deleteDeliveryAction` trả `{ ok } | { ok: false, message }`. Xem lệch #2.
- `components/vat-tu-ncc/pair-project-picker.tsx` (client), gồm hai phần:
  - `SupplierPairNav`: thanh ngữ cảnh "NCC × Công trình" có ô chọn công trình, cùng các tab giữ `?projectId=` bằng `useSearchParams`. Tab đang mở được tô sáng. Đổi công trình ở trang chi tiết kỳ thì về danh sách kỳ.
  - `PairProjectPicker`: bộ chọn khi thiếu `projectId`, có ô "Công trình khác" để mở cặp mới.
- `components/vat-tu-ncc/project-id-param.ts`: `parseProjectIdParam` thuần, dùng chung cho server và client.
- `components/vat-tu-ncc/material-project-table.tsx` và `project-pair-table.tsx`: bảng client dùng `components/sortable-table`.
- `app/(app)/vat-tu-ncc/cong-trinh/page.tsx` và `app/(app)/vat-tu-ncc/cong-trinh/[projectId]/page.tsx`.
- Test:
  - `test/integration/vat-tu-ncc-cong-trinh.integration.test.ts`;
  - `e2e/vat-tu-ncc-cong-trinh.spec.ts`;
  - `lib/vat-tu-ncc/__tests__/project-overview-service.test.ts`;
  - `lib/vat-tu-ncc/__tests__/delivery-actions.test.ts`.

**Sửa**
- `app/(app)/vat-tu-ncc/page.tsx`: thêm nút "Theo công trình".
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx`: thay tab tĩnh bằng `SupplierPairNav`, bọc trong `<Suspense>` có fallback tĩnh. Điều kiện hiện tab Thanh toán và Kiểm tra khớp giữ nguyên.
- `components/vat-tu-ncc/pair-project-required.tsx`: chuyển sang dùng `listSupplierProjects` và `PairProjectPicker`, vẫn re-export `parseProjectIdParam`. Thêm `requireActivePairProject` (404 khi công trình không tồn tại hoặc đã xoá).
- `[supplierId]/{chot-ky,doi-chieu,kiem-tra-khop}/page.tsx`: 404 khi `projectId` trỏ tới công trình không tồn tại.
- `[supplierId]/ngay/page.tsx`: truyền `lockedProjectId`; 404 khi công trình không tồn tại.
- `[supplierId]/thang/page.tsx` và `thang-grid.tsx`: hiện phạm vi lọc (một công trình hay mọi công trình); 404 khi công trình không tồn tại.
- `[supplierId]/doi-chieu/[reconciliationId]/page.tsx`:
  - thiếu `projectId` thì hiện bộ chọn;
  - **404 trừ khi `recon.supplierId === supplierId` và `recon.projectId === projectId`** (kiểm trước khi tính bảng);
  - link sắp xếp giữ `?projectId=`;
  - marker chuyển đổi hiện nhãn "Kỳ chuyển đổi (khóa)" kèm ghi chú và không có nút ký. Trang này vốn không có nút gỡ ký; danh sách kỳ đã ẩn gỡ ký cho marker từ phase 2.
- `components/vat-tu-ncc/delivery-grid.tsx`:
  - tạo, sửa (form và sửa ô) và xoá đều qua action trả kết quả, có `try/catch` và `toast.error` hiện nguyên văn thông điệp khoá kỳ hoặc `cutover_locked`;
  - xoá nhiều phiếu thì báo riêng các phiếu lỗi;
  - thêm prop `lockedProjectId`;
  - cột "Dự án" đổi thành "Công trình".
- `components/vat-tu-ncc/delivery-form.tsx`: prop `lockedProjectId` khoá ô công trình.
- `lib/master-data/schemas.ts`: thêm `projectEntityIdSchema`.
- `lib/master-data/project-service.ts`:
  - `patchProject` nhận `entityId`;
  - `assertProjectEntityChangeAllowed`: gán lần đầu (từ NULL) hoặc giữ nguyên thì luôn được. Đổi sang Chủ thể khác hay bỏ gán bị từ chối khi công trình còn sổ vật tư, phiếu, số dư ban đầu vật tư hoặc kỳ đối chiếu (chưa xoá). Chủ thể đích phải tồn tại;
  - thêm `patchProjectEntity` trả kết quả.
- `app/(app)/master-data/projects/{page,projects-client}.tsx`: cột "Chủ thể" sửa nhanh bằng select, chọn "--" là bỏ gán.
- `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx`, cho dòng `vat_tu`:
  - chọn công trình trước từ mọi công trình; Chủ thể tự điền theo `Project.entityId` và bị khoá;
  - lưu bị chặn và hiện gợi ý đỏ khi thiếu công trình hoặc công trình chưa gán Chủ thể;
  - các loại khác giữ luồng cascade cũ, thứ tự select không đổi nên e2e `payment-round` vẫn khớp.
- `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx`: **thêm `entityId: true` vào select công trình**. Xem lệch #1.
- `app/(app)/du-an/[id]/cong-no/cong-no-client.tsx`: giữ nguồn `project_transactions`, chỉ thêm link "Công nợ vật tư theo sổ cái →" tới `/vat-tu-ncc/cong-trinh/[id]` (lấy id bằng `useParams`, không sửa `page.tsx`).
- `lib/master-data/__tests__/patch-actions.test.ts`: thêm 10 ca `entityId`.

## 3. Lệch so với spec (kèm lý do)

1. **Sửa ngoài danh sách sở hữu:** một trường trong `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx` (`entityId: true`). Lý do: yêu cầu "Chủ thể tự điền theo công trình" cần `Project.entityId` ở client, mà trang chỉ truyền `{id, code, name}`. Không agent song song nào sửa `thanh-toan`. Nếu muốn hoàn tác, client vẫn chạy, chỉ không tự điền được Chủ thể (server vẫn thay Chủ thể theo công trình).
2. **Thêm `lib/vat-tu-ncc/delivery-actions.ts`** (phần bổ sung, giữ nguyên chữ ký `delivery-service.ts` của phase 2). Lý do: ở bản production, React Flight chỉ gửi `digest` của lỗi ném ra từ server action, nên thông điệp bị ẩn. Đã kiểm tại `node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js:1874`: hàm `emitErrorChunk` chỉ ghi `{digest}`. Nếu không có lớp này, toast "kỳ đã ký" hay `cutover_locked` chỉ đúng ở chế độ dev. Lỗi nghiệp vụ (`MaterialScopeError`, `ModuleRequestError`, `Error` thuần, zod) được trả nguyên văn; lỗi DB hay hạ tầng được ghi log và trả thông điệp chung. Cùng lý do, có thêm `patchProjectEntity` cho lý do từ chối đổi Chủ thể.
3. Trang chi tiết kỳ khi thiếu `projectId`: bộ chọn dẫn về **danh sách kỳ** của công trình được chọn, không dẫn lại vào chính kỳ đó, vì kỳ chỉ thuộc một công trình nên chọn công trình khác chắc chắn 404.
4. Thêm 404 khi `?projectId=` trỏ tới công trình không tồn tại ở các tab `ngay`, `thang`, `chot-ky`, `doi-chieu`, `kiem-tra-khop`, giống trang `thanh-toan` của phase 2. Nếu không, form sẽ bị khoá vào một công trình lỗi.
5. Trang công trình có thêm ô "Nhập phiếu cho NCC khác"; bộ chọn công trình có thêm ô "Công trình khác". Lý do: nếu thiếu, luồng bắt đầu từ công trình không mở được cặp mới, vì danh sách chỉ liệt kê cặp đã có hoạt động.
6. Cột "Chủ thể" ở master data không sắp xếp và không lọc được, vì `PROJECT_SPEC` nằm ở `lib/master-data/projects/table-spec.ts`, ngoài phạm vi sở hữu.
7. `sign-button.tsx` không đổi. Trang chi tiết ẩn nút ký khi là marker; marker vốn đã ký từ lúc import.
8. Có thêm hai file unit test ngoài danh sách phase (`project-overview-service`, `delivery-actions`), để có kiểm chứng chạy được thật trong lúc integration chưa chạy.

## 4. Vấn đề còn mở

- **Integration và e2e chưa chạy.** Khi có Docker:
  1. `npx prisma migrate deploy` trên DB `_test`;
  2. `npx vitest run --project integration test/integration/vat-tu-ncc-cong-trinh.integration.test.ts`;
  3. `npx playwright test e2e/vat-tu-ncc-cong-trinh.spec.ts`.
- Các toast khác trong module vẫn dựa vào lỗi ném ra (chốt kỳ, ký, tạo hoặc xoá kỳ, thanh toán; cũng như toàn repo), nên ở production sẽ chỉ hiện thông điệp chung. Phase 3 chỉ xử lý lưới phiếu và Chủ thể theo spec. Đề xuất một việc riêng để đổi sang mẫu trả kết quả.
- Khoá đổi Chủ thể là kiểm-rồi-ghi, không khoá dòng `projects`; đường ghi vật tư (`resolveMaterialEntityId`) cũng không khoá công trình. Vẫn còn một khe đua rất nhỏ: admin đổi Chủ thể đúng lúc một ghi vật tư đầu tiên đang chạy trên công trình chưa có dữ liệu. Muốn đóng hẳn thì cần `FOR SHARE` trong `pair-scope.ts`, tệp của phase 2.
- Layout NCC thêm hai truy vấn mỗi lần điều hướng (công trình của NCC và mọi công trình).
- Lỗi `tsc` ở nơi gọi import-engine thuộc agent `lib/import`.
