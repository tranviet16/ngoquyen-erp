# Red-team: phân xử các phát hiện (2026-11-18)

Bốn reviewer chạy song song: Security Adversary, Failure Mode Analyst, Assumption Destroyer và Scope & Complexity Critic. Họ nộp tổng cộng 37 phát hiện. Sau khi gộp các phát hiện trùng nhau còn 18 mục: 15 mục Accept, 3 mục Reject. Năm mục khác cần quyết định nghiệp vụ, đã chuyển sang vòng kiểm định.

## Đã tự kiểm lại hai điểm quan trọng

- `origin/main:proxy.ts:118-121`: matcher bắt mọi đường dẫn, nên POST của server action cũng đi qua proxy.
- `package.json` không có `server-only`.

## Accept (đưa vào plan)

| # | Phát hiện | Mức | Reviewer | Áp dụng |
|---|---|---|---|---|
| 1 | **Scan không có chỗ lưu bền và ghi được.**<br>• Container chạy `uid 1001`.<br>• `/app` thuộc root.<br>• Compose prod và compose 3001 không có volume, cũng không có `UPLOAD_DIR`. | Critical | Sec, FM, Ass | P1 thêm bước hạ tầng: bind mount, `UPLOAD_DIR`, chown. Route GET gọi `store.exists()` trước khi stream. P6 runbook. |
| 2 | **`proxy.ts` chỉ đệm 10MB body** (`proxyClientMaxBodySize` mặc định), nên tệp scan 10–25MB bị cắt. | High | Ass | P5: đặt `experimental.proxyClientMaxBodySize: "26mb"`, thử tải qua trình duyệt trên 3001. |
| 3 | **`updateContract` "chỉ ghi trường có mặt" làm vỡ việc đổi loại đối tác** (vi phạm CHECK 23514) và không xóa được giá trị. | High | Scope, FM | P3: hộp thoại gửi đủ trường. Server tự suy khóa từ `partyKind` và ghi NULL tường minh. Có test chuỗi NCC → Đội → Khác → CĐT và test xóa giá trị TT. |
| 4 | **Import rollback.**<br>• Scan đã xóa mềm vẫn chặn rollback mãi mãi.<br>• Hợp đồng import mà người dùng đã gắn đối tác thì bị xóa âm thầm.<br>• `updatedAt` không có `@updatedAt`. | High | FM, Sec | P1/P5: thêm guard hợp đồng trong `lib/import/rollback-guards.ts` (chặn khi có đối tác, giá trị TT, hoặc bất kỳ scan nào). Thêm action "Xóa vĩnh viễn" chỉ cho admin, xóa cứng dòng cùng tệp, có audit. Service tự set `updatedAt`. |
| 5 | **Thiếu test IDOR cho server action.** Ví dụ: người có quyền edit ở dự án P1 gửi id thuộc P2. Câu báo lỗi "không có" và "không có quyền" khác nhau, nên lộ được id nào tồn tại. | High | Sec | P3/P4/P5: `projectId` chỉ lấy từ DB, cùng một câu báo cho mọi trường hợp. Thêm test S3b, I6b và một case binding. |
| 6 | **`runEntryAction` trả nguyên văn lỗi `fs`**, lộ đường dẫn tuyệt đối. `safeFilename` cắt theo ký tự, không theo byte. | High | Sec | P5: bọc mọi lời gọi `store.*`, ném lỗi lớp riêng kèm câu chung. Cắt tên tệp theo byte. Test assert câu báo không chứa `/`. |
| 7 | **`server-only` chưa được cài.** Script tie-out và integration test sẽ chết ngay lúc import. | High | Ass, FM | P4: bỏ `server-only`. Theo quy ước của `supplier-balance.ts`: không có "use server", có comment, và có test khẳng định file không có "use server". |
| 8 | **Dry-run khôi phục dump chụp trước migration.**<br>• `migrate dev` cần shadow DB, mà repo đã nhiều lần hỏng ở bước này.<br>• Bản sao đang mang migration của PR #14. | High | Ass, FM | P1: tạo migration bằng `prisma migrate diff --script`, ghi chú về PR #14. P6: chụp dump sau migrate và khôi phục dump đó ở cuối. |
| 9 | **Import ghi `status = 'pending'`** nhưng zod và form chỉ nhận 3 giá trị. | High | Scope, Ass | P3: thêm `pending` ("Chờ ký") vào enum, nhãn và form, kèm test. |
| 10 | **Guard trang không theo `PROJECT_PAGE_FILES`.**<br>• Page phải gọi `requireModuleAccess` trước mọi `await` khác.<br>• `ContractForm` chưa có props cho consumer thứ hai.<br>• Cổng kiểm chỉ quét file đã được git track. | Medium | Scope, Sec, Ass | P3/P4/P5: page chép đúng mẫu của `hop-dong/page.tsx`. Định nghĩa `ContractFormProps` và `toContractFormValues`. Chạy `git add -N` trước các cổng kiểm. |
| 11 | **`ActionResult` chưa định nghĩa payload.** Decimal lọt vào kết quả. Câu "Forbidden" là tiếng Anh. | Medium | Scope, FM | P3/P4/P5: create trả `{ id }`, update/delete trả `{}`. Câu báo bằng tiếng Việt. |
| 12 | **Đối chiếu lúc chạy là thừa, và "3 truy vấn" là con số sai.**<br>• Tie-out tự xác nhận chính nó.<br>• Danh mục gọi `buildLedgerFigures` với `rows=[]` sẽ báo lệch giả. | Medium | Scope, FM, Ass | P2/P4:<br>• Màn chi tiết lấy tổng = Σ các dòng (hàm thuần).<br>• Bỏ băng đỏ lúc chạy.<br>• Danh mục dùng `buildListFigure` riêng.<br>• Sửa lại số truy vấn.<br>• Giữ integration test và script (đếm N lúc chạy, không cứng 99).<br>• P6 đối chiếu tay một cặp với `/cong-no-vt` và Excel. |
| 13 | **Header và audit của route tải.**<br>• `CSP: sandbox` làm PDF inline trắng trang trên Chrome.<br>• Thao tác tải về không có dòng audit.<br>• Mẫu manifest dùng `operation: "DELETE"`. | Medium | Sec, FM | P5:<br>• Header theo MIME: PDF không dùng sandbox, ảnh giữ sandbox.<br>• `writeAuditLog` với action `download` / `view`.<br>• Viết bản ghi manifest mới với `GET`.<br>• Dry-run trên Chrome và Edge. |
| 14 | **SQL `ledger-source`.**<br>• Phải `LEFT JOIN items` vì `itemId` NULL ở 566 dòng.<br>• Phải qualify `"deletedAt"`.<br>• I3 so bằng float. | Medium | FM, Sec | P4: ghi rõ JOIN và cách qualify; seed `thanh_toan` có `itemId` NULL; I3 dùng SQL `SUM` Decimal làm oracle. |
| 15 | **Unique `(projectId, invoiceNo)` chặn hóa đơn trùng số nhưng khác ký hiệu.** | Medium | FM | P1: thêm `invoiceSymbol String?`; unique `(projectId, invoiceSymbol, invoiceNo) NULLS NOT DISTINCT`. |
| 16 | **Phiếu vật tư ngày chưa chốt kỳ không nằm trong "Lấy hàng".** Trên bản sao có 529/542 phiếu, khoảng 3,86 tỷ đồng. | Medium | Ass | P4/P5: băng báo "N phiếu (x đ) chưa chốt vào sổ công nợ", đếm từ `supplier_delivery_daily` chưa có event. |
| 17 | **AC8 và AC3 phía CĐT không chứng minh được trên bản sao**: 0 hợp đồng, 0/12 dự án có `ownerInvestor`. | Medium | Ass | P6: INSERT một dòng hợp đồng theo cột của adapter trước khi migrate; điền `ownerInvestor` cho dự án thử. |
| 18 | **UI làm thêm ngoài yêu cầu**: kéo-thả, tooltip công thức, nút tắt "Nhập giá trị", danh sách thu gọn/ghim tổng, băng labor không có công trình. Ngoài ra `listContractPartyOptions` trùng `listSupplierOptions`, và nhóm "đã có giao dịch" là thêm ngoài yêu cầu. | Medium | Scope | P3/P5: bỏ các món trên; tải scan bằng `<input multiple>`. Dùng lại `listSupplierOptions`, thêm `listContractorOptions`; chỉ nạp khi có quyền create/edit. |
| 19 | **Câu "build cũ an toàn trên schema mới" sai** khi build cũ đổi `docType` của một hợp đồng đã gắn đối tác. | Medium | Sec | P1 Risks: sửa câu, nêu rõ ngoại lệ. |

## Reject

| Phát hiện | Lý do |
|---|---|
| Đặt trần số tệp hoặc dung lượng cho mỗi hợp đồng (Sec F6) | Người dùng không yêu cầu, và đã có giới hạn 25MB mỗi tệp. Ổ đĩa tăng theo mức dùng thật. Ghi vào runbook để theo dõi dung lượng. |
| Đổi FK scan sang CASCADE cho dòng đã xóa mềm (Sec F6) | Guard rollback cộng action xóa vĩnh viễn của admin (Accept #4) đã giải quyết, mà không xóa ngầm. |
| Dùng `.nullable().optional()` cộng merge kiểu `mergeInvoicePatch` (FM F3, một phần) | Bỏ DataGrid nên không còn sửa từng phần. Hộp thoại gửi đủ trường là đủ, như Scope F2 đề xuất. |

## Chuyển sang vòng kiểm định (quyết định nghiệp vụ)

- Quyền đọc `du-an` có xem được sổ công nợ VT/NC không (Sec F3, Ass F5, FM F9, Scope F1).
- `thue_hd` trong "hóa đơn còn phải lấy". Công thức đã chốt trong brainstorm không trừ khoản này (Scope F1).
- Cơ sở VAT của `amountCdtVnd` (Ass F8).
- `Project.contractValue` trùng với giá trị của hợp đồng CĐT (Ass F7).
- Đổi danh mục từ lưới sang bảng; hóa đơn điều chỉnh âm; cột nào là tiền thật đã chi trong `thanh_toan`.

## Việc ngoài plan, cần làm riêng

- Đính kèm task hiện có cũng bị hai lỗi hạ tầng #1 và #2: bảng `task_attachments` có 0 dòng, và luồng tải tệp chưa từng chạy thật trong container. Phần hạ tầng của #1 (volume cùng `UPLOAD_DIR`) sẽ sửa luôn cho task. Phần proxy của #2 cũng áp dụng chung.
