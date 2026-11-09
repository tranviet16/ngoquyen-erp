# Báo cáo thực hiện Phase 6 — Parser chuyển đổi (module thuần)

- Ngày: 2026-11-06
- Trạng thái: **xong**. Còn một số điểm cần lưu ý, ghi ở mục cuối.
- Phạm vi: chỉ tạo tệp trong `lib/import/adapters/vat-tu-chuyen-doi/`. Không sửa tệp cũ nào, không import Prisma, không có server action.

## 1. Tệp đã tạo

| Tệp | Nội dung |
|---|---|
| `cutover-constants.ts` | Các mốc `CUTOVER_DATE` 26/10/2026, `LIFETIME_DATE` 26/12/2025, `OPENING_AS_OF` 31/12/2025, `CUTOVER_MARKER_FROM` 01/01/2026; `AMOUNT_TOLERANCE` 1; `BLOCK_DATE_TOLERANCE_DAYS` 7. `cutoverConstantsForReview()` trả các mốc dạng JSON để ghi vào `reviewJson`. |
| `day-utils.ts` | Ngày nghiệp vụ tại UTC 00:00: `utcDay`, `addDays`, `isoDay`, `vnDay`, `parseIsoDay`, `nextDay26After`, `inRange`. |
| `types.ts` | Toàn bộ kiểu public (mục 2). |
| `cell-reader.ts` | Đọc bằng `XLSX.read(..., {cellDates:false, cellNF:true})`. Mỗi ô thuộc một trong bốn loại `text` / `date` / `number` / `empty`; ngày lấy bằng `SSF.parse_date_code`; chữ chuẩn hóa NFC. Kiểm chữ ký ZIP của `.xlsx` trước khi đọc. Có lưới cho CSV. Dùng lại `normHeader` của `excel-utils.ts`. |
| `parse-issues.ts` | `IssueSink`: gom cảnh báo, lỗi chặn và quyết định ngày. |
| `amount-text.ts` | Đọc số tiền chữ kiểu `1,039,650,000`, `(126,512,852)`, `20,420,000.00`, `-`. |
| `dirty-date.ts` | `dateCandidates`, `resolveBlockDate`, `resolveNeighborDate`, `parseNlDate`. |
| `date-settlement.ts` | `settleDate` biến ngày mơ hồ thành quyết định (hoặc áp lựa chọn đã có), ngày không đọc được thành lỗi chặn. `dateDecisionKey(ref)`. |
| `block-chain.ts` | `inferBlockRanges`: suy biên thực của khối theo chuỗi "Tổng nợ" và nhãn. |
| `main-file-parser.ts` + `nhap-lieu-row-reader.ts` + `opening-balance-parser.ts` | Sheet Nhập Liệu và Số Dư Ban Đầu. |
| `csv-lifetime-parser.ts` | CSV "Tổng công nợ". |
| `tracking-file-parser.ts`, `reconciliation-sheet-reader.ts`, `daily-sheet-reader.ts`, `tracking-columns.ts`, `tracking-row-classifier.ts`, `tracking-delivery-fields.ts` | File theo dõi: khối đối chiếu (neo, tiểu mục "Cộng <công trình>", bố cục ma trận "Bê tông \| Bơm BT \| Bù cước") và sheet "Vật tư ngày". |
| `delivery-dedupe.ts` | Khử trùng theo bội số lớn nhất trong một khối hoặc mục. |
| `daily-supplement.ts` | Bổ sung phiếu chỉ có trong "Vật tư ngày". |
| `source-names.ts`, `bundle-classifier.ts` | Chuẩn hóa đường dẫn, gợi ý NCC và công trình, phân loại gói. |
| `cutover-bundle-parser.ts` | Điểm vào `parseCutoverBundle`. |
| `__tests__/` (9 test, 1 helper) | Gồm `dirty-date`, `block-chain`, `main-file-parser`, `csv-lifetime-parser`, `tracking-file-parser`, `delivery-dedupe`, `daily-supplement`, `bundle-classifier`, `real-files.smoke`; helper là `fixture-builders.ts`. |

## 2. API cho phase 7

```ts
// cutover-bundle-parser.ts
parseCutoverBundle(files: readonly BundleFile[], options?: {
  dateChoices?: DateChoices;   // { "date:<file>:<sheet>!<ô>": "yyyy-mm-dd" }
  pairKeyOf?: PairKeyFn;       // (d: TrackingDelivery) => string; mặc định NCC-file × công trình, bỏ dấu
}): CutoverBundleParseResult

interface BundleFile { path: string; buffer: Uint8Array | ArrayBuffer }

interface CutoverBundleParseResult {
  constants: CutoverConstantsJson;      // ghi vào reviewJson
  mainFile: MainFileParseResult | null; // nhapLieu.rows/skipped/readRowCount, openingBalances
  csv: CsvParseResult | null;           // rows (G,H,I,H+I,J,M,N,P,Q,flags), skipped
  trackingFiles: TrackingFileParseResult[]; // blocks (biên thực, neo, open, projectMembers), deliveries, dailyRows
  deliveries: CutoverDelivery[];        // đã khử trùng + bổ sung từ Vật tư ngày; duplicates[], afterCutover
  skipped: SkippedFile[];
  warnings: ParseWarning[];             // {code, level: warning|info, message, ref}
  blockingErrors: BlockingError[];      // {code, message, ref}
  dateDecisions: DateDecision[];        // {key, ref, candidates: Date[], reason, context, chosen}
}
```

- Mọi dòng, cảnh báo, lỗi và quyết định đều có `ref: SourceRef {file, sheet, cell, raw}`.
- Khóa nguồn:
  - Nhập Liệu: `NL#<dòng>`;
  - Số Dư: `SD#<dòng>` (kèm `mergedFrom` khi gộp);
  - CSV: `CSV#<dòng>`.
- Khóa ánh xạ công trình của phiếu nằm ở `project.mappingKey`, dạng `project-folder:<thư mục>` hoặc `project-label:<tên>`. Gợi ý NCC lấy từ tên file, ở trường `supplierHint`.
- Ngày là `Date` tại UTC 00:00. Phiếu đang chờ quyết định ngày có `date = null`, kèm `dateDecisionKey` và `dateCandidates`.
- Lỗi chặn về ngày (`date-invalid`, `date-missing`) cũng giải được bằng `dateChoices`. Khóa lấy bằng `dateDecisionKey(error.ref)`. Các dòng tiếp nối dùng chung khóa của ô ngày phía trên.
- Hàm dùng riêng lẻ: `parseMainFile(input, file)`, `parseCsvLifetime(input, file)`, `parseTrackingFile(input, path, {dateChoices})`, `dedupeDeliveries(deliveries, {pairKeyOf})`, `supplementFromDaily(refs, daily, {pairKeyOf, sink})`, `classifyBundle(files, sink)`, `inferBlockRanges(blocks)`, `cutoverConstantsForReview()`.
- `CsvLifetimeRow` cung cấp `debtTt` (J) và `debtHd` (P) để phase 7 tách dòng "CDC" theo V1.
- `ReconciliationBlock.projectMembers` là các thành viên của nhãn có "+" (ví dụ "Trại Chuối", "Tân Lộc CDC", "ĐVP - CDC"), dùng cho neo V1.

## 3. Kết quả trên thư mục thật

Parse cả thư mục mất khoảng 0,55 giây.

**File tổng:**
- Nhập Liệu: đọc **922 dòng** (dòng 5→926), dừng trước dòng ma.
  - Theo loại GD: 773 "Lấy Hàng", 149 "Trả Nợ".
  - 919 dòng được ghi nhận: `lay_hang` 771, `thanh_toan` 146, `thue_hd` 2.
  - 3 dòng 0 đồng bị bỏ: NL#816, NL#831, NL#832.
  - 3 dòng năm 0206 được sửa: NL#5 → 15/08/2026, NL#6 → 26/08/2026, NL#7 → 26/10/2026.
  - 11 dòng sau mốc.
  - 4 cảnh báo lệch Tiền VAT: I384, I386, I550, M682.
- Số Dư Ban Đầu: 73 dòng (đã kiểm lại bằng openpyxl), không có dòng trùng.

**CSV:**
- 59 dòng hợp đồng; 22 dòng bị bỏ ("Cộng", 3 dòng mồ côi sau "Cộng", 4 dòng tổng không nhãn).
- Cờ: 2 `text-in-amount` (P = "xong"), 3 `shifted-number` (L10, O72, L74), 1 `no-project`.
- Nam Hương × Tân lộc CDC: J 109.336.700, P 0. Nam Hương × ĐVP -CDC: J 44.600.000, P 27.734.400. Tổng hai dòng bằng đúng Số Dư CDC (153.936.700 / 27.734.400).

**File theo dõi: 23 file**

| File | Khối | Phiếu đối chiếu | Dòng Vật tư ngày | Quyết định | Lỗi chặn |
|---|---|---|---|---|---|
| DCX/Bê tông Hải Phòng | 1 | 3 | 3 | 0 | 0 |
| DCX/Gạch Nam Hương | 2 | 10 | 10 | 0 | 0 |
| DCX/Máy xúc Lộc Tài HT | 2 | 32 | 26 | 2 | 0 |
| DCX/Quang Minh | 2 | 48 | 48 | 0 | 0 |
| DCX/Tùng Lâm | 1 | 5 | 5 | 0 | 0 |
| DCX/Vận Chuyển Gia Bảo | 1 | 29 | 29 | 0 | 0 |
| DCX/Xi măng Phương Minh | 1 | 2 | 2 | 0 | 0 |
| MN TC1/Bê tông Hải phòng | 3 | 7 | 7 | 0 | 0 |
| MN TC1/Cát xây Quang Minh | 6 | 49 | 48 | 0 | 1 |
| MN TC1/Gạch lát Hùng Chi | 2 | 17 | 17 | 0 | 0 |
| MN TC1/Gạch Nam Hương | 5 | 12 | 12 | 0 | 0 |
| MN TC1/Lộc Tài | 5 | 12 | 12 | 0 | 0 |
| MN TC1/Thiết bị điện Việt Đức | 3 | 69 | 42 | 0 | 1 |
| MN TC1/Xi măng Anh Thư | 6 | 14 | 14 | 0 | 0 |
| MN TC2/Lộc Tài - MN2 | 2 | 7 | 7 | 0 | 0 |
| TC/Bê tông Hải Phòng | 7 | 42 | 41 | 0 | 0 |
| TC/Gạch Nam Hương | 7 | 28 | 28 | 2 | 0 |
| TC/Máy xúc Lộc Tài HT | 6 | 28 | 25 | 0 | 0 |
| TC/Quang Minh hết 30.4.26 | 2 | 32 | 32 | 0 | 0 |
| TC/Quang Minh đến 26.5.26 | 8 | 90 | 92 | 2 | 0 |
| TC/Thép Hiệu Trần | 1 | 16 | 16 | 0 | 0 |
| TC/Xi măng Anh Thư | 3 | 3 | 3 | 0 | 0 |
| TC/Xi măng Phương Minh | 7 | 15 | 15 | 1 | 0 |

**Tổng hợp file theo dõi:**
- 83 khối.
- 570 dòng phiếu đối chiếu. Sau khử trùng còn **538 phiếu**.
- 534 dòng Vật tư ngày. Tất cả đã khớp đối chiếu hoặc rơi vào ngày đối chiếu đã có phiếu, nên **0 phiếu bổ sung**.

**7 quyết định ngày.** Cả 7 thuộc loại `straddles-cutover`: ô ngày đảo trong khối 27/09→26/10, có hai cách đọc là 11/10 hay 10/11, và 12/10 hay 10/12. Vị trí:
- Lộc Tài DCX: B27, B28;
- Gạch NH TC: B255, B256;
- Quang Minh TC: B295, B296;
- Xi măng Phương Minh TC: B206.

**2 lỗi chặn**, đều giải được bằng `dateChoices`:
- Cát xây QM (MN), đối chiếu B20: ô ngày ghi "3,4,5/4/2026" (một phiếu 12 m³ trải ba ngày).
- Thiết bị điện Việt Đức, đối chiếu B116: khối 27/06→26/07 có 27 dòng không có ngày nào. Chọn ngày cho B116 thì cả nhóm dòng phía sau nhận theo.

**77 cảnh báo:**
- Mức `warning`:
  - `date-year-fixed` 20, gồm "5/13/25" và các ô tương tự của Quang Minh TC, "14/09/20260", "26/10/206", "19/4/2025";
  - `daily-conflict` 5;
  - `nl-vat-mismatch` 4;
  - `nl-year-fixed` 3;
  - các mục CSV đã nêu ở trên;
  - `block-label-reversed` 1 (Gạch NH MN A154);
  - `date-outside-block` 1 (Anh Thư TC: 27/07 nằm trong khối 27/05→26/06).
- Mức `info`:
  - `block-label-stale` 22;
  - `gtgt-line` 2;
  - `daily-undated-matched` 2;
  - `block-total-mismatch` 1 (Quang Minh TC G267: "Tổng nợ" bị trừ phần Việt Úc + DCX).

**Đối chiếu với bằng chứng:**
- Neo Bê tông HP × Trại Chuối khối 27/09→26/10 = 509.563.111.
- Quang Minh DCX khối mở 27/10→26/11 = 159.360.000.
- Gạch NH TC khối cuối = 294.445.120.
- Phiếu sau mốc có giá: đúng 11 phiếu, thành tiền khớp từng dòng Nhập Liệu sau mốc.
  - Quang Minh DCX: 4 / 4 / 8 m³.
  - Nam Hương DCX: 5.400 viên × 2 và 230,4 m² × 88.000 × 2.
  - Lộc Tài MN2: phiếu 27/10 giữ 1, khối còn lại tính là trùng.

## 4. Lệch so với spec và cách đã xử lý

1. **Gói có 23 file theo dõi, không phải 24.** Thư mục Trại Chuối có 8 file, không phải 9. Smoke test kiểm theo số thật là 23.
2. **"Khối đang mở"** là khối cuối của sheet có biên thực vượt mốc (đến sau 26/10). Câu "Tổng nợ khác chuỗi" trong spec có nhiều cách hiểu; trên dữ liệu thật, định nghĩa này cho đúng ba khối Lộc Tài MN2, Lộc Tài DCX và Quang Minh DCX.
3. **Quy tắc "một ứng viên ≤ mốc, một ứng viên > mốc"** chỉ áp cho khối có biên cuối ≥ 26/10. Áp cho mọi khối thì mâu thuẫn với test bắt buộc "08/12/2026 trong khối 27/07→26/08 → 12/08/2026", và sinh hàng chục quyết định vô nghĩa.
4. **Chuỗi khối:**
   - Khi nối chuỗi, khối luôn bắt đầu ngay sau khối trước.
   - Biên cuối là ngày 26 kế tiếp. Nếu biên cuối của nhãn (đã sửa đảo ngược) muộn hơn thì kéo dài tới đó, cho trường hợp kỳ trước không có phát sinh: Gạch NH MN cho biên 27/07→26/09.
   - Nhờ vậy nhãn gõ nhầm "25/06→26/06" của Anh Thư MN được nhận là 27/05→26/06.
5. **"Vật tư ngày":**
   - Ô ngày mơ hồ được giải trước tiên bằng phiếu đối chiếu cùng file (trùng ngày và KL), sau đó mới xét dòng lân cận.
   - Năm lệch được sửa theo khoảng ngày của đối chiếu.
   - Dòng không có ngày nhưng trùng (vật tư, KL) với đối chiếu thì bỏ qua, không chặn.
   - **Dòng lệch rơi vào ngày đối chiếu đã có phiếu thì không bổ sung, chỉ cảnh báo `daily-conflict`.** Ví dụ: Lộc Tài DCX 27/10 Vật tư ngày ghi 0,5 ca, đối chiếu ghi 1 ca × 2.800.000 (khớp Nhập Liệu); Quang Minh TC 28/04 4 m³ so với 2 m³; Quang Minh TC 22/06 ba dòng 4 m³ không ghi vật tư. Nếu làm đúng chữ "so multiset" thì sẽ thêm phiếu không giá và **tính trùng nợ** khi chốt kỳ ERP. Hiện cả 5 dòng lệch chỉ được cảnh báo, không được nhập.
6. **Lựa chọn ngày** áp được cả cho ô ngày không đọc được hoặc ô trống (cùng khóa). Lựa chọn không thuộc danh sách ứng viên vẫn được nhận, kèm cảnh báo. Lựa chọn sai định dạng là lỗi chặn.
7. **Đổi biên khi viết test:**
   - Test khối gộp Lộc Tài dùng cấu trúc thật (22/06 vào Trại Chuối; 19, 25 và 26/06 vào Dải cây xanh).
   - Test dòng GTGT 18.656.000 đặt trong khối 27/07→26/08 của cùng fixture.
   - Test "dòng tiếp nối" dùng dòng "Bù cước" không có STT và ngày, như file Bê tông HP.
8. **`types.ts` dài khoảng 315 dòng** vì chỉ chứa khai báo kiểu; giữ một tệp để phase 7 import một chỗ. `dirty-date.ts` dài 220 dòng. Các tệp còn lại đều dưới 205 dòng.

## 5. Kết quả kiểm tra

- `npx vitest run --project unit lib/import/adapters/vat-tu-chuyen-doi`: **9 file, 72 test đều pass**. Smoke test trên thư mục thật có chạy (không bị skip).
- `npx tsc --noEmit`: exit 0, **0 lỗi** trong `lib/import/adapters/vat-tu-chuyen-doi/**`. Toàn dự án cũng 0 lỗi tại thời điểm chạy.
- `npx eslint lib/import/adapters/vat-tu-chuyen-doi`: sạch, exit 0.

## Câu hỏi còn mở và lưu ý cho phase 7

1. **Khối gộp không có tiểu mục gán hết cho công trình theo thư mục.** Ví dụ Quang Minh TC từ 27/03 đến 26/06, nhãn "Trại Chuối + Dải Cây Xanh + Tiên Lãng …": phiếu của Dải Cây Xanh và Tiên Lãng trong khối được tính cho Trại Chuối. Đây là phiếu khối lượng lịch sử, không mang tiền. Bảng chẩn đoán cặp × tháng của phase 7 sẽ hiện lệch, và V1 cần dùng `projectMembers`.
2. **Hai lỗi chặn ngày cần người dùng chọn:** "3,4,5/4/2026" (Cát xây QM MN) và khối 27/06→26/07 không có ngày (Thiết bị điện Việt Đức). Nếu muốn, có thể sửa thẳng trong Excel thay vì chọn trong màn xem trước.
3. **Khuôn ánh xạ của engine không chứa được chuỗi ngày.** `ResolvedMapping` hiện là tên → id | null, nên phase 7 cần lưu `dateChoices` ở dạng `Record<string, "yyyy-mm-dd">` riêng.
4. **5 dòng `daily-conflict` nên được người dùng xác nhận.** Quan trọng nhất là Lộc Tài DCX 27/10: Vật tư ngày ghi 0,5 ca, đối chiếu ghi 1 ca.
