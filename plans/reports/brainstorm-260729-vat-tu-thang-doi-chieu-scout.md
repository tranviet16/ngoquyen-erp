# Scout: Theo dõi vật tư tháng (5 file NCC) → tái hiện flow trong ERP

Ngày: 2026-07-29 | Nguồn: `SOP/theo-doi-vat-tu-thang/*.xlsx` + code ERP hiện tại
Mục tiêu: tái hiện flow (1) phiếu lấy hàng theo ngày → (2) tổng hợp tháng → (3) đối chiếu công nợ, sao cho số đối chiếu KHỚP module `cong-no-vt` cả về tiền lẫn sự kiện lấy hàng/thanh toán.

---

## 1. Cấu trúc 5 workbook

Cả 5 file cùng 1 khuôn mẫu, mỗi file = 1 NCC:

| File | NCC | Sheets |
|---|---|---|
| Xi măng Phương Minh.xlsx | CP TM Phương Minh | SGV (trống), Vật tư ngày, Vật tư tháng, Đối chiếu công nợ |
| Xi măng Anh Thư.xlsx | TNHH Anh Thư | như trên |
| Gạch Nam Hương.xlsx | TNHH Nam Hương | như trên |
| Máy xúc Lộc Tài HT.xlsx | TNHH Lộc Tài HT | SGV, Vật tư ngày, **Vật tư tháng Trại Chuối**, **VT tháng Dải cây xanh** (tách sheet theo công trình), Đối chiếu công nợ |
| Quang Minh cát,gạch...xlsx | TNHH XD&VT Quang Minh | SGV, Vật tư ngày, Vật tư tháng, Đối chiếu công nợ Hết 26.5.26 |

### 1.1 Sheet "Vật tư ngày" — BẢNG THEO DÕI HÀNG NGÀY (= phiếu lấy hàng)
- Mỗi **kỳ chốt** là 1 block lặp lại trong cùng sheet. Header block: Công trình, Tên vật tư, "Ngày chốt khối lượng của tháng: Từ ngày X đến ngày Y".
- Cột: `STT | Ngày/tháng/năm | [Loại vật tư — chỉ Quang Minh có] | Khối lượng | ĐVT | Cán bộ vật tư | Chỉ huy công trường | Kế toán phụ trách` (3 cột cuối là ô ký, luôn trống trong file).
- **Chỉ có số lượng, KHÔNG có đơn giá/thành tiền.** Đơn vị: viên, m3, Tấn, Ca (máy xúc tính "ca" — cùng khuôn với vật tư).
- Kỳ chốt KHÔNG theo tháng dương lịch: quan sát `01/4→26/4`, `27/3→27/4`, `28/4→26/5`, `26/5→26/6`, `26/6→27/6`. Mốc ~ngày 26/27, nhưng biên kỳ không nhất quán giữa NCC (26 vs 27 vs 28, có chỗ 2 kỳ liền kề trùng ngày biên).

### 1.2 Sheet "Vật tư tháng" — BẢNG TỔNG HỢP VẬT TƯ THÁNG
- KHÔNG phải bảng cộng gộp — là **chép lại nguyên các dòng ngày** theo block "Tháng: MM/YYYY", thêm cột `Ghi chú`, chân block có chữ ký "Kế toán phụ trách".
- Tách theo công trình khi NCC phục vụ nhiều công trình (Lộc Tài: 2 sheet tháng). Ghi chú đôi khi chứa đơn giá (Lộc Tài Dải cây xanh: 3.300.000/2.600.000/3.000.000 đ/ca) hoặc tên loại vật tư (Nam Hương T06: Gạch đặc A1 vs không nung).
- Giá trị nghiệp vụ thực = bản chốt có chữ ký kế toán của kỳ, không phải phép tính mới.

### 1.3 Sheet "Đối chiếu công nợ" — BẢNG ĐỐI CHIẾU CÔNG NỢ
Mỗi kỳ 1 block, cấu trúc chuẩn:
- Header pháp lý: 2 bên mua/bán, người đại diện (CB vật tư Nguyễn Hoàng Sơn), phạm vi công trình **gộp nhiều công trình** (vd Nam Hương: "Trại Chuối + Tân Lộc CDC + ĐVP - CDC").
- `A` — **Dư nợ mang sang**: số cuối kỳ trước. Kỳ đầu là công thức tay gộp nhiều công trình (vd `=35866799+109336700+44600000+1621` — Nam Hương; `=91120000+6200000+221000000` — Quang Minh) → không truy vết được từng công trình.
- Dòng chi tiết: **chép lại từng lần lấy hàng của kỳ, GHÉP THÊM Đơn giá**, `Thành tiền = KL × ĐG` (công thức). Giá thay đổi giữa kỳ (Nam Hương 1.900→1.850→1.450 đ/viên; Quang Minh cát Việt Trì 490k→450k). Quang Minh/Lộc Tài có dòng tổng phụ theo loại vật tư / theo công trình ("Tổng cát xây Việt Trì", "Cộng Trại Chuối", "Cộng dải cây xanh").
- `B` — Cộng P/S = Σ thành tiền kỳ.
- `C` — **Chuyển khoản** (thanh toán): số tròn, không chi tiết (100.000.000; Anh Thư 30.000.000; Phương Minh ghi ngày "Chuyển khoản ngày 04/6/2026").
- `A+B−C` = **Tổng nợ** → làm `A` của kỳ sau. Đã xác minh chuỗi khớp số học: Nam Hương 310.605.120 → 255.005.120 → 285.465.120; Quang Minh 367.560.000 → 288.200.000 → 307.850.000 → 311.450.000; Anh Thư 31.830.000 → 11.430.000; Phương Minh 229.717.000 → 242.457.000 → 154.987.000.
- Chân: lời đề nghị NCC kiểm tra ký xác nhận + 3 chữ ký.

### 1.4 Lỗi/dữ liệu bẩn quan sát được (bài học cho ERP)
- Ngày nhập lẫn lộn text vs date thật, đảo ngày/tháng (`datetime(2026,11,4)` thực chất là 11/4/2026), có dòng sai năm (`19/4/2025` giữa kỳ 4/2026).
- STT nhảy cóc ở sheet đối chiếu Quang Minh (thiếu 7, 10, 21…) → bằng chứng chép tay từ sheet ngày sang, dễ sót dòng.
- Dư nợ đầu là công thức tay không có sổ chi tiết đối ứng.
- Đơn giá chỉ xuất hiện ở bước đối chiếu, không có ở phiếu ngày.

### 1.5 Flow nghiệp vụ suy ra (end-to-end)
```
[Hằng ngày]  CB vật tư ghi phiếu lấy hàng: ngày, (loại VT), KL, ĐVT — theo NCC + công trình
     ↓ (chốt kỳ ~26/27 hằng tháng)
[Tháng]      Kế toán chốt "Vật tư tháng" (bản sao dòng ngày, ký xác nhận)
     ↓
[Đối chiếu]  Gắn đơn giá vào từng dòng → Thành tiền; A (dư mang sang) + B (Σ P/S) − C (chuyển khoản) = Tổng nợ
     ↓
[NCC ký]     Gửi NCC ký xác nhận; Tổng nợ trở thành A kỳ sau (carry-over)
```

---

## 2. ERP hiện có — bản đồ phủ

### 2.1 Module `vat-tu-ncc` (theo dõi giao hàng NCC)
| Excel | ERP | Trạng thái |
|---|---|---|
| Vật tư ngày | `SupplierDeliveryDaily` (prisma/schema.prisma:521) + grid `app/(app)/vat-tu-ncc/[supplierId]/ngay/page.tsx` | ✅ Khớp gần đủ: date, itemId, qty, unit, 3 cột người ký (cbVatTu/chiHuyCt/keToan), projectId optional. **Cột `unitPrice`, `totalAmount` CÓ trong schema (dòng 529-530) nhưng KHÔNG được ghi** — `deliverySchema` (lib/vat-tu-ncc/schemas.ts:3-14) và `createDelivery` (lib/vat-tu-ncc/delivery-service.ts:37-57) bỏ qua. |
| Vật tư tháng | View `vw_supplier_delivery_monthly` (prisma/migrations/20260504160000_add_supplier_delivery/migration.sql:55-64) + `app/(app)/vat-tu-ncc/[supplierId]/thang/` | ⚠️ Cộng theo **tháng dương lịch** (`date_trunc('month')`), chỉ tổng KL/item — Excel chốt kỳ 27→26 và liệt kê từng dòng. |
| Đối chiếu công nợ | `SupplierReconciliation` (schema.prisma:548) + `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/` | ⚠️ Chỉ lưu 4 số tổng **gõ tay**: openingBalance, totalIn, totalPaid → closing tự tính = open+in−paid (lib/vat-tu-ncc/reconciliation-service.ts:20-22). KHÔNG suy ra từ phiếu ngày, KHÔNG có dòng chi tiết, KHÔNG link thanh toán, KHÔNG ràng buộc closing kỳ trước = opening kỳ sau. Có periodFrom/periodTo (tùy ý → hỗ trợ được kỳ 27→26) + signedBySupplier/signedDate. |

### 2.2 Module `cong-no-vt` (quản lý công nợ vật tư — sổ cái)
- `LedgerTransaction` (schema.prisma:637): sự kiện `lay_hang | thanh_toan | dieu_chinh` theo (entityId "Chủ thể", partyId = supplierId, projectId?, itemId?), song song TT/HĐ (amount, vatPct, vat, total). **KHÔNG có cột qty/đơn giá** — chỉ tiền.
- `LedgerOpeningBalance` (schema.prisma:675): số dư đầu duy nhất theo (ledgerType, entity, party, project) — nhập ở `app/(app)/cong-no-vt/so-du-ban-dau/`.
- Công thức số dư: `opening + lay_hang − thanh_toan + dieu_chinh` (lib/ledger/ledger-aggregations.ts:87-88); `balance-service.ts` (outstanding = opening + lay_hang − thanh_toan) phục vụ Payment round.
- Báo cáo tháng theo **tháng dương lịch** (ledger-aggregations.ts:127-128).
- Nhập liệu: `app/(app)/cong-no-vt/nhap-lieu/` qua `material-ledger-service.ts` (bulk upsert grid).
- `PaymentRound/PaymentRoundItem` (schema.prisma:574,602): đợt đề nghị thanh toán đọc số dư từ balance-service; **duyệt chi KHÔNG tự sinh sự kiện `thanh_toan` vào ledger** (grep `thanh_toan` chỉ xuất hiện trong lib/ledger + lib/cong-no-*; không có trong lib/payment) — thanh toán vẫn phải gõ tay vào ledger.

### 2.3 Điểm đứt gãy hiện tại (nguồn số của từng nơi)
- Số "đối chiếu" (`SupplierReconciliation`) = gõ tay, 3 số tổng.
- Số "công nợ vật tư" (`cong-no-vt`) = opening gõ tay + giao dịch tiền gõ tay.
- Phiếu ngày (`SupplierDeliveryDaily`) = KL, không tiền.
→ **Ba kho dữ liệu không nối nhau bằng bất kỳ FK/ràng buộc nào.** Khớp số hiện chỉ nhờ kỷ luật con người — đúng vấn đề Excel đang gặp (STT nhảy cóc, công thức tay).

---

## 3. Gap list (để đối chiếu = cong-no-vt cả số lẫn sự kiện)

1. **Đơn giá tại phiếu lấy hàng**: chưa nhập được (cột DB có sẵn nhưng service/schema/grid chưa hỗ trợ). Không có giá → không dựng được dòng "Thành tiền" của bảng đối chiếu từ dữ liệu ngày.
2. **Kỳ chốt 27→26**: view tháng + báo cáo tháng ledger đều theo dương lịch. Cần kỳ from/to tự do (SupplierReconciliation đã có 2 cột này — chỉ thiếu logic tính theo kỳ).
3. **Sự kiện thanh toán**: dòng `C` chỉ tồn tại dưới dạng số tổng gõ tay trong reconciliation; ledger có `thanh_toan` riêng; PaymentRound duyệt xong không ghi ledger. 3 nơi không khớp nhau về sự kiện.
4. **Không có liên kết phiếu ↔ sổ cái**: không gì bảo đảm Σ(qty×giá) phiếu trong kỳ = `lay_hang` ledger cùng kỳ.
5. **Chiều dữ liệu lệch nhau**: đối chiếu theo NCC gộp nhiều công trình; ledger theo (entity, NCC, công trình). Cần quy ước entity + phép gộp project khi in đối chiếu.
6. **Carry-over không ràng buộc**: closing kỳ k phải = opening kỳ k+1 (Excel làm tay, ERP chưa enforce).
7. **Bảng đối chiếu in được**: cần dòng chi tiết + tổng phụ theo công trình/loại VT + khối chữ ký — model hiện chỉ có 3 số.
8. **Khóa sau khi NCC ký**: `signedBySupplier` có cờ nhưng không khóa sửa kỳ/phiếu đã ký.

---

## 4. Phương án

### PA-A — Một nguồn sự thật, đối chiếu là snapshot dẫn xuất (KHUYẾN NGHỊ)
Nguyên tắc: **mỗi lần lấy hàng và mỗi lần chuyển khoản là 1 sự kiện duy nhất trong hệ thống; đối chiếu và công nợ chỉ là 2 cách trình bày cùng dòng sự kiện.**
1. Mở khóa `unitPrice`/`totalAmount` trên `SupplierDeliveryDaily` (cột đã có — chỉ sửa schema zod + service + grid). Giá gợi ý = giá lần nhập gần nhất theo (NCC, item); cho sửa từng dòng (giá đổi giữa kỳ là thực tế). KHÔNG cần bảng giá hiệu lực theo ngày ở bước này (YAGNI).
2. Cầu nối sang ledger: mỗi phiếu ngày (khi có giá) sinh/đồng bộ 1 `LedgerTransaction` `lay_hang` (amountTt = qty×giá, itemId, projectId, date; thêm cột `deliveryId` FK hoặc `qty/unitPrice` vào LedgerTransaction). Thanh toán nhập MỘT nơi (ledger `thanh_toan`), reconciliation đọc ra.
3. `SupplierReconciliation` chuyển thành **bản chốt được sinh ra**: chọn NCC + kỳ from/to → hệ thống tính opening (= closing bản chốt trước, mặc định từ ledger asOf), liệt kê dòng lấy hàng, Σ P/S, Σ chuyển khoản trong kỳ → lưu snapshot (tổng + tham chiếu dòng) + cờ ký + khóa sửa. In theo mẫu BẢNG ĐỐI CHIẾU.
- Ưu: khớp 1:1 **theo cấu trúc**, không thể lệch; hết nhập trùng (DRY); sửa được đúng bệnh của Excel.
- Nhược: đổi thói quen nhập `cong-no-vt` (đang nhập tiền gộp) sang nhận dòng từ phiếu; phải chốt quy ước entity, TT/HĐ (Excel = TT, VAT 0), và xử lý dữ liệu lịch sử (dư nợ gộp nhiều công trình → nhập LedgerOpeningBalance từng project hoặc 1 dòng gộp project=null).

### PA-B — Giữ nhập 2 nơi + báo cáo so khớp
Thêm đơn giá vào phiếu ngày; xây báo cáo "so khớp kỳ": Σ phiếu(qty×giá) vs `lay_hang` ledger, totalPaid vs `thanh_toan` ledger; highlight lệch; đối chiếu vẫn gõ/generate bán tự động.
- Ưu: ít xâm lấn nhất, không đổi workflow cong-no-vt.
- Nhược: số vẫn lệch được; tốn công dò lệch hằng tháng; nợ kỹ thuật (2 nguồn sự thật) — trái DRY. Chỉ nên là **bước đệm/lưới an toàn** trong giai đoạn chuyển tiếp của PA-A.

### PA-C — Nhập Excel làm seed + hợp nhất model (big-bang)
Viết importer 5 workbook (dòng ngày, giá từ sheet đối chiếu, chuyển khoản, dư mang sang), hợp nhất về model ledger-centric có qty/giá, dựng lại UI vat-tu-ncc trên đó.
- Ưu: trạng thái cuối sạch; có dữ liệu lịch sử để kiểm chứng số.
- Nhược: phạm vi lớn nhất, rủi ro cao, importer phải xử lý dữ liệu bẩn (ngày đảo, STT sót). Import lịch sử nên làm **thủ công qua nhập số dư đầu kỳ + vài kỳ gần nhất**, không đáng viết importer đầy đủ (YAGNI).

**Khuyến nghị**: PA-A theo pha — (1) mở giá + thanh toán một nơi, kèm báo cáo so khớp kiểu PA-B làm lưới an toàn; (2) sinh bảng đối chiếu từ dữ liệu + ràng buộc carry-over + khóa khi ký; (3) hoàn tất cầu phiếu↔ledger (chọn chiều master, xem câu hỏi 1 bên dưới). Không viết importer Excel đầy đủ.

---

## 5. Câu hỏi cần quyết định nghiệp vụ (user)

1. **Chiều master**: phiếu ngày sinh dòng ledger, hay ledger (thêm cột qty/đơn giá) là kho duy nhất và trang "ngày" của vat-tu-ncc chỉ là UI nhập vào ledger? (Phương án 2 gọn hơn về dài hạn — 1 bảng sự kiện; phương án 1 ít đụng module đang chạy.)
2. **Ai nhập đơn giá, khi nào**: CB vật tư nhập ngay lúc lấy hàng, hay kế toán gắn giá lúc chốt kỳ (như Excel)? Có cho sửa giá hồi tố sau khi đã chốt?
3. **Quy tắc kỳ chốt**: cố định "27 tháng trước → 26 tháng này" cho mọi NCC, hay cấu hình theo NCC? Biên kỳ tính **bao gồm** hay **loại trừ** ngày biên (Excel đang mâu thuẫn: 26/4→26/5 và 28/4→26/5 cùng tồn tại — rủi ro đếm trùng ngày 26)?
4. **Nguồn sự kiện chuyển khoản**: gõ tay như hiện tại, hay khi PaymentRound được duyệt/chi thì tự sinh `thanh_toan` vào ledger? (Hiện chưa có liên kết nào.)
5. **Entity (Chủ thể)** cho các phiếu vat-tu-ncc là entity nào? Đối chiếu in gộp mọi công trình của NCC — có cần giữ số dư tách theo công trình bên dưới (như ledger đang tách) rồi gộp khi in?
6. **TT vs HĐ**: bảng đối chiếu NCC là giá thực tế (TT), VAT = 0? Số HĐ có cần xuất hiện trên bản in không?
7. **Lệch khi NCC không đồng ý số**: xử lý bằng sự kiện `dieu_chinh` trong kỳ sau, hay sửa lùi kỳ đã ký? (Đề xuất: kỳ đã ký bị khóa, mọi chênh lệch đi vào `dieu_chinh`.)
8. **Dữ liệu lịch sử**: chỉ nhập dư nợ tại một mốc (vd hết 26/6/2026) rồi chạy tiếp trong ERP, hay cần tái lập vài kỳ gần nhất để NCC ký lại trên hệ thống?

---

## 6. Chỉ số thành công
- Với 1 NCC thí điểm (đề xuất Nam Hương — dữ liệu đủ 3 kỳ, có đủ A/B/C): bảng đối chiếu sinh từ ERP khớp 100% số Excel kỳ tương ứng (A, B, C, Tổng nợ) và khớp `getMaterialCurrentBalance` của cong-no-vt tại cùng asOf.
- Không còn màn hình nào cho phép gõ tay `totalIn`/`totalPaid` của kỳ đã sinh tự động.
- Closing kỳ k = Opening kỳ k+1 được hệ thống bảo đảm, không phụ thuộc người nhập.

## 7. Giả định (thay cho câu hỏi, kèm độ tin cậy)
- Excel là quy trình chuẩn hiện hành cần tái hiện, không phải mẫu cũ bỏ đi — **cao** (file vừa được thêm vào SOP/).
- Bảng đối chiếu dùng giá TT, không VAT — **trung bình** (không thấy dòng VAT nào trong 5 file; nếu sai, ledger đã có sẵn vatPct).
- "Chuyển khoản" trong Excel = thanh toán thực đã chi, không phải đề nghị — **cao** (có ngày chuyển cụ thể ở Phương Minh).
- PaymentRound hiện không ghi ledger — **cao** (đã grep toàn lib/, không có write path).
