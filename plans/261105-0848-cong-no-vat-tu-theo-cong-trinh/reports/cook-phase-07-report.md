# Báo cáo Phase 7 — Adapter `vat-tu-chuyen-doi`: duyệt, ghi, đối soát

Ngày: 2026-11-06. Trạng thái: **xong code + unit + smoke thư mục thật**. **Integration chưa chạy** (Docker tắt, `localhost:5433` không có DB `_test`; không migrate/deploy DB nào). Chưa commit.

## 1. Kiểm tra (lệnh chạy thật)

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | exit 0, **0 lỗi** (gồm cả test integration mới) |
| `npx vitest run --project unit` (toàn bộ) | **111 file / 1131 test pass** |
| `npx vitest run --project unit lib/import` | 23 file / 186 test pass (14 file của thư mục chuyển đổi) |
| `npx eslint` trên mọi tệp phase này tạo/sửa | exit 0, không cảnh báo |
| `test/integration/vat-tu-chuyen-doi-import.integration.test.ts` | **KHÔNG CHẠY** (Docker tắt). Đã typecheck + lint; một reviewer đọc tĩnh xác nhận từng assertion khớp code service thật |

Cách chạy khi có Docker: `npx prisma migrate deploy` trên DB `*_test` của `.env.test`, rồi `npx vitest run --project integration test/integration/vat-tu-chuyen-doi-import.integration.test.ts`.

## 2. Tệp

**Tạo trong `lib/import/adapters/vat-tu-chuyen-doi/`** (không sửa tệp parser phase 6):
- `mapping-keys.ts`: khóa / giá trị ánh xạ, mã xác nhận (ack), `cutoverMappingSchema` (zod theo tiền tố khóa).
- `name-collect.ts`, `name-resolution.ts`, `name-resolution-views.ts`: gom tên nguồn, giải ánh xạ (tự điền trùng khít, tạo mới, chặn trùng tên, Chủ thể của công trình), dữ liệu hiển thị.
- `cdc-split.ts`, `pair-lifetime.ts`, `post-cutover-matching.ts`: thuần, theo spec.
- `anchor-blocks.ts`, `parse-with-mapping.ts`, `plan-types.ts`, `plan-pairs.ts`, `plan-deliveries.ts`, `plan-post-cutover.ts`, `plan-nl-rows.ts`, `plan-markers-guard.ts`, `plan-views.ts`, `cutover-plan.ts`: lớp lập kế hoạch thuần (không DB).
- `review-db-facts.ts`, `review-builder.ts`: đọc DB, khóa, chạy thử trong SAVEPOINT, dựng payload.
- `apply-cutover.ts`: ghi theo thứ tự; `verification-queries.ts`: V1–V4 + chẩn đoán cặp × tháng bằng SQL.
- `vat-tu-chuyen-doi.adapter.ts`; `review-payload-types.ts` (hợp đồng payload ↔ UI, chỉ kiểu).
- Test: `__tests__/{cdc-split, pair-lifetime, post-cutover-matching, cutover-plan.synthetic, cutover-plan.real-folder.smoke}.test.ts`, fixture `__tests__/cutover-synthetic-bundle.ts` (dùng chung với integration).

**Sửa**: `lib/import/adapters/adapter-registry.ts` (import + một dòng), `lib/import/__tests__/adapter-registry.test.ts` (thêm adapter gói), `app/(app)/admin/import/[runId]/adapter-review-components.tsx` (đăng ký).

**UI tạo trong `app/(app)/admin/import/[runId]/`**: `cutover-review.tsx` (thanh "Lưu & tính lại", mục 1 Tóm tắt, mục 2 Lỗi chặn theo nhóm, tóm tắt sau khi ghi), `cutover-review-mapping.tsx` (3), `cutover-review-pairs.tsx` (4 Tách CDC, 5 Duyệt từng cặp kèm lọc "Chỉ dòng lệch" và 3 danh sách CSV/Số Dư), `cutover-review-dates-verification.tsx` (6, 7), `cutover-review-post-cutover.tsx` (8–11), `cutover-review-ui.tsx` (bảng dùng `components/sortable-table`, ô xác nhận hiện người / thời điểm).

**Integration**: `test/integration/vat-tu-chuyen-doi-import.integration.test.ts` (ca 1–7; fixture tạo công trình có `entityId`; ca 7 giả lập V2 lệch bằng `vi.mock` bọc `runVerification`).

## 3. Lệch so với spec (kèm lý do)

1. **Khóa tên dùng tên chuẩn hóa** (NFC, gộp khoảng trắng, chữ thường, giữ dấu), ví dụ `project:cống hộp - tiên lãng@lưu minh xuân`. Nhờ đó "Dải cây xanh" và "Dải Cây Xanh" là một khóa. UI hiển thị tên gốc.
2. **Giá trị**: `"new"` / `"new:<tên>"` (tạo mới, có thể đặt tên khác, ví dụ "Tiên Lãng (Việt Úc)") và `"split"` (CDC).
   - `project-csv/folder/label` cũng nhận `"new:<tên>"`, trỏ tới công trình sẽ tạo trong run. Chủ thể lấy từ khóa `project:` cùng tên, hoặc từ dòng CDC khi là đích tách. Không có nguồn Chủ thể thì chặn.
   - `project-csv` nhận `null` (bỏ dòng CSV). Lý do: Số Dư mới là nguồn nợ; dòng bỏ được liệt kê ở "Dòng CSV không dùng".
   - Lý do chung: khỏi bắt tạo trước Tân Lộc CDC / ĐVP-CDC trong Master data.
3. **Thêm khóa quyết định khớp chéo mốc** `xmatch:<NL#>:<id sổ>` = `drop` / `keep`. Spec đòi có quyết định nhưng bảng khóa chưa có. `keep` cần thêm `ack:xmatch:…`.
4. **"Phiếu ≤ mốc ở cặp không có tiền" là mục cần xác nhận**, không phải lỗi chặn. Trên dữ liệu thật, Tùng Lâm và Vận Chuyển Gia Bảo (DCX) có phiếu nhưng không có dòng tiền nào trong Nhập Liệu, Số Dư hay CSV, nên nếu chặn thì không ghi được.
5. **Chạy thử marker**: không gọi `freezeReconciliationSnapshot` mà gọi `computeReconciliation`, chỉ đọc, cùng mã. Lý do: UPDATE qua audit extension ghi audit bằng kết nối riêng và không rollback, nên xem trước sẽ để lại audit rác.
   - Theo review: khi commit, marker được đông cứng **sau khi V1–V4 đạt**, vẫn trong cùng transaction. Nhờ vậy đối soát lệch không để lại audit.
6. **V1 khi commit**: review pha commit không ghi nên không tính được V1. `apply` kiểm V1 từ DB. Mã ack chứa số chênh, nên số lệch phải đúng số đã xác nhận ở xem trước.
   - Nếu khác, ném `ImportPreconditionError`: run giữ `preview`, chỉ cần Lưu & tính lại rồi xác nhận.
   - V2–V4 lệch thì ném `ImportError`: rollback và run thành `failed`.
7. **Khóa** (sửa theo review, tránh deadlock):
   - Adapter **không khai báo `lockScope`**. review / apply tự khóa theo thứ tự:
     1. dòng run (`FOR KEY SHARE`);
     2. mọi NCC đã giải, gồm cả NCC tự điền, một lần, tăng dần;
     3. khóa advisory theo adapter (chỉ pha commit), để guard độc quyền không có race giữa hai commit có tập NCC khác nhau.
   - Như vậy cùng thứ tự "dòng run → NCC" với commit / hoàn tác của engine.
   - Mọi đọc được guard bảo vệ đều chạy sau khi đã khóa.
8. **Số dư 0 / 0 chọn ròng thì không ghi** dòng số dư (không có gì để ghi). Nhập Liệu ngày < 01/01/2026 bị chặn (dữ liệu thật không có).
9. **Danh mục tạo bằng INSERT thô** để không có audit trong chạy thử.
   - Mã công trình `CDVT-0001…`, mã vật tư `VTCD-0001…`; ĐVT "ca" → loại `machine`.
   - Danh mục không mang `importRunId`, nên hoàn tác vẫn giữ, khớp phase 5.
10. **Trạng thái dòng sổ** lấy theo cột "Trạng Thái": Đã thanh toán → `paid`, Chờ thanh toán → `pending`, còn lại → `approved`. Trạng thái không ảnh hưởng số dư. LH26 / Trả26 tính theo Loại GD, gồm cả dòng thuế HĐ "Lấy Hàng".
11. **V3 tính trên dòng của run**, cộng "Lấy Hàng" sau mốc, "Trả Nợ" đã khớp ERP và dòng bị bỏ do khớp chéo. Thanh toán ERP ngoài run không thuộc cơ sở của CSV.
12. Phiếu được trừ phần đã có trong ERP theo multiset, áp cho **mọi ngày** chứ không chỉ sau mốc.
13. Thanh toán ERP đem ra so khớp là các dòng có ngày ≥ 24/10 (± 3 ngày quanh 27/10). Khớp chéo chỉ xét thanh toán từ đợt có ngày > mốc.

## 4. Smoke trên thư mục thật (lớp kế hoạch thuần, không DB)

Ánh xạ giả lập dựng từ các tên trùng khít với Nhập Liệu / Số Dư, cộng bí danh đã biết (CSV, tên file, thư mục, nhãn gộp). Danh mục vật tư để rỗng.

**Chặn và xác nhận:**
- Không còn lỗi chặn về ánh xạ, Chủ thể, ngày hay cấu trúc. 7 quyết định ngày và 2 ô ngày lỗi được chọn qua khóa `date:`.
- Còn 1 lỗi chặn: tách CDC của Đại Ngàn lệch HĐ −273 (CSV P = 273), cần chọn công trình nhận phần chênh và xác nhận.
- 2 mục cần xác nhận "phiếu ở cặp không có tiền": Tùng Lâm × DCX và Vận Chuyển Gia Bảo × DCX.

**Bảng cặp (92 cặp):**
- 41 cặp mặc định lũy kế.
- 57 cặp có CSV. Lệch TT 6 cặp, lệch HĐ 12 cặp, vì CSV "đến 26.7.26" đã cũ.
- 19 cặp chỉ có CSV, không có Số Dư; 30 cặp có Số Dư ≠ 0 mà CSV không có.

**Tách CDC:**

| NCC | Kết quả |
|---|---|
| Nam Hương | khớp: Tân Lộc CDC 109.336.700 / 0, ĐVP-CDC 44.600.000 / 27.734.400 |
| Bê tông HP | khớp: ĐVP-CDC 269.635.000 / 269.807.000 |
| Khánh Đức | khớp: ĐVP-CDC 16.570.000 / 0 |
| Đại Ngàn | lệch HĐ −273, cần quyết định |

**Số dòng sẽ ghi:**
- 37 dòng số dư ròng; 64 dòng lũy kế (32 cặp); 908 dòng Nhập Liệu ≤ mốc; 0 dòng "Trả Nợ" sau mốc.
- Phiếu: 527 tới mốc + 11 sau mốc = 538.
- 95 marker.

**Sau mốc:** 11/11 dòng "Lấy Hàng" ghép được với phiếu trong gói.

**Danh mục sẽ tạo:** 4 NCC (Tùng Lâm, Vận Chuyển Gia Bảo, Khang Trang Phát, Nhật Nguyệt) và 132 vật tư.

**V1 dự phóng (23 neo): 16 khớp.**
- Bê tông HP × Trại Chuối 509.563.111; Nam Hương nhóm TC + Tân Lộc CDC + ĐVP-CDC 294.445.120; Quang Minh DCX 152.160.000; Lộc Tài MN2 261.780.000; …
- 7 lệch (cần xác nhận sau khi chạy thử):

| Neo | Chênh | Ghi chú |
|---|---|---|
| Lộc Tài DCX | +92.844.188 | Khối gộp "Trại Chuối + Dải cây xanh": mỗi file chỉ tính công trình của thư mục. Tổng hai file = 225.994.188 = số dự phóng |
| Lộc Tài TC | +133.150.000 | như trên |
| Gạch lát Hùng Chi MN | −60.000.000 | |
| TBĐ Việt Đức MN | −39.523.807 | |
| Quang Minh TC "hết 30.4.26" | −227.200.000 | |
| Thép Hiệu Trần | −110.563.550 | |
| Xi măng Phương Minh TC | −24.010.000 | |

Số trên là dự phóng từ dòng kế hoạch, chưa phải số đọc từ DB. Màn xem trước tính lại bằng SQL sau khi chạy thử ghi.

## 5. Người vận hành sẽ thấy và làm ở go-live

1. **Trước khi tải thư mục lên:**
   - Gán Chủ thể cho các công trình đang có (Master data > Công trình). Công trình seed từ "Cài Đặt" chưa có `entityId`, nên sẽ hiện lỗi "chưa có Chủ thể".
   - Soát các đợt thanh toán `vat_tu` còn mở của các NCC trong run: đợt đã chi thì đóng; đợt chưa chi thì để nguyên và xác nhận từng đợt ở màn xem trước (xem mục "Follow-up" bên dưới).
   - Xuất lại CSV đúng giờ đóng băng.
2. **Tải thư mục `Quản Lý Công Nợ` (adapter "Chuyển đổi công nợ vật tư từ Excel"), rồi ở trang run:**
   - **Mục 3 – Ánh xạ:** chọn đích cho các khóa còn đỏ: bí danh NCC trong CSV, công trình CSV / thư mục / nhãn, NCC kiểu nhân công trong Số Dư. Tiên Lãng dùng "Tạo mới với tên khác…" (Việt Úc / SH). Tân Lộc CDC / ĐVP-CDC: chọn có sẵn hoặc tạo mới.
   - **Mục 4 – Tách CDC:** chọn công trình nhận phần chênh của Đại Ngàn và xác nhận.
   - **Mục 6 – Ngày:** chọn 7 ngày mơ hồ và nhập ngày cho 2 ô lỗi.
   - **Mục 5 – Cặp:** soát bảng cặp, đổi lũy kế / ròng nếu cần (cặp lệch chọn lũy kế phải xác nhận).
   - **Mục 10 – Phiếu:** xác nhận 2 cặp phiếu không có tiền.
   - Bấm "Lưu & tính lại".
3. **Sau lần chạy thử (mục 7):**
   - Xác nhận từng neo V1 lệch sau khi soát.
   - V2–V4 phải đạt; nếu không, nhóm "Đối soát" chặn ghi.
   - Mục 8: 11/11 "Lấy Hàng" phải đã ghép phiếu.
4. **Bấm Ghi:** một transaction ghi danh mục, số dư / lũy kế, Nhập Liệu, phiếu và marker (đã ký, note "Chuyển đổi từ Excel đến 26/10/2026 — import #N"), chạy đối soát rồi đổi trạng thái thành `committed` kèm `expected.cutoverDate = "2026-10-26"`.
5. **Sau khi ghi:** guard mốc chặn mọi ghi ngày ≤ 26/10. Kỳ gợi ý của mỗi cặp là 27/10 → 26/11. Hoàn tác được cho tới khi có kỳ ERP được ký, có event trên phiếu của run, hoặc có `dieu_chinh` mới.

## Câu hỏi còn mở

- Mục 4 ở §3 (phiếu ở cặp không có tiền là mục cần xác nhận, không phải lỗi chặn): người dùng có đồng ý không? Nếu muốn chặn cứng thì Tùng Lâm và Gia Bảo cần nguồn tiền hoặc bị loại khỏi gói.
- 7 neo V1 lệch là lệch thật của Excel (khối gộp tự mâu thuẫn, nhãn cũ). Cần người dùng soát trước khi xác nhận.
- Integration và chạy thử trên DB thật (thời gian commit, khoảng 95 marker) cần đo khi có Docker.

## Follow-up: đợt thanh toán còn mở

Người dùng chọn "Xác nhận từng đợt", nên đợt `vat_tu` còn mở không còn là lỗi chặn cứng.

**Quy tắc mới** (`plan-open-rounds.ts`, gọi từ `plan-post-cutover.ts`):
- Mỗi đợt `draft` / `submitted` / `approved` có dòng `vat_tu` của các NCC trong run được liệt kê. Mỗi đợt hiện id, tháng-số đợt, trạng thái, và các dòng (NCC, công trình, số đề nghị, số duyệt).
- Mỗi đợt cần xác nhận `ack:open-round:<id>:<tổng>`, nhãn "Đợt #… chưa chi và chưa có trong Nhập Liệu".
  - Tổng = Σ (số duyệt nếu có, không thì số đề nghị). Đợt đổi số thì phải xác nhận lại.
  - Chưa xác nhận thì nút Ghi bị khóa (thiếu xác nhận), nhưng không phải lỗi chặn.
- Đợt có dòng trùng số tiền (± 1 đồng) với một dòng "Trả Nợ" của Nhập Liệu cùng NCC × công trình, ở mọi ngày trước hay sau mốc, là **lỗi chặn**. Nhóm lỗi là "Đợt thanh toán vật tư còn mở trùng Trả Nợ"; màn hình liệt kê NL#, ngày và số tiền của dòng trùng. Đợt này hết chặn khi chọn `round:<id>`:
  - `drop-nl`: bỏ các dòng Nhập Liệu trùng khỏi lần import. Các dòng này được tính vào phần "bị bỏ" của V3. Dòng sau mốc bị bỏ không đem ghép thanh toán ERP nữa; dòng ≤ mốc bị bỏ không đem kiểm khớp chéo nữa.
  - `keep`: giữ cả hai. Xác nhận của đợt chính là lời khẳng định đó là hai khoản khác nhau.
- Dòng của đợt thiếu công trình, hoặc thuộc cặp khác, không bị coi là trùng.
- Kiểm khớp chéo mốc với đợt **đã đóng** giữ nguyên.

**Tệp:**
- Lib: `plan-open-rounds.ts` (mới), `plan-post-cutover.ts`, `plan-types.ts` (thêm `roundId`, `soDeNghi`, `soDuyet`), `review-db-facts.ts`, `mapping-keys.ts` (khóa `round:`, mã `open-round`, luật zod), `review-payload-types.ts` (`OpenRoundView` theo đợt), `cutover-plan.ts` (nhãn nhóm lỗi).
- UI: `cutover-review-post-cutover.tsx` — mỗi đợt một thẻ: bảng dòng, các dòng NL trùng, nút chọn quyết định, ô xác nhận.
- Test: `post-cutover-matching.test.ts` (sửa ca chặn cứng cũ, thêm 3 ca: không trùng, trùng + drop-nl / keep, thiếu công trình / khác cặp). Integration thêm ca 8: một đợt không trùng và một đợt trùng "Trả Nợ" 28/10. Sau `drop-nl` và hai xác nhận, commit ghi 8 dòng sổ thay vì 9. Ca này chưa chạy vì Docker tắt.
- Tài liệu:
  - `reports/go-live-runbook.md`: bước 5.1 thay "đóng hoặc hủy" bằng luồng xác nhận từng đợt, và ghi rõ không có thao tác UI nào hủy được đợt `approved` (`deleteRound` từ chối approved / closed, `rejectRound` chỉ nhận submitted). Cũng sửa bước 9.6 và mục kiểm tra phase 7.
  - `docs/system-architecture.md`: dòng "đợt còn mở là lỗi chặn".
  - `docs/user-guide/admin.md`: bước 3 của import chuyển đổi.

**Phiếu ≤ mốc ở cặp không có tiền:** đã kiểm, vẫn là mục cần xác nhận (`ack:no-money:…`), không chặn cứng. Không đổi.

**Kiểm tra:**
- `npx tsc --noEmit`: 0 lỗi.
- `npx vitest run --project unit lib/import`: 23 file / 188 test pass, gồm smoke thư mục thật.
- `npx eslint` trên các tệp đã sửa: sạch.
