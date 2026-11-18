# Brainstorm: Danh mục hợp đồng trong module Dự án xây dựng

Ngày: 2026-11-18. Trạng thái: đã chốt với người dùng, chuyển sang lập plan. Chưa code.

## Outcome

Tab "Hợp đồng" của mỗi dự án (`app/(app)/du-an/[id]/hop-dong/`) trở thành danh mục hợp đồng. Bấm vào một hợp đồng sẽ mở màn chi tiết `/du-an/[id]/hop-dong/[contractId]`, gồm năm phần:

1. **Thông tin hợp đồng và bản scan.** Scan không bắt buộc, cho phép nhiều tệp (hợp đồng, phụ lục, ảnh từng trang).
2. **Giá trị hợp đồng theo DT và theo TT.** Đây là hai số nhập một lần trên chính hợp đồng. Chỉ hiện với hợp đồng kinh tế.
3. **Ba danh sách chi tiết, mỗi danh sách có dòng tổng:** lấy hàng (hoặc khối lượng nghiệm thu), lấy hóa đơn, chuyển tiền. Toàn bộ số đọc từ sổ nhập gốc, không nhập lại.
4. **Khối công nợ:**
   - còn phải trả theo thực tế = lấy hàng TT − đã chuyển tiền;
   - còn phải trả theo hóa đơn = hóa đơn đã lấy − đã chuyển tiền;
   - hóa đơn còn phải lấy = lấy hàng TT − hóa đơn đã lấy.
5. **Khối phần hợp đồng chưa thực hiện:**
   - giá trị hợp đồng TT − lũy kế lấy hàng;
   - giá trị hợp đồng − hóa đơn đã lấy;
   - giá trị hợp đồng − đã chuyển tiền.

## Quyết định nghiệp vụ người dùng đã chốt

| Câu hỏi | Quyết định |
|---|---|
| "Giá trị HĐ theo DT và TT" là gì | Hai số ghi trên hợp đồng, nhập một lần: giá trị theo dự toán và giá trị thực tế thỏa thuận. |
| Trường `valueVnd` hiện có ứng với số nào | **Giá trị theo DT.** Cần thêm cột mới cho giá trị theo TT. |
| Loại hợp đồng có số tổng hợp ("hợp đồng kinh tế") | Hợp đồng với **NCC, đội thi công và CĐT**. Giấy phép, bảo hiểm, biên bản nghiệm thu và loại khác chỉ lưu danh mục và scan. |
| Sổ nào là nguồn số liệu | **Sổ nhập gốc.** Sổ DT-HĐ-TT chỉ kéo số về để đối chiếu, không phải nơi nhập. Dữ liệu MNTC-GD1 trong đó được đưa vào từ file làm bên ngoài. Màn hợp đồng **không đọc** các bảng `project_invoice_lines`, `project_actual_receipts`, `project_cash_payments`. |
| Một NCC có nhiều hợp đồng trên cùng công trình không | Không, hoặc rất hiếm. Số tổng hợp theo cặp đối tác × công trình. Nếu cặp đó có từ 2 hợp đồng trở lên, màn hiện băng báo "gộp chung N hợp đồng" và so với tổng giá trị các hợp đồng đó. |
| "Nghĩa vụ còn phải thực hiện" là gì | Hiện **cả hai khối**: công nợ, và phần hợp đồng chưa thực hiện. |
| Nguồn số liệu cho hợp đồng CĐT | Nghiệm thu, cột giá trị với CĐT, và dòng tiền 3 bên chiều CĐT → công ty. **Thêm một sổ mới ghi hóa đơn xuất cho CĐT** trong đợt này. |
| Ai xem được scan | Ai đọc được module Dự án của công trình đó thì xem và tải được scan. Tải lên và xóa scan cần quyền sửa. |

## Hiện trạng code (đã kiểm)

- **Hợp đồng.** `ProjectContract` đã có: `docName`, `docType` (form cho chọn `contract|license`; import ghi thêm `insurance|acceptance|other`), `partyName` dạng chữ tự do, `valueVnd`, ngày ký, ngày hết hạn, `status`, `storage` (chữ), `note`, `importRunId`. Service ở `lib/du-an/contract-service.ts`. Bản sao 09/11 có 0 dòng; production chưa đếm. Chưa có liên kết tới NCC hay đội thi công.
- **Sổ công nợ vật tư, nguồn của NCC.** Bảng `ledger_transactions` với `ledgerType = material`, `partyId = supplierId`, có `projectId`. Các loại giao dịch:
  - `lay_hang` sinh từ phiếu `supplier_delivery_daily`, có cả `totalTt` và `totalHd`; số hóa đơn chỉ có ở 53/832 dòng;
  - `thue_hd`;
  - `dieu_chinh` (dương cộng phát sinh, âm cộng đã trả);
  - `thanh_toan` từ đợt thanh toán.

  Quy tắc số dư nằm ở `lib/vat-tu-ncc/supplier-balance.ts` và `lib/cong-no-vt/balance-report-service.ts`. Có số dư đầu kỳ ở `ledger_opening_balances` (31 dòng material). Dữ liệu có ở 11 dự án.
- **Sổ công nợ nhân công, nguồn của đội thi công.** Cùng bảng, `ledgerType = labor`, `partyId = contractorId` (`lib/cong-no-nc/`). Hiện 0 dòng, danh mục `contractors` cũng 0 dòng.
- **Nguồn của CĐT.** `ProjectAcceptance.amountCdtVnd` (0 dòng) và `Project3WayCashflow` với `flowDirection = cdt_to_cty` (0 dòng). Tên bên trả/nhận là chữ tự do, nhưng chiều dòng tiền đã xác định được bên. CĐT không có danh mục riêng; `Project.ownerInvestor` là chữ.
- **Lưu tệp.** `lib/storage` (`LocalDiskStore`, `UPLOAD_DIR`) và mẫu `TaskAttachment` (giới hạn 25MB, route tải `app/api/tasks/[id]/attachments/[attId]`). Route API mới phải khai báo trong `test/risk-manifest.ts`.
- **Nhánh.** `feat/master-data-quick-create` chưa có code DT-HĐ-TT (PR #20 đã ở `origin/main`). Nên mở nhánh mới từ `origin/main`.

## Phương án đã so sánh

| Phương án | Giả định dựa vào | Hỏng đầu tiên khi | Kết luận |
|---|---|---|---|
| A. Gắn đối tác có mã, đọc sổ gốc theo loại đối tác | Sổ công nợ là nơi nhập chuẩn | Một đối tác có nhiều hợp đồng trên cùng công trình. Người dùng nói hiếm; xử lý bằng băng báo gộp | **Chọn** |
| B. Đọc sổ DT-HĐ-TT | Mọi dự án có sổ DT-HĐ-TT | 10/11 dự án trống; trái với ý người dùng (đây là sổ đối chiếu) | Loại |
| C. Chọn sổ theo dự án (DT-HĐ-TT nếu có, không thì sổ công nợ) | Mỗi dự án chỉ có một sổ chuẩn | Người dùng đã nói rõ sổ DT-HĐ-TT không phải nơi nhập | Loại (đây là khuyến nghị ban đầu của kongming, đổi sau câu trả lời của người dùng) |
| D. Gắn mã hợp đồng vào từng phiếu, hóa đơn, khoản chi | Một đối tác thường có nhiều hợp đồng trên cùng công trình | Phải sửa ba màn nhập; người nhập phải chọn thêm ở mỗi dòng | Loại (người dùng: hiếm) |
| E. Cắt số theo khoảng ngày hợp đồng | Mọi giao dịch nằm trong hiệu lực hợp đồng | Thanh toán thường trễ hơn kỳ hợp đồng | Loại |

Better approaches: không có. Hướng chọn khớp yêu cầu "tổng hợp từ nguồn có sẵn", dựa trên câu trả lời về sổ chuẩn và về việc nhiều hợp đồng trên một công trình là hiếm.

## Hướng thiết kế đã chọn (để planner chi tiết hóa)

**1. Mở rộng `ProjectContract`, không tạo bảng mới:**
- `partyKind`: `ncc | doi_thi_cong | cdt | null`. Giá trị `null` dùng cho giấy phép, bảo hiểm, nghiệm thu, khác.
- `supplierId` (khi `partyKind = ncc`) và `contractorId` (khi `partyKind = doi_thi_cong`), kèm CHECK để đúng loại đi với đúng khóa. CĐT gắn ở mức dự án, không cần khóa.
- `entityId` (Chủ thể) là tùy chọn. Planner phải quyết: sổ công nợ khóa theo Chủ thể × NCC × công trình, vậy hợp đồng lọc theo Chủ thể hay cộng mọi Chủ thể của cặp đó.
- `valueTtVnd` mới. `valueVnd` hiện có đổi nghĩa thành giá trị theo DT (đổi nhãn trên UI, cân nhắc đổi tên cột).
- `partyName` giữ làm tên hiển thị hoặc tên dự phòng cho hợp đồng chưa gắn mã.

**2. Bảng mới `ProjectContractAttachment`**, theo khuôn `TaskAttachment` (FK tới hợp đồng, `storedPath`, `mimeType`, `sizeBytes`, người tải lên):
- chỉ nhận PDF/JPG/PNG, tối đa 25MB;
- route tải tra `projectId` từ hợp đồng rồi mới kiểm ACL `du-an` read, để chống IDOR;
- hợp đồng đã xóa mềm thì trả 404;
- khai báo route trong `test/risk-manifest.ts`.

**3. Sổ mới: hóa đơn xuất cho CĐT, theo dự án.** Các trường: ngày, số hóa đơn, giá trị chưa VAT, VAT, ghi chú, có thể thêm đợt nghiệm thu. Đây là nơi nhập gốc mới, có màn nhập riêng, có thể đặt trong tab Hợp đồng hoặc tab Nghiệm thu; planner chọn.

**4. Hàm tổng hợp thuần** trong `lib/du-an/contract-detail/`: nhận hợp đồng, trả về ba danh sách, tổng, khối công nợ và khối phần còn lại. Mỗi loại đối tác có một adapter:
- **NCC:** sổ công nợ vật tư lọc `partyId` × `projectId` (và Chủ thể nếu chốt như vậy). Tính cả số dư đầu kỳ và `dieu_chinh` đúng như quy tắc trong `supplier-balance.ts`; nên dùng lại hàm đó thay vì viết công thức mới.
- **Đội thi công:** sổ công nợ nhân công, cùng quy tắc.
- **CĐT:** nghiệm thu `amountCdtVnd`, dòng tiền `cdt_to_cty`, sổ hóa đơn xuất CĐT mới.

**5. UI:**
- Danh mục: thêm cột đối tác (có mã), giá trị DT/TT, công nợ còn lại; bấm vào dòng để mở chi tiết.
- Form hợp đồng: chọn loại đối tác và đối tác từ danh mục, dùng lại picker tạo nhanh danh mục vừa làm ở nhánh `feat/master-data-quick-create`.
- Màn chi tiết ghi rõ nguồn số ("Sổ công nợ vật tư", …).

## Constraints

- Next.js 16 (`params` là Promise; đọc `node_modules/next/dist/docs/` trước khi viết code), Prisma 7 với client audit trong `lib/prisma.ts`, PostgreSQL 16, vitest.
- Không nhập lại số liệu đã có. Ngoại lệ duy nhất là sổ hóa đơn xuất CĐT, vì đó là nguồn chưa tồn tại và người dùng đã duyệt.
- Không đọc sổ DT-HĐ-TT làm nguồn số của hợp đồng.
- ACL: `requireReleasedModuleRequest("du-an", { minLevel, scope: project })`. Xem cần quyền read, thêm cần create, sửa/xóa/tải lên cần edit.
- Migration có rollback; sao lưu DB trước khi migrate. Production (admin-pc) không được đụng. Thử trên bản sao `localhost:3001`.
- Mỗi route API mới phải có trong `test/risk-manifest.ts`.
- Không commit `Quản Lý Công Nợ/` hay `.claude/agent-memory/`.

## Non-goals

- Gắn mã hợp đồng vào từng phiếu, hóa đơn, khoản chi; tách số giữa nhiều hợp đồng cùng đối tác × công trình.
- Cắt số theo hiệu lực hoặc khoảng ngày của hợp đồng.
- Đọc hay sửa sổ DT-HĐ-TT; đối chiếu hợp đồng với báo cáo HĐ-TT.
- Sửa giao dịch ngay trên màn hợp đồng: màn chỉ đọc số, mọi chỉnh sửa vẫn làm ở sổ gốc.
- Lịch thanh toán theo mốc hợp đồng, phụ lục làm thay đổi giá trị, cảnh báo vượt giá trị.
- Danh mục CĐT riêng (CĐT vẫn là `Project.ownerInvestor`).
- OCR hay đọc nội dung bản scan.

## Acceptance criteria

1. Danh mục hợp đồng của một dự án có hợp đồng NCC gắn mã: bấm một dòng mở được màn chi tiết `/du-an/[id]/hop-dong/[contractId]`.
2. Với một cặp NCC × công trình có dữ liệu trên bản sao (ví dụ dự án 1 hoặc 4):
   - Σ lấy hàng TT, Σ hóa đơn, Σ chuyển tiền trên màn hợp đồng **khớp đúng từng đồng** với báo cáo công nợ vật tư của cùng cặp (cùng Chủ thể nếu lọc theo Chủ thể);
   - số "còn phải trả theo thực tế" khớp số dư cuối của báo cáo đó.
3. Hợp đồng đội thi công và hợp đồng CĐT hiện ba danh sách rỗng, tổng = 0, ghi rõ nguồn và không lỗi. Khi nhập thử một giao dịch nhân công, một nghiệm thu, một dòng tiền `cdt_to_cty` và một hóa đơn xuất CĐT, các số đó hiện đúng ở hợp đồng tương ứng.
4. Khối phần chưa thực hiện tính đúng từ giá trị DT/TT nhập trên hợp đồng; hợp đồng chưa có giá trị thì khối này ghi "chưa nhập giá trị", không hiện số âm vô nghĩa.
5. Cặp đối tác × công trình có từ 2 hợp đồng trở lên thì hiện băng báo gộp và tổng giá trị các hợp đồng đó.
6. Bản scan:
   - tải lên nhiều tệp PDF/JPG/PNG ≤ 25MB; tệp sai loại hoặc quá cỡ bị từ chối kèm thông báo tiếng Việt;
   - người chỉ có quyền read xem và tải được nhưng không tải lên hay xóa được;
   - người không có quyền vào dự án nhận 403/404 khi gọi thẳng route tải;
   - hợp đồng đã xóa mềm trả 404.
7. Hợp đồng loại giấy phép, bảo hiểm, nghiệm thu, khác chỉ hiện thông tin và scan, không có khối số liệu.
8. Dữ liệu `valueVnd` hiện có hiện ở ô "Giá trị theo DT" sau migration; migration có rollback.
9. `risk:verify`, typecheck, lint và vitest (gồm test cho hàm tổng hợp thuần, có fixture cả `dieu_chinh` âm, `thue_hd` và số dư đầu kỳ) đều xanh.

## Rủi ro và điểm planner phải kiểm

- **Chủ thể.** Một cặp NCC × công trình có thể có giao dịch dưới nhiều Chủ thể. Phải chốt hợp đồng lọc theo Chủ thể hay cộng tất cả. Nếu cần, hỏi người dùng khi lập plan.
- **Danh sách "lấy hóa đơn" ở sổ công nợ.** Giá trị hóa đơn nằm trên dòng `lay_hang` (`totalHd`) và dòng `thue_hd`; số hóa đơn chỉ có ở ít dòng. Cần chốt cách trình bày: gộp theo số hóa đơn khi có, nếu không thì liệt kê từng dòng có `totalHd ≠ 0`.
- **Đếm trùng ở phía đội.** `Project3WayCashflow` chiều `cty_to_doi` có thể trùng với `thanh_toan` trong sổ nhân công. Mặc định chỉ đọc sổ nhân công; ghi rõ trong plan.
- **Production.** Đếm số dòng `project_contracts` trên production trước khi đổi nghĩa hoặc đổi tên `valueVnd`. Bản sao 09/11 có 0 dòng.
- **Picker tạo nhanh.** Picker NCC/đội thi công có tạo nhanh nằm ở nhánh `feat/master-data-quick-create` (commit 908b68c). Nếu nhánh đó chưa merge vào main thì phải merge trước hoặc đưa vào nhánh mới.

## Handoff

Bước tiếp theo là `/ak:plan` với báo cáo này làm đầu vào, sau đó `/ak:cook`. Không có cờ `--yagni`.

## Câu hỏi còn mở

- Hợp đồng lọc số theo Chủ thể hay cộng mọi Chủ thể của cặp đối tác × công trình? (Planner xác định từ dữ liệu; nếu phần lớn cặp chỉ có một Chủ thể thì cộng tất cả và ghi chú.)
- Sổ hóa đơn xuất CĐT đặt ở tab nào (Hợp đồng hay Nghiệm thu), và có cần gắn với đợt nghiệm thu không?
