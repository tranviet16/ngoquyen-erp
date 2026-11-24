# Tổng hợp debate: ba ứng viên plan danh mục hợp đồng

Ba planner làm độc lập, không đọc bản của nhau, mỗi người theo một góc nhìn:
- **Ứng viên 1:** dùng lại nhiều nhất;
- **Ứng viên 2:** đúng số và đối chiếu trước;
- **Ứng viên 3:** trải nghiệm người dùng và giao từng phần.

Plan cuối lấy ứng viên 2 làm khung công thức và kiểm thử, ứng viên 3 làm khung màn hình và cổng CI, và giữ hai phát hiện lỗi của ứng viên 1.

## Đồng thuận (cả ba)

- Giữ tên cột `valueVnd`, đổi nhãn thành "Giá trị theo DT", thêm `valueTtVnd`. Lý do: import ghi cột này bằng raw INSERT.
- Đối tác gồm `partyKind` + `supplierId` / `contractorId` có CHECK. Không có `entityId`; cặp có từ 2 Chủ thể thì hiện băng.
- Tổng hiển thị lấy từ `queryDetailReport`. Danh sách dùng fragment `increaseSql` / `decreaseSql`. Lệch thì hiện băng đỏ, không sai âm thầm.
- Danh sách hóa đơn gom theo `invoiceNo` khi có số; dòng không có số đứng riêng với nhãn "Chưa ghi số HĐ".
- CĐT: `cdt_to_cty` mang dấu +, `cty_to_cdt` mang dấu −. Hợp đồng đội không đọc `cty_to_doi`, để tránh đếm trùng với sổ nhân công.
- Scan có bảng riêng, FK RESTRICT (import rollback bị chặn có thông báo), magic bytes, route GET kiểm quyền theo dự án, bản ghi P0 trong risk-manifest.
- Mở nhánh mới từ `origin/main`; phụ thuộc PR #21 cho picker.

## Bất đồng và cách chốt

| Chủ đề | Các phương án | Chốt | Lý do |
|---|---|---|---|
| Số dư đầu kỳ | Ứng viên 1: dòng "chuyển sang" ở đầu danh sách. Ứng viên 2 và 3: chỉ vào khối công nợ, kèm chú thích. | Chỉ vào khối công nợ | Đầu kỳ là số dư ròng nên không tách được thành lấy hàng hay trả tiền. Đặt vào danh sách sẽ làm sai "phần chưa thực hiện". Hỏi lại người dùng ở vòng kiểm định. |
| Nơi nhập sổ hóa đơn CĐT | Ứng viên 1 và 3: trong màn hợp đồng CĐT. Ứng viên 2: trang riêng `hop-dong/hoa-don-cdt`. | Trang riêng, có link từ màn hợp đồng | Brainstorm đã chốt non-goal "màn hợp đồng chỉ đọc số". Sổ theo dự án sẽ bị lặp ở mọi hợp đồng CĐT. Hỏi lại ở vòng kiểm định. |
| Danh mục | Ứng viên 1 và 2: giữ DataGrid, thêm cột link, sửa `patchContract`. Ứng viên 3: bảng thường + hộp thoại. | Bảng thường + hộp thoại | DataGrid không có sự kiện bấm dòng (`components/data-grid/types.ts`). Cách gửi lại toàn bộ input là nguồn lỗi "sửa làm mất trường" (commit a6fef44). Đây là đổi trải nghiệm, phải hỏi người dùng. |
| Phần chưa thực hiện | Ứng viên 1 và 3: bảng 3 × 2 (DT và TT). Ứng viên 2: 3 số, mỗi số chọn một nền. | Bảng 3 × 2 | Phủ cả hai cách hiểu mà không phải đoán. |
| Nơi đặt action tải scan | Ứng viên 2: service "use server" trong `lib/`. Ứng viên 1 và 3: `scan-actions.ts` trong `app/`. | `app/.../scan-actions.ts` + service thường trong `lib/` | Theo khuôn task (`app/(app)/van-hanh/cong-viec/attachments-actions.ts`). Cổng `risk:verify` và `module-release-entrypoints` giữ được action này. |
| Xóa scan | Ứng viên 2: xóa cứng (như task). Ứng viên 3: xóa mềm. | Xóa mềm | Hợp đồng là tài liệu pháp lý, cần khôi phục được. Test recovery P0 có cái để kiểm. |
| URL route tải | Ứng viên 2: `api/du-an/hop-dong/[contractId]/tep/[fileId]`, tra `projectId` từ DB. Ứng viên 1 và 3: `api/du-an/[id]/hop-dong/[contractId]/scan/[scanId]`. | Có `[id]` dự án trên URL | Guard chạy được trước mọi truy vấn, rồi tra dòng với điều kiện `contract.projectId = id`. Cả hai cách đều an toàn; cách này khớp với URL của trang. |
| `bodySizeLimit` | Ứng viên 2: nâng thẳng lên 26mb. Ứng viên 3: thử biên trước. | Thử biên trước, chỉ nâng khi cần | Không đổi cấu hình khi chưa có bằng chứng. |

## Phát hiện riêng được giữ lại

- **Ứng viên 1:** `patchContract` cùng `updateContract` ghi `?? null` nên xóa liên kết đối tác khi sửa trên lưới. Ngoài ra `contractSchema.docType` chỉ có `contract|license`, nên hợp đồng loại bảo hiểm đã import không sửa được. Cả hai đã vào Phase 3.
- **Ứng viên 2:** 47 dòng có lẻ đồng, nên phải so theo từng Chủ thể. 4 dòng `lay_hang` âm. 22 cặp chỉ có đầu kỳ. Script tie-out 99/99. CHECK `docType = contract` khi có đối tác.
- **Ứng viên 3:** `runEntryAction` để giữ câu báo tiếng Việt trên production. Các cổng `module-release-entrypoints` và `project-service-acl-contract`. Picker NCC chia nhóm "đã có giao dịch ở công trình" (bản sao có NCC trùng tên). Header `nosniff`, `sandbox`. `?xem=1`.

## Câu hỏi gom về vòng kiểm định

1. `thue_hd` có bị loại khỏi "Hóa đơn còn phải lấy" và "Giá trị − lũy kế lấy hàng" không? (ứng viên 2)
2. Ở 162 dòng `thanh_toan` có TT khác HĐ, cột nào là tiền thật đã chi (dùng cho "Giá trị − đã chuyển tiền")? (ứng viên 1 và 2)
3. `amountCdtVnd` của nghiệm thu và giá trị hợp đồng đã gồm VAT chưa? (cả ba)
4. Hóa đơn xuất CĐT có cho phép số âm (hóa đơn điều chỉnh) không? (ứng viên 2)
5. Đổi danh mục từ lưới sửa trực tiếp sang bảng + hộp thoại. (ứng viên 3)
6. Đặt sổ hóa đơn CĐT ở trang riêng. (bất đồng)
7. Xử lý số dư đầu kỳ. (bất đồng)
8. Người chỉ có quyền đọc `du-an` có được thấy công nợ NCC không? (ứng viên 3, Q4)
