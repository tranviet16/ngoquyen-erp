---
phase: 5
title: "Màn chi tiết và bản scan"
status: completed
priority: P1
effort: "7h"
dependencies: [4]
---

# Phase 5: Màn chi tiết và bản scan

## Goal
Màn chi tiết `/du-an/[id]/hop-dong/[contractId]` có đủ năm phần:
1. thông tin và scan;
2. giá trị;
3. ba danh sách;
4. công nợ;
5. phần chưa thực hiện.

Bản scan tải lên, xem, tải về, xóa mềm được, và admin xóa vĩnh viễn được. Mọi thao tác đúng quyền, có audit, qua các cổng P0, và chạy được trong container thật.

## Files to Create / Modify
- **Màn chi tiết**, trong `app/(app)/du-an/[id]/hop-dong/[contractId]/`:
  - `page.tsx` (RSC);
  - `contract-detail-header.tsx`, `contract-value-section.tsx`, `contract-source-lists.tsx`, `contract-debt-section.tsx`, `contract-unfulfilled-section.tsx`;
  - `contract-scan-section.tsx` (client);
  - `scan-actions.ts` ("use server").
- **Service scan:** tạo `lib/du-an/contract-scan-service.ts`, không có "use server".
- **Route tải:** tạo `app/api/du-an/[id]/hop-dong/[contractId]/scan/[scanId]/route.ts` (GET).
- **Cấu hình:** sửa `next.config.ts` (`proxyClientMaxBodySize`).
- **Cổng kiểm:** sửa `test/risk-manifest.ts`, `test/risk-manifest-server-actions.ts`, `test/unit/module-release-entrypoints.test.ts`.
- **Test:** tạo `test/integration/du-an-contract-scan.integration.test.ts`.

## Tasks & Steps

**1. `page.tsx`**
Chép mẫu guard của `hop-dong/page.tsx`. Đọc phần dynamic segment trong `node_modules/next/dist/docs/` trước khi viết.
1. `params: Promise<{ id: string; contractId: string }>`. Parse cả hai id; `contractId` không phải số nguyên thì `notFound()`.
2. `const { userId } = await requireModuleAccess("du-an", { minLevel: "read", scope: { kind: "project", projectId } })`. Lời gọi này phải đứng trước mọi `await` nạp dữ liệu, vì `PROJECT_PAGE_FILES` kiểm nguyên văn.
3. `canAccessEntitlement` để biết `canEdit`. Kiểm thêm vai trò admin, dùng để hiện nút xóa vĩnh viễn.
4. `loadContractDetail(projectId, contractId, userId)`; kết quả `null` thì `notFound()`.
5. Có `canEdit` thì nạp danh sách đối tác cho `ContractForm` (mode `edit`, `toContractFormValues`).

**2. Năm phần của màn**
Không làm tooltip, nút tắt hay danh sách thu gọn.
- **Đầu trang.**
  - Link "← Danh mục hợp đồng"; tên hợp đồng, huy hiệu loại, trạng thái và hạn.
  - Nút Sửa/Xóa nếu có quyền edit. Xóa xong thì về danh mục.
- **Phần 1, Thông tin.**
  - Đối tác, ngày ký, hết hạn, nơi lưu bản giấy, ghi chú.
  - Dòng "Nhập từ file (lần import #N)" nếu có `importRunId`.
  - Ngay dưới là phần Bản scan.
- **Phần 2, Giá trị.**
  - Hai thẻ DT và TT; chưa nhập thì ghi "Chưa nhập".
  - Hợp đồng CĐT hiện thêm "Giá trị HĐ ghi ở thông tin dự án". Lệch với tổng giá trị DT của các hợp đồng CĐT thì có băng vàng.
  - Nhóm gộp ≥ 2 hợp đồng: băng vàng "Công trình có N hợp đồng với {đối tác}: [link]. Số liệu bên dưới gộp chung N hợp đồng và so với tổng giá trị: DT x, TT y."
- **Phần 3, Ba danh sách.**
  - Bảng thường, có dòng tổng.
  - Mỗi danh sách ghi nguồn, kèm link "Sửa ở sổ gốc →":
    - NCC: `/cong-no-vt/nhap-lieu`;
    - đội: `/cong-no-nc/nhap-lieu`;
    - CĐT: tab Nghiệm thu, tab Dòng tiền 3 bên, trang `hoa-don-cdt`.
  - Danh sách B có câu "N dòng chưa ghi số HĐ".
  - Danh sách rỗng có câu riêng, tổng ghi 0.
  - `ledgerDetailHidden = true` thì không hiện bảng, chỉ hiện các tổng kèm câu "Cần quyền xem Công nợ vật tư (hoặc nhân công) để xem từng dòng."
- **Phần 4, Công nợ.**
  - NCC/đội: đầu kỳ, còn phải trả theo TT, theo HĐ, hóa đơn còn phải lấy.
  - CĐT: ba số tương ứng.
- **Phần 5, Phần chưa thực hiện.**
  - Bảng 3 × 2. Ô thiếu ghi "Chưa nhập giá trị (k/N hợp đồng có giá trị)". Số âm ghi "Vượt x".
  - Dòng chuyển tiền ghi rõ "theo số HĐ của các lần thanh toán".
  - Có ghi chú đầu kỳ khi `openingNote` bật.
- **Các băng:**
  - từ 2 Chủ thể trở lên;
  - đối tác đã bị xóa khỏi danh mục;
  - "N phiếu vật tư ngày (x đ, k phiếu chưa có giá) chưa chốt vào sổ công nợ nên chưa nằm trong Lấy hàng".
- Hợp đồng không phải hợp đồng kinh tế, hoặc loại "Hợp đồng" chưa gắn đối tác: chỉ có Phần 1. Loại sau có thêm câu "Gắn đối tác để xem số liệu".

**3. `scan-actions.ts`**
Ba hàm export: `uploadContractScan(formData)`, `deleteContractScan(scanId)`, `purgeContractScan(scanId)`. Mỗi hàm:
- chỉ nhận `contractId` hoặc `scanId` từ client, và lấy `projectId` duy nhất từ DB qua hợp đồng;
- gọi đúng một lần `await requireReleasedModuleRequest(` với `projectId` đó, quyền `edit`. Test đếm số lời gọi bằng số hàm;
- không tìm thấy, đã xóa, hoặc khác dự án thì trả cùng một câu "Không tìm thấy hợp đồng ở công trình này";
- `purgeContractScan` kiểm thêm vai trò admin (cách kiểm giống các action tạo nhanh của PR #21). Hàm xóa cứng dòng, rồi `store.deleteFile`, rồi ghi audit `purge`;
- trả `ActionResult` qua `runEntryAction`: upload trả `{ id }`, còn lại trả `{}`.

**4. `contract-scan-service.ts`**
- **Kiểm tệp:** cỡ ≤ 25MB, MIME trong whitelist, rồi `validateMagicBytes` (`lib/task/file-signature.ts`).
- **Ghi tệp:**
  - đường lưu `contract-scans/{projectId}/{contractId}/{uuid}-{tên}`. Tên tệp qua `safeFilename` rồi **cắt theo byte UTF-8** (≤ 150 byte);
  - ghi tệp trước, tạo dòng sau; tạo dòng lỗi thì xóa tệp vừa ghi.
- **Bọc lỗi lưu trữ.** Mọi lời gọi `store.*` nằm trong `try/catch`:
  - log chi tiết phía server;
  - ném `ContractScanStorageError` (lớp con của `Error`, nên `runAction` không trả nguyên văn) với câu "Không lưu được tệp, liên hệ admin".
  - Kết quả là đường dẫn trên máy chủ không bao giờ tới client.
- **Xóa mềm:** đặt `deletedAt`, tệp giữ trên đĩa.
- **Câu báo:**
  - "«x.docx»: chỉ nhận PDF, JPG, PNG";
  - "«y.pdf» nặng 31,2 MB, tối đa 25 MB";
  - "«z.pdf»: nội dung không đúng định dạng".

**5. Giới hạn body**
- `proxy.ts` chặn mọi đường dẫn, và Next 16 chỉ đệm body tối đa 10MB khi có proxy (`proxyClientMaxBodySize`).
- Đọc `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md` rồi đặt `"26mb"` đúng khóa.
- Giữ `serverActions.bodySizeLimit: "25mb"`. Chỉ nâng lên `"26mb"` nếu thử thực tế cho thấy tệp đúng 25MB bị chặn vì phần bao multipart.
- Client vẫn chặn tệp lớn hơn 25MB.

**6. Route GET**
Thứ tự xử lý:
1. Parse các id; sai thì trả 400.
2. Guard `read` theo `id` trên URL. Lỗi module trả 401, 403 hoặc 503 như route của task.
3. Tra `{ id: scanId, contractId, deletedAt: null, contract: { projectId: id, deletedAt: null } }`; không có thì 404.
4. Gọi `store.exists()`; thiếu tệp thì 404, kèm log.
5. `writeAuditLog({ tableName: "project_contract_attachments", recordId, action: "download" | "view" })`.
6. Stream tệp, header theo MIME:
   - **chung:** `Content-Type` lấy từ whitelist, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, tên tệp theo RFC 5987;
   - **mặc định:** `attachment`;
   - **`?xem=1` với ảnh:** `inline` kèm `Content-Security-Policy: sandbox`;
   - **`?xem=1` với PDF:** `inline`, **không** dùng sandbox (trình xem PDF của Chromium sẽ trắng trang), thay bằng `Content-Security-Policy: default-src 'none'; object-src 'self'; frame-ancestors 'none'`.

**7. Phần scan trên UI**
- Bảng tệp: tên, loại, cỡ, người tải, ngày, cùng các nút:
  - "Xem" (tab mới, `?xem=1`);
  - "Tải về";
  - "Xóa" (quyền edit, có xác nhận);
  - "Xóa vĩnh viễn" (chỉ admin, có xác nhận ghi rõ không khôi phục được).
- Tải lên bằng `<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png">`, gửi tuần tự từng tệp; mỗi tệp báo thành công hoặc lỗi.
- Chưa có tệp: "Chưa có bản scan. Bản scan không bắt buộc." Người chỉ có quyền read không thấy nút tải lên.

**8. Cổng kiểm**
- `test/risk-manifest.ts`: **viết mới** bản ghi `api-du-an-contract-scan`, không chép từ mẫu `api-task-attachment` (mẫu khai `operation: "DELETE"`):
  - `operation: "GET"`, tier P0, `dataClassification: "confidential"`;
  - `requiredTests` đủ 5 loại;
  - authorization "du-an project reader download within resource scope, audited".
- `test/risk-manifest-server-actions.ts`: thêm bản ghi P0 cho `scan-actions.ts`.
- `module-release-entrypoints.test.ts`:
  - `ACTION_MODULES`: thêm `scan-actions.ts`;
  - `API_MODULES`: thêm route;
  - `PROJECT_PAGE_FILES`: thêm trang chi tiết.
- Chạy `git add -N` cho các tệp mới trước khi chạy cổng kiểm.

## Verification
- `pnpm risk:verify`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`.
- Integration `du-an-contract-scan.integration.test.ts`:
  - **S1 allow:**
    - người có quyền edit tải lên PDF, JPG, PNG;
    - người có quyền read tải về được (200, header đúng theo MIME);
    - PDF `?xem=1` không có `sandbox`, ảnh `?xem=1` có `sandbox`.
  - **S2 deny:**
    - người có quyền read gọi upload/delete thì nhận `{ ok: false }`;
    - người không phải admin gọi purge thì nhận `{ ok: false }`;
    - `.exe` đổi đuôi thành `.pdf` bị chặn;
    - tệp 25MB + 1 byte bị chặn, kèm câu tiếng Việt;
    - giả lập `store.putFile` ném EACCES: `message` trả về không chứa `/` hay `\`.
  - **S3 cross-scope:**
    - người không có quyền vào dự án gọi route thì nhận 403;
    - `scanId` của hợp đồng khác, hoặc `contractId` của dự án khác, nhận 404.
  - **S3b IDOR action:** người có quyền edit ở P1 gọi upload với `contractId` của P2, hoặc delete với `scanId` của P2: nhận `{ ok: false }` với cùng câu "Không tìm thấy…", không tạo dòng hay tệp nào, và scan P2 vẫn có `deletedAt = null`.
  - **S4 audit:** upload, delete, purge và GET (download/view) đều sinh đúng 1 dòng `audit_logs` có `userId`.
  - **S5 recovery:**
    - hợp đồng đã xóa mềm thì route trả 404;
    - scan đã xóa mềm thì route trả 404 nhưng tệp vẫn còn;
    - dòng còn mà tệp mất thì route trả 404;
    - tạo dòng DB lỗi thì tệp đã ghi bị xóa;
    - sau khi admin purge, guard rollback ở Phase 1 không còn chặn vì scan.
- **Trên 3001** (container đã có volume từ Phase 1):
  - tải 3 tệp, trong đó **một PDF khoảng 24MB, gửi qua trình duyệt**;
  - `.docx` và tệp 30MB bị từ chối;
  - "Xem" PDF hiện được trên Chrome và Edge;
  - tài khoản read không thấy nút tải lên nhưng vẫn "Xem" được;
  - dán URL tải của dự án khác thì nhận 404 hoặc 403;
  - hợp đồng NCC ở dự án 4 hiện đủ năm phần;
  - tài khoản có `du-an` nhưng không có `cong-no-vt` chỉ thấy các tổng.
