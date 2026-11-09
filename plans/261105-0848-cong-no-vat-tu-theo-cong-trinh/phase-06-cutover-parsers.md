---
phase: 6
title: "Parser chuyển đổi (module thuần)"
status: pending
priority: P1
effort: "14h"
dependencies: []
---

# Phase 6: Parser chuyển đổi — module thuần

<!-- Updated: Red Team 2026-11-06 — biên khối suy từ chuỗi Tổng nợ; ngày mơ hồ quanh mốc thành quyết định; tiểu mục gộp gán công trình; dừng ở dòng ma; năm 3 chữ số; ngày lũy kế 26/12/2025 -->
<!-- Updated: Validation Session 1 - Tân Lộc CDC và ĐVP-CDC là hai công trình; CSV cung cấp số tách -->

## Goal

Đọc đúng và tất định toàn bộ dữ liệu trong thư mục `Quản Lý Công Nợ/` (file tổng, CSV lũy kế, 24 file theo dõi), không chạm DB. Phase này bắt đầu được ngay.

## Files to Create

Tất cả nằm trong `lib/import/adapters/vat-tu-chuyen-doi/`:

| Tệp | Nội dung |
|---|---|
| `cutover-constants.ts` | `CUTOVER_DATE = 2026-10-26`; `LIFETIME_DATE = 2025-12-26` (ngoài cửa sổ Kỳ chuẩn T1/2026 và tuần ISO 1/2026); `OPENING_AS_OF = 2025-12-31`; `CUTOVER_MARKER_FROM = 2026-01-01`; `AMOUNT_TOLERANCE = 1` (đồng). Mốc được ghi vào `reviewJson` của run để guard toàn cục ở phase 2 đọc. |
| `types.ts` | Kiểu dữ liệu đã parse: dòng Nhập Liệu, dòng Số Dư, dòng CSV, khối đối chiếu, phiếu, cảnh báo, lỗi chặn (kèm file, sheet, ô, chữ gốc), quyết định ngày mơ hồ. |
| `cell-reader.ts` | `XLSX.read(buf, {cellDates:false, cellNF:true})`; mỗi ô thuộc loại `text` / `date` / `number` / `empty`. Ngày lấy bằng `XLSX.SSF.parse_date_code`, không qua múi giờ. Chữ chuẩn hóa NFC. |
| `dirty-date.ts` | `dateCandidates(cell)`, `resolveBlockDate(cell, blockRange, neighbors)`, `parseNlDate(cell, sheetYear)`. |
| `block-chain.ts` | Suy biên khối thực từ chuỗi khối (mục "Biên khối"). |
| `main-file-parser.ts` | Nhập Liệu và Số Dư Ban Đầu. |
| `csv-lifetime-parser.ts` | CSV "Tổng công nợ". |
| `tracking-file-parser.ts` | File theo dõi: khối đối chiếu và sheet "Vật tư ngày". |
| `delivery-dedupe.ts` | Khử trùng phiếu theo bội số lớn nhất. |
| `bundle-classifier.ts` | Phân loại file trong gói; gợi ý công trình từ thư mục, gợi ý NCC từ tên file. |

## Quy tắc đọc

**Nhập Liệu** (`main-file-parser.ts`):
- Kiểm nhãn tiêu đề dòng 3 theo vị trí: A Ngày GD, B Loại GD, C Chủ Thể, D NCC (được trống), E Dự án (được trống), F Tên Vật Tư, G–J TT, K–N HĐ, O Số HĐ, P Ngày HĐ, Q Nội dung, R Trạng Thái, S Ghi Chú. Nhãn lệch là lỗi chặn rõ ràng.
- **Dừng đọc** khi ô "Loại GD" trống. Sheet có khoảng 389 dòng chỉ chứa công thức sau dòng dữ liệu cuối.
- Năm ngoài [2000, 2100] (`0206`, `206`) thì sửa theo năm chủ đạo của sheet (2026), kèm cảnh báo.
- "Trả Nợ" → `thanh_toan` (TT và/hoặc HĐ trên cùng dòng).
- "Lấy Hàng" có tên vật tư chứa "thuế" → `thue_hd`. Các dòng "Lấy Hàng" khác → `lay_hang`; dòng chỉ có HĐ giữ TT = 0 kèm số và ngày HĐ.
- Dòng 0 đồng bị bỏ và liệt kê.
- amount = round(total / (1 + VAT%), 2), vat = total − amount; Tiền VAT trong Excel lệch quá 1 đồng thì cảnh báo.
- Mỗi dòng giữ `projectName`, `itemName`, `entityName` riêng và tham chiếu nguồn `NL#<dòng>`. Dòng sau `CUTOVER_DATE` được gắn cờ.

**Số Dư Ban Đầu:** tiêu đề ở dòng 5; asOf luôn là `OPENING_AS_OF`. Ngày "01/01/2026" trong sheet nghĩa là đầu ngày 01/01, và `period-bounds.ts:106-111` coi mốc số dư là cuối ngày asOf. Nhiều dòng cùng (Chủ thể, NCC, dự án) thì cộng lại, kèm cảnh báo.

**CSV** (`csv-lifetime-parser.ts`):
- Decode UTF-8 (bỏ BOM nếu có), đọc bằng `XLSX.read(text, {type:"string", raw:true})`.
- Dòng tiêu đề tìm theo "Tên công ty" + "Tổng phát sinh". Các cột: G = LH TT, H + I = đã trả TT, J = còn nợ TT, M = LH HĐ, N = đã trả HĐ, P = còn phải CK (HĐ), Q = tên công trình, C/D/E = hợp đồng.
- Tên NCC mang xuống các dòng hợp đồng; bỏ dòng "Cộng"; dừng ở "Tổng cộng" đầu tiên (bỏ bảng phụ). Ô `#REF!` gắn cờ; ô số lệch cột (ví dụ cột L chứa 254.670.000) gắn cờ.
- Kiểm J = G − (H+I) với dung sai 1 đồng; lệch thì cảnh báo. Dòng thiếu Q gắn cờ "không xác định cặp".
- Giữ nguyên tên công trình nguồn ("Tân lộc CDC", "ĐVP -CDC", "ĐVP CDC"…). Phase 7 ánh xạ "Tân Lộc CDC" và "ĐVP-CDC" thành **hai công trình** (quyết định validate). Hai cột còn nợ J và P cung cấp số để tách dòng "CDC" trong Số Dư Ban Đầu.

**File theo dõi** (`tracking-file-parser.ts`):
- Mỗi file mặc định thuộc (NCC theo tên file, công trình theo thư mục). Đọc các sheet "Đối chiếu công nợ*" (nguồn chính, có giá) và "Vật tư ngày"; bỏ "Vật tư tháng*" và "SGV".
- Khối bắt đầu ở dòng `Số công nợ … từ ngày X đến (hết) ngày Y`, kèm nhãn "Công trình:" và "Tên vật tư:" của khối. Tiêu đề cột dò lại cho từng khối: STT, Ngày, [Tên VT], Khối lượng, ĐVT, Đơn giá, Thành tiền.
- Dòng phiếu hợp lệ có KL > 0:
  - Dòng tiếp nối (không có STT và ngày, ví dụ "Bơm BT | 1 | ca") lấy ngày của dòng trên.
  - Bỏ dòng tổng phụ (Tổng…, "Cộng P/S", Dư nợ…, A/B/C/D, "Tổng cát xây Việt Trì"), dòng mẫu 0 đồng, và dòng GTGT/VAT/thuế (liệt kê ở mục thông tin; thuế vào sổ qua Nhập Liệu).
- **Tiểu mục gộp:** dòng "Cộng <tên công trình>" (khác "Cộng P/S") gán các dòng phiếu phía trên nó, kể từ tiểu mục trước, cho công trình đó qua khóa ánh xạ `project-label:<tên>`. Ví dụ khối Lộc Tài trong file Trại Chuối: "Cộng Trại Chuối", rồi "Cộng dải cây xanh". Phiếu thuộc công trình khác thư mục vẫn được khử trùng chéo với file của công trình đó.
- Tên vật tư lấy theo thứ tự: cột vật tư của dòng → mô tả của dòng → nhãn "Tên vật tư" của khối.
- Neo của khối gồm A, B, C, "Tổng nợ", và tập công trình theo nhãn (nhãn có "+" tách ra thành viên).
- "Vật tư ngày" chỉ bổ sung phiếu còn thiếu trong đối chiếu (so multiset theo ngày, KL, ĐVT). Các phiếu này không có giá, kèm CB vật tư / CHCT / KT.

**Biên khối** (`block-chain.ts`): nhãn biên trong file không đáng tin. Có khối chứa ngày ngoài nhãn (Xi măng Anh Thư dòng 82), có nhãn lặp cho khối đang ghi dở (Lộc Tài MN2 dòng 45, Lộc Tài DCX dòng 68), có nhãn đảo ngược (Gạch NH MN dòng 154). Biên thực được suy theo thứ tự ưu tiên:
1. Khối nối chuỗi khi "Dư nợ mang sang" (A) của khối = "Tổng nợ" của khối trước. Biên của khối = (biên cuối khối trước + 1) → ngày 26 kế tiếp.
2. Nếu chuỗi đứt thì dùng nhãn, sửa nhãn đảo ngược thành ngày 26 đầu tiên sau from.
3. Khối cuối có "Tổng nợ" khác chuỗi (đang ghi dở) được đánh dấu "khối đang mở".

**Ngày bẩn** (`dirty-date.ts`):
- Ô ngày sinh hai ứng viên: giữ nguyên, và đảo ngày/tháng khi ngày ≤ 12 (vì Excel đã đảo).
- Ô chữ đọc `d/m/yyyy`. Năm 5 chữ số ("20260") lấy 4 chữ số đầu; năm 3 chữ số ("206") hoặc lệch so với khối (`19/4/2025` trong khối 4/2026) thì dùng năm của khối, kèm cảnh báo.
- Chọn ứng viên:
  - Có **một** ứng viên hợp lệ về lịch (ví dụ ngày > 12) → nhận, kèm cảnh báo nếu nằm ngoài biên khối thực ±7 ngày. **Không chặn.**
  - Có hai ứng viên → chọn ứng viên duy nhất nằm trong biên khối thực.
  - Cả hai đều trong biên, hoặc phiếu thuộc "khối đang mở", hoặc một ứng viên ≤ mốc và một ứng viên > mốc → sinh **quyết định ngày** để người dùng chọn trong xem trước. Ví dụ ô "10/11/2026" trong khối DCX đang mở: 10/11 hay 11/10.
  - Không có ứng viên nào → lỗi chặn kèm file, sheet, ô, chữ gốc.
- "Vật tư ngày" không có biên khối: dùng ứng viên nằm giữa ngày của dòng trước và dòng sau đã giải; mơ hồ thì sinh quyết định ngày.

**Khử trùng** (`delivery-dedupe.ts`): theo (NCC, công trình), khóa (ngày đã giải, vật tư chuẩn hóa, KL, đơn giá). Số lần giữ = số lần xuất hiện **lớn nhất trong một khối hoặc sheet**: hai chuyến giống nhau trong cùng khối là 2; một phiếu lặp ở hai khối hoặc hai file chỉ là 1.

**Phân loại gói** (`bundle-classifier.ts`):
- File tổng: có sheet "Nhập Liệu" và "Số Dư Ban Đầu".
- CSV: đuôi `.csv` và có "Tổng phát sinh".
- File theo dõi: `.xlsx` trong thư mục con, có sheet bắt đầu bằng "Đối chiếu công nợ" hoặc "Vật tư ngày".
- Còn lại bị bỏ qua và liệt kê. Phải có đúng 1 file tổng và tối đa 1 CSV.

## Tests

Tất cả trong `lib/import/adapters/vat-tu-chuyen-doi/__tests__/`, fixture dựng bằng `XLSX.utils.aoa_to_sheet` theo layout thật.

- `dirty-date.test.ts`:
  - Ô ngày (2026, 11, 4) trong khối 01/04→27/04 → 11/04/2026.
  - "08/12/2026" trong khối 27/07→26/08 → 12/08/2026.
  - Chữ `27/10/2026` giữ nguyên.
  - `19/4/2025` → 19/04/2026 (cảnh báo).
  - `14/09/20260` → 14/09/2026.
  - `26/10/206` → 26/10/2026.
  - Ô "10/11/2026" trong khối đang mở → quyết định ngày.
  - Ô chỉ có một ứng viên nhưng ngoài biên → nhận kèm cảnh báo, không chặn.
- `block-chain.test.ts`:
  - Xi măng Anh Thư: khối nhãn 26/4→26/5 chứa 27/07 được xếp lại theo chuỗi Tổng nợ.
  - Lộc Tài MN2: khối lặp nhãn 27/09→26/10 được nhận là khối đang mở.
  - Nhãn đảo ngược được sửa.
- `main-file-parser.test.ts`:
  - Tiêu đề D/E trống vẫn đọc được NCC và dự án.
  - 3 dòng năm lạ được sửa.
  - Dừng ở dòng có "Loại GD" trống.
  - Dòng chỉ HĐ; dòng "Thuế hóa đơn" → `thue_hd`; "Trả Nợ" đôi TT/HĐ; dòng 0 đồng bị bỏ.
  - Dòng sau 26/10 được gắn cờ.
- `csv-lifetime-parser.test.ts`:
  - Nam Hương × Tân lộc CDC: G 1.039.650.000, I 930.313.300, J 109.336.700, M 1.380.713.400, N 1.380.713.400.
  - Nam Hương × ĐVP-CDC: J 44.600.000, P 27.734.400. Tổng J của hai dòng = 153.936.700 = Số Dư CDC TT.
  - Dòng "Cộng" và bảng phụ bị bỏ; `#REF!` và ô lệch cột được gắn cờ.
- `tracking-file-parser.test.ts`:
  - Khối 27/09→26/10 của Bê tông HP × Trại Chuối: Tổng nợ 509.563.111, chứa dòng 27/10 18 m³ × 1.610.000.
  - Khối gộp Lộc Tài: 22/06 1 ca × 2.600.000 gán Trại Chuối; 19/06, 25/06, 26/06 gán Dải cây xanh qua tiểu mục.
  - Dòng GTGT 18.656.000 bị loại; dòng tiếp nối lấy ngày dòng trên.
- `delivery-dedupe.test.ts`:
  - Lộc Tài MN2 27/10 ở hai khối → 1.
  - Nam Hương DCX 5.400 viên × 1.350, hai dòng một khối → 2.
  - Hai file Quang Minh Trại Chuối → bội số lớn nhất.
  - Phiếu Dải cây xanh trong khối gộp của file Trại Chuối trùng với file DCX → 1.
- `bundle-classifier.test.ts`: phân loại đúng; bỏ qua `.claude/`.
- `real-files.smoke.test.ts` (`skipIf` khi không có thư mục `Quản Lý Công Nợ/`):
  - Nhập Liệu 922 dòng (773 Lấy Hàng, 149 Trả Nợ), dòng năm lạ được sửa, dừng trước dòng ma.
  - Đọc được 24 file theo dõi; mọi ngày được giải, hoặc được liệt kê thành quyết định, hoặc lỗi chặn kèm vị trí.
  - Các phiếu 27–31/10 khớp danh sách trong gói bằng chứng.

## Ownership & Rollback

- Sở hữu: các tệp parser ở trên trong `lib/import/adapters/vat-tu-chuyen-doi/`. Không sửa tệp cũ nào.
- Rollback: xóa các tệp.

## Verification

- `npx vitest run --project unit lib/import/adapters/vat-tu-chuyen-doi`
- `npx tsc --noEmit`
