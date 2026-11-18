---
phase: 3
title: "Gắn đối tác, danh mục và form hợp đồng"
status: completed
priority: P1
effort: "6h"
dependencies: [1]
---

# Phase 3: Gắn đối tác, danh mục và form hợp đồng

## Goal
- Tạo và sửa được hợp đồng: chọn loại đối tác, gắn đối tác có mã, nhập hai giá trị DT và TT.
- Danh mục là bảng thường, sửa qua hộp thoại (người dùng đã chốt). Mỗi dòng có link sang `/du-an/[id]/hop-dong/[contractId]`; màn chi tiết làm ở Phase 5.

## Files to Create / Modify
- Modify: `lib/du-an/schemas.ts`, `lib/du-an/contract-service.ts`
- Modify: `app/(app)/du-an/[id]/hop-dong/page.tsx`, `hop-dong-client.tsx`, `hop-dong-form.tsx`
- Create: `lib/du-an/contract-labels.ts`, chứa nhãn tiếng Việt dùng chung:
  - `docType`: Hợp đồng, Giấy phép, Bảo hiểm, Biên bản nghiệm thu, Khác;
  - `partyKind`;
  - `status`: Hiệu lực, Chờ ký, Hết hạn, Chấm dứt.
- Create: `lib/du-an/__tests__/contract-schema.test.ts`
- Create: `test/integration/du-an-hop-dong-binding.integration.test.ts`

## Tasks & Steps

**1. Zod (`lib/du-an/schemas.ts`)**
- `docType`: `contract|license|insurance|acceptance|other`. Import ghi được cả 5 loại.
- `status`: `active|pending|expired|terminated`. Import ghi `pending` khi cột trạng thái là "Chờ…".
- Thêm `partyKind`, `supplierId`, `contractorId`, `valueTtVnd ≥ 0`. `valueVnd`, `valueTtVnd`, `expiryDate`, `signedDate`, `note` nhận `null` để xóa giá trị.
- `superRefine` kiểm đúng như các CHECK ở Phase 1.

**2. Service (`lib/du-an/contract-service.ts`)**
- **Bọc kết quả bằng `runEntryAction`** (`lib/du-an/dt-hd-tt/entry-action-result.ts`). Payload cố định:
  - `createContract` trả `{ id }`;
  - `updateContract` và `softDeleteContract` trả `{}`.

  Không trả bản ghi Prisma, vì có `Decimal`.
- **Câu báo lỗi tiếng Việt:**
  - hợp đồng không tồn tại, đã xóa, hoặc thuộc dự án khác: cùng một câu "Không tìm thấy hợp đồng ở công trình này" (thay cho `"Forbidden"`);
  - CHECK 23514 và FK 23503: mỗi lỗi một câu tiếng Việt.
- **Chống IDOR khi sửa và xóa.**
  - `projectId` lấy từ `existing.projectId` trong DB, không lấy từ input.
  - Guard edit chạy theo `projectId` đó, rồi mới so với `projectId` của input.
- **Ghi đủ trường.** Hộp thoại gửi đủ form, và service ghi đủ trường:
  - service tự suy ra khóa từ `partyKind`: khóa nào không thuộc loại thì ghi `null` tường minh;
  - `docType ≠ contract` thì cả bộ ba đối tác về `null`;
  - tự gán `updatedAt: new Date()`.
- **Đối tác hợp lệ.** Gắn mới hoặc đổi đối tác thì đối tác phải còn hiệu lực. Hợp đồng đang giữ một đối tác đã bị xóa mềm thì được phép giữ nguyên.
- **`partyName`.** Để trống thì tự điền tên đối tác; với CĐT dùng `Project.ownerInvestor`.
- **Danh sách chọn đối tác.**
  - NCC: dùng lại `listSupplierOptions(projectId)` (`lib/du-an/dt-hd-tt/invoice-service.ts`).
  - Đội: thêm `listContractorOptions(projectId)` theo cùng khuôn, nhưng guard là `create` vì danh sách này chỉ phục vụ form.
  - Không chia nhóm "đã có giao dịch".
- **`revalidatePath`** cả danh mục lẫn `/du-an/${projectId}/hop-dong/${id}`.

**3. Trang danh mục (`page.tsx`)**
- Giữ nguyên mẫu guard hiện có: `requireModuleAccess` rồi `canAccessEntitlement`.
- Chỉ nạp danh sách đối tác (`listSupplierOptions`, `listContractorOptions`, `ownerInvestor`) khi `canCreate` hoặc `canEdit`.

**4. Danh mục (`hop-dong-client.tsx`)**
- Bỏ `DataGrid`, dùng `components/ui/table.tsx`. Sửa và xóa qua `CrudDialog`; xóa có xác nhận. Mọi lời gọi action kiểm `result.ok`.
- Các cột:
  - Tên tài liệu (link sang chi tiết);
  - Loại;
  - Đối tác: "NCC · tên", "Đội · tên" hoặc "CĐT · tên". Chưa gắn mã thì hiện `partyName` màu xám kèm nhãn "chưa gắn danh mục";
  - Giá trị theo DT, Giá trị theo TT;
  - Ngày ký, Hết hạn (giữ huy hiệu cảnh báo), Trạng thái.
- Danh mục trống: "Chưa có hợp đồng nào. Bấm «Thêm hợp đồng» để tạo; bản scan có thể đính kèm sau."
- Có hợp đồng loại "Hợp đồng" chưa gắn đối tác: băng xám "N hợp đồng chưa gắn đối tác nên chưa có số liệu".

**5. Form (`hop-dong-form.tsx`)**
- Định nghĩa và export `ContractFormProps`:
  - `mode: "create" | "edit"`;
  - `initialValues`;
  - `supplierOptions`, `contractorOptions`, `ownerInvestor`;
  - `onSaved`.
- Export `toContractFormValues(row)` để chuyển dòng đã serialize (Decimal dạng chuỗi) thành giá trị form. Danh mục và màn chi tiết ở Phase 5 dùng chung hàm này.
- Các ô: Tên*, Loại*, Trạng thái (4 giá trị).
- Khi Loại = Hợp đồng, hiện ô "Đối tác của hợp đồng" với bốn lựa chọn:
  - **NCC vật tư, Đội thi công:** picker theo `components/master-data/quick-create/`, như `components/vat-tu-ncc/delivery-form.tsx` đang làm (`useLocalQuickCreate`, `useQuickCreatePick`, `useOptionsWithCreated`). Phần tử quick-create render ngoài `<form>`. Mục "+ Tạo mới…" chỉ hiện với admin.
  - **Chủ đầu tư:** chỉ hiện "CĐT: {ownerInvestor}". Dự án chưa ghi tên CĐT thì hiện câu nhắc sửa ở thông tin dự án.
  - **Khác:** ô chữ `partyName`.
- Hợp đồng kinh tế có hai ô "Giá trị theo DT (VND)" và "Giá trị theo TT (VND)". Loại khác có một ô "Giá trị (VND)", lưu vào `valueVnd`. Ô để trống gửi `null`.
- Thêm ô Ghi chú. Đổi loại đối tác thì xóa khóa cũ trên form.

**6. Dashboard.** Dashboard dự án đọc `project_contracts` để cảnh báo hết hạn (chỉ select các cột cũ). Kiểm lại dashboard sau khi đổi.

## Verification
- **Trước các cổng kiểm:** chạy `git add -N` cho các tệp mới. `risk:verify` và các test guard chỉ quét tệp đã được git track; lệnh này không tạo commit.
- **Unit `contract-schema.test.ts`:**
  - NCC thiếu `supplierId` bị từ chối;
  - giấy phép có `partyKind` bị từ chối;
  - đủ 5 `docType` và 4 `status` đều hợp lệ.
- **Integration `du-an-hop-dong-binding.integration.test.ts`:**
  - đổi lần lượt NCC → Đội → Khác → CĐT: mỗi bước qua được CHECK, khóa cũ về `null`;
  - xóa `valueTtVnd` và `expiryDate` về `null` được;
  - gắn NCC đã bị xóa mềm thì bị từ chối; giữ NCC đã bị xóa sau khi gắn thì được;
  - đổi `docType` sang `license` thì các trường đối tác bị xóa;
  - sửa một hợp đồng `pending` (dòng kiểu import) để gắn đối tác thì được, và `status` giữ `pending`;
  - **IDOR:** người có quyền edit ở P1 gọi update/delete với id hợp đồng thuộc P2 thì nhận `{ ok: false }` kèm đúng câu "Không tìm thấy…", và dòng P2 không đổi;
  - người chỉ có quyền read gọi create/edit thì nhận `{ ok: false }` kèm câu tiếng Việt;
  - `createContract` trả `{ ok: true, id }`, không lẫn `Decimal`.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`.
- **Kiểm trên `localhost:3001`:**
  - tạo hợp đồng NCC cho dự án 4 bằng picker;
  - tạo nhanh một đội (tài khoản admin) rồi đổi hợp đồng sang Đội;
  - mở dòng hợp đồng `pending` đã chèn ở Phase 1 và gắn đối tác;
  - dashboard vẫn cảnh báo hết hạn;
  - các tab Nghiệm thu, Dòng tiền 3 bên, DT-HĐ-TT vẫn mở được.
