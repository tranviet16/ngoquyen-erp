---
phase: 4
title: "Nguồn số, sổ hóa đơn CĐT, tie-out"
status: completed
priority: P1
effort: "8h"
dependencies: [1, 2, 3]
---

# Phase 4: Nguồn số, sổ hóa đơn CĐT, tie-out

## Goal
Nối hàm thuần ở Phase 2 vào dữ liệu thật. Phase này giao bốn thứ:
- loader chi tiết hợp đồng, tôn trọng ranh giới quyền giữa module Dự án và module Công nợ;
- cột "Công nợ còn lại (TT)" trong danh mục;
- sổ hóa đơn xuất CĐT nhập được ở trang riêng;
- bằng chứng rằng tổng khớp `queryDetailReport` trên DB test và trên toàn bộ bản sao.

## Files to Create / Modify
- Create: `lib/du-an/contract-detail/ledger-source.ts`. **Không** có "use server", **không** dùng `server-only` (gói này chưa cài, và `tsx` cùng vitest không nạp được). Đầu tệp ghi comment theo quy ước của `lib/vat-tu-ncc/supplier-balance.ts`: cố ý không phải server action.
- Create: `lib/du-an/contract-detail/cdt-source.ts` (cùng quy ước).
- Create: `lib/du-an/contract-detail/contract-detail-loader.ts` (cùng quy ước), gồm `loadContractDetail(projectId, contractId, userId)` và `loadContractListFigures(projectId)`.
- Create: `lib/du-an/cdt-invoice-service.ts` ("use server"): `listCdtInvoices`, `createCdtInvoice`, `updateCdtInvoice`, `softDeleteCdtInvoice`.
- Modify: `lib/du-an/schemas.ts`: thêm `cdtInvoiceSchema`. Số và ký hiệu hóa đơn được trim; giá trị khác 0 và được phép âm.
- Create: `app/(app)/du-an/[id]/hop-dong/hoa-don-cdt/page.tsx`, `hoa-don-cdt-client.tsx`.
- Modify: `app/(app)/du-an/[id]/hop-dong/page.tsx`, `hop-dong-client.tsx`: thêm cột công nợ và nút "Sổ hóa đơn xuất CĐT".
- Modify: `lib/du-an/__tests__/project-service-acl-contract.test.ts`: thêm `cdt-invoice-service.ts` vào `serviceFiles`.
- Modify: `test/unit/module-release-entrypoints.test.ts`:
  - thêm trang `hoa-don-cdt` vào `PROJECT_PAGE_FILES`;
  - thêm `ledger-source.ts`, `cdt-source.ts`, `contract-detail-loader.ts` vào nhóm "query helper không được có 'use server'".
- Create: `test/integration/du-an-hop-dong-tie-out.integration.test.ts`.
- Create: `scripts/check-contract-detail-tie-out.ts` (chỉ đọc).

## Tasks & Steps

**1. `ledger-source.ts`**
- Dùng một `$queryRaw` trên `ledger_transactions` (không đặt alias, vì các fragment phân loại sinh tên cột không qualify):
  - `LEFT JOIN items ON items.id = ledger_transactions."itemId"`. Phải là LEFT JOIN vì có 566 dòng `itemId` NULL, gồm phần lớn dòng `thanh_toan`;
  - qualify `ledger_transactions."deletedAt" IS NULL`, `ledger_transactions."projectId"` và các cột khác bị trùng tên;
  - điều kiện `ledgerType = L AND partyId = X AND projectId = P`. Không cắt ngày, cộng mọi Chủ thể;
  - 4 cột tính bằng `increaseSql` / `decreaseSql`.
- Lấy thêm số dư đầu kỳ (`ledger_opening_balances`).
- **Phiếu vật tư ngày chưa chốt** (chỉ NCC): đếm và cộng `totalAmount` của các dòng `supplier_delivery_daily` có `supplierId = X`, `projectId = P`, chưa xóa, và chưa có `ledger_transactions` nào chưa xóa mang `deliveryId` của phiếu đó. Trả `{ count, knownAmount, unpricedCount }`.

**2. `cdt-source.ts`**
- Đọc:
  - nghiệm thu chưa xóa có `amountCdtVnd ≠ 0`;
  - `project_cdt_invoices` chưa xóa;
  - `project_3way_cashflows` chưa xóa, chiều `cdt_to_cty` hoặc `cty_to_cdt`;
  - `Project.contractValue`.
- Không đọc chiều `cty_to_doi`, kể cả cho hợp đồng đội: số đó đã nằm trong `thanh_toan` của sổ nhân công.

**3. `contract-detail-loader.ts`**
- **Guard và tra hợp đồng.**
  - Gọi `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: project })` làm lớp phòng thủ thứ hai; trang đã guard trước.
  - Tra hợp đồng với `{ id, projectId, deletedAt: null }`; không có thì trả `null`.
- **Rẽ nhánh theo `partyKind`:** `null`, `ncc`, `doi_thi_cong`, `cdt`, rồi `assertNever`.
- **Quyền xem sổ công nợ** (người dùng đã chốt: hiện tổng, ẩn chi tiết):
  - kiểm `canAccessEntitlement(userId, "cong-no-vt" | "cong-no-nc", { minLevel: "read" })` theo loại đối tác;
  - **không có quyền:** vẫn trả các tổng (công nợ, phần chưa thực hiện, ΣA, ΣB, ΣC) nhưng `lists = null` và `ledgerDetailHidden = true`. Không trả dòng nào sang client;
  - **CĐT:** chỉ cần quyền `du-an`.
- **Không đối chiếu lúc chạy.** Tổng hiển thị = Σ các dòng, tính bằng hàm thuần. Độ khớp với báo cáo được chứng minh bằng integration test và script.
- **Dữ liệu cho các băng:**
  - cặp có từ 2 Chủ thể trở lên, kèm Σ từng Chủ thể;
  - đối tác đã bị xóa khỏi danh mục;
  - nhóm gộp N hợp đồng;
  - phiếu vật tư ngày chưa chốt;
  - `contractValue` của dự án lệch với hợp đồng CĐT.
- **`loadContractListFigures(projectId)`:**
  - có guard read;
  - gọi `queryDetailReport` cho material và cho labor, mỗi lần gồm 1 raw query cộng 3 `findMany` lấy tên;
  - cộng các tổng CĐT bằng SQL `SUM`;
  - kết quả đi qua `buildListFigure`.

**4. Cột "Công nợ còn lại (TT)" trong danh mục**
- Đây là số tổng, nên hiện cho mọi người có quyền đọc `du-an`.
- Hợp đồng thuộc nhóm gộp có dấu "gộp N". Loại không phải hợp đồng kinh tế hiện "—".
- **Không** có dòng tổng cho cột này, vì nhiều hợp đồng cùng cặp sẽ bị cộng trùng.

**5. `cdt-invoice-service.ts`**
- Theo khuôn của ACL contract test: tên hàm `list…`, `create…`, `update…`, `softDelete…`; quyền `read`, `create`, `edit`, `edit`.
- Update và delete lấy `projectId` từ DB (`existing.projectId`). Không tìm thấy hoặc khác dự án thì trả cùng một câu báo.
- Trả qua `runEntryAction`: create trả `{ id }`, update và delete trả `{}`.
- Lỗi 23505 trả câu "Hóa đơn {ký hiệu} {số} đã có trong sổ (ngày dd/mm/yyyy)".

**6. Trang `hoa-don-cdt`**
- `page.tsx` chép đúng mẫu guard của `hop-dong/page.tsx`:
  - parse `id`;
  - `await requireModuleAccess("du-an", { minLevel: "read", scope: { kind: "project", projectId } })` đứng trước mọi `await` nạp dữ liệu;
  - sau đó `canAccessEntitlement` để biết `canCreate` / `canEdit`.
- Bảng có dòng tổng (chưa VAT, VAT, tổng). Dòng nhập ở đầu bảng gồm: Ngày HĐ*, Ký hiệu, Số HĐ*, Giá trị chưa VAT*, VAT, Tổng (chỉ đọc), Đợt nghiệm thu (datalist lấy từ `acceptanceBatch` của dự án), Ghi chú.
- Ghi chú trên trang: "Sổ dùng chung cho mọi hợp đồng CĐT của công trình. Hóa đơn điều chỉnh giảm ghi số âm."
- Mọi thao tác ghi xong thì `router.refresh()`.

**7. Script tie-out**
- Đếm N cặp `(partyId, projectId)` material **lúc chạy**, không ghi cứng 99.
- Với mỗi cặp:
  - chạy `ledger-source`;
  - so 8 số (đầu kỳ, phát sinh, đã trả, cuối kỳ; mỗi số theo TT và HĐ) bằng `sumByEntityRounded` với các dòng của `queryDetailReport`.
- In "N/N cặp khớp"; có lệch thì in bảng và thoát mã 1.

## Verification
- Trước các cổng kiểm: `git add -N` cho các tệp mới.
- **Integration `du-an-hop-dong-tie-out.integration.test.ts`:**
  - **I1 vật tư:**
    - seed theo U1 của Phase 2, gồm dòng `thanh_toan` có `itemId` NULL;
    - thêm nhiễu: cùng NCC ở dự án khác, NCC khác cùng dự án, một dòng 9999 đã xóa mềm, một dòng có lẻ đồng;
    - 8 số phải bằng Σ của `queryDetailReport`.
  - **I2 nhân công:** như I1, với contractor.
  - **I3 CĐT:** A', B', C' so với oracle là SQL `SUM` dạng Decimal (không dùng `getCashflowSummary`, vì hàm đó cộng bằng `Number`). Có một hóa đơn âm.
  - **I4 rỗng:** hợp đồng đội và hợp đồng CĐT chưa có dữ liệu thì danh sách rỗng, tổng 0, không ném lỗi.
  - **I5 IDOR loader:** `loadContractDetail(P1, hợp đồng thuộc P2)` trả `null`.
  - **I6 sổ CĐT:**
    - trùng số và ký hiệu thì bị từ chối, kèm câu tiếng Việt;
    - cùng số nhưng khác ký hiệu thì được;
    - người chỉ có quyền read gọi create thì nhận `{ ok: false }`.
  - **I6b IDOR sổ CĐT:** người có quyền edit ở P1 gọi update/softDelete với id thuộc P2 thì nhận `{ ok: false }`, dòng P2 không đổi.
  - **I7 quyền sổ:** người có `du-an` read nhưng không có `cong-no-vt` thì nhận tổng đúng, `lists = null`; người có cả hai quyền thì nhận đủ danh sách.
  - **I8 phiếu chưa chốt:** một phiếu chưa có event thì `count = 1`; sau khi chốt kỳ thì `count = 0`.
- `pnpm exec tsx scripts/check-contract-detail-tie-out.ts` trên bản sao in "N/N cặp khớp". Lưu output vào `reports/tie-out-ban-sao.txt`.
- `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
