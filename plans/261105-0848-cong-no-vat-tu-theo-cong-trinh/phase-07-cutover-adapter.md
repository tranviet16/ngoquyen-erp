---
phase: 7
title: "Adapter chuyển đổi: duyệt, ghi, đối soát"
status: pending
priority: P1
effort: "18h"
dependencies: [2, 5, 6]
---

# Phase 7: Adapter `vat-tu-chuyen-doi` — duyệt, ghi, đối soát

<!-- Updated: Red Team 2026-11-06 — quy tắc sau mốc chống tính trùng (bỏ "ghi như dòng sổ", đối chiếu thanh toán ERP, đợt vat_tu còn mở); marker cho mọi cặp từ 01/01/2026; guard độc quyền = guard hoàn tác; đối soát một đường mã; công trình phải có Chủ thể trước; review do adapter hiển thị -->
<!-- Updated: Validation Session 1 - tách số dư "CDC" thành Tân Lộc CDC và ĐVP-CDC theo CSV -->

## Goal

Một lần chạy import nạp đủ dữ liệu Excel. Lần chạy có duyệt (ánh xạ, tách CDC, từng cặp, ngày mơ hồ, khớp sau mốc, neo), ghi nguyên tử, không tính trùng trước hay sau mốc. Đối soát V1–V4 dùng chung một đường mã cho xem trước và commit.

## Files to Create / Modify

Tạo trong `lib/import/adapters/vat-tu-chuyen-doi/`:

| Tệp | Nội dung |
|---|---|
| `name-resolution.ts` | Các khóa ánh xạ (bảng dưới). Tự điền khi tên chuẩn hóa trùng khít; đề xuất "Tạo mới". Cấm tạo trùng tên đang có. NCC, công trình, Chủ thể không có lựa chọn "Bỏ qua", vì bỏ qua là mất nợ. |
| `cdc-split.ts` (thuần) | Tách dòng Số Dư "CDC" của từng (Chủ thể, NCC) sang "Tân Lộc CDC" và "ĐVP-CDC" theo số còn nợ của CSV (J cho TT, P cho HĐ). Tổng tách khác Số Dư, hoặc CSV thiếu, thì sinh quyết định "phần chênh / toàn bộ dồn vào công trình nào", kèm `ack`. |
| `pair-lifetime.ts` (thuần) | So sánh CSV với Số Dư theo cặp; giá trị mặc định; cờ cấm. |
| `post-cutover-matching.ts` (thuần) | Ghép dòng Nhập Liệu sau mốc với phiếu và với thanh toán ERP; phát hiện khớp chéo mốc. |
| `review-builder.ts` | Đọc danh mục và dữ liệu đang có một lần; chạy guard; dựng `payload`, `blocking`, `requiredAcks`. |
| `apply-cutover.ts` | Ghi theo thứ tự ở mục "Thứ tự ghi"; INSERT theo lô; ném lỗi ngay khi có lỗi. |
| `verification-queries.ts` | SQL đối soát V1–V4 trên DB (dùng cho cả xem trước lẫn commit), cộng bảng chẩn đoán cặp × tháng. |
| `vat-tu-chuyen-doi.adapter.ts` | `name: "vat-tu-chuyen-doi"`, label "Chuyển đổi công nợ vật tư từ Excel (cả thư mục)", `acceptsBundle: true`, `supportsRollback: true`, `lockScope` = mọi NCC đã ánh xạ. |

Tạo / sửa ngoài thư mục:
- `app/(app)/admin/import/[runId]/cutover-review.tsx` (client): hiển thị `payload` của adapter. Đăng ký vào `adapterReviewComponents` (phase 5).
- `lib/import/adapters/adapter-registry.ts`: đăng ký adapter (một dòng).

## Khóa ánh xạ

| Khóa | Nguồn | Giá trị |
|---|---|---|
| `entity:<tên>` | Chủ thể trong Nhập Liệu / Số Dư | id, tạo mới |
| `supplier:<tên chuẩn hóa>` | Nhập Liệu, Số Dư, CSV (bí danh như "Cty (Anh Công)" → Khánh Đức, "Cty Hiệu Trần (Anh Hiếu)" → Thương Hiệu Trần), tên file theo dõi ("Thép Hiệu Trần ( chú Hiếu )") | id, tạo mới |
| `project:<tên>@<Chủ thể>` | Nhập Liệu, Số Dư ("Cống hộp - Tiên lãng@Lưu Minh Xuân" → Tiên Lãng (Việt Úc); "@Lê Văn Huyên" → Tiên Lãng (SH)). "CDC@<Chủ thể>" ánh xạ sang **tách** (xem `cdc-split.ts`). | id, tạo mới (Chủ thể lấy từ khóa) |
| `project-csv:<tên>` | CSV ("Ngô quyền Trại chuối" → Trại Chuối; "Tân lộc CDC" → Tân Lộc CDC; "ĐVP -CDC", "ĐVP CDC" → ĐVP-CDC; "Tiên Lãng (Việt Úc)", "Tiên Lãng (SH)") | id |
| `project-folder:<thư mục>` | Thư mục file theo dõi ("Mầm Non TC1" → Mầm non Trại chuối; "Mầm Non TC2" → Mầm non GĐ2; "Dải Cây Xanh" → Xây dựng Dải cây xanh) | id |
| `project-label:<tên>` | Tiểu mục "Cộng <tên>" và thành viên nhãn gộp ("Tân Lộc CDC", "ĐVP - CDC") | id, null (chỉ bỏ khỏi neo) |
| `item:<tên chuẩn hóa>` | File theo dõi (bắt buộc), Nhập Liệu (tùy chọn) | id, tạo mới (mặc định tạo mới theo tên khi không trùng; ĐVT "ca" → loại `machine`) |
| `pair:<s>:<p>` | Duyệt từng cặp | 1 = lũy kế, 0 = ròng |
| `cdc:<s>@<Chủ thể>` | Tách CDC | id công trình nhận phần chênh |
| `date:<file>:<ô>` | Ngày mơ hồ (phase 6) | ngày được chọn |
| `ack:<mã>` | Xác nhận lệch neo, lũy kế cho cặp lệch, tách CDC lệch, khớp chéo mốc | 1 (ghi kèm người và thời điểm) |

Ràng buộc:
- Công trình **đã có** trong ERP mà `entityId` NULL là lỗi chặn ("Gán Chủ thể ở Master data > Công trình rồi Lưu & tính lại"). Import không tự gán, nên hoàn tác không phải trả lại gì.
- Công trình "Tạo mới" nhận Chủ thể từ khóa. Công trình đã có Chủ thể khác Chủ thể của dòng nguồn thì chặn.
- Nhiều tên nguồn trỏ về cùng một id là hợp lệ (cộng dồn).

## Duyệt từng cặp (D3)

- Với mỗi cặp (Chủ thể theo `Project.entityId`, NCC, công trình; Số Dư CDC đã tách):
  - S = Số Dư (TT, HĐ).
  - LH26 / Trả26 = tổng Nhập Liệu 2026 của cặp (TT, HĐ), gồm cả dòng sau 26/10, vì CSV là số hiện hành.
  - Từ CSV: G, H+I, M, N, cộng các dòng hợp đồng cùng cặp.
- Kiểm TT: (G − LH26) − (H+I − Trả26) = S_TT ± 1 đồng. HĐ kiểm tương tự với M, N.
- Quyết định:
  - **1 (lũy kế)**: hai dòng ngày **26/12/2025** — `lay_hang` (G − LH26, M − LH26_HĐ) và `thanh_toan` (H+I − Trả26, N − Trả26_HĐ) — nội dung ghi số, ngày và giá trị hợp đồng.
  - **0 (ròng)**: một dòng `ledger_opening_balances` với `asOf` 31/12/2025.
- Mặc định là 1 khi cả TT lẫn HĐ khớp; 0 khi lệch hoặc thiếu dữ liệu.
- Lựa chọn 1 bị khóa khi CSV thiếu cặp, có `#REF!`, hoặc có thành phần âm. Cặp lệch vẫn chọn 1 được, nhưng màn hình hiện hậu quả ("Đầu kỳ 2026 = X thay vì Y") và cần `ack`.
- Màn hình có thêm hai danh sách: cặp CSV không tìm thấy trong ERP, và cặp ERP có số dư mà CSV không có.
- CSV xuất trước giờ đóng băng có thể làm nhiều cặp lệch đúng bằng phần phát sinh sau thời điểm xuất. Runbook yêu cầu xuất lại CSV đúng giờ đóng băng.

## Chống tính trùng

**Tới 26/10:**
- Tiền chỉ từ dòng Nhập Liệu và số dư / lũy kế.
- Phiếu lịch sử (D6) được ghi đủ (KL, ĐVT, vật tư, giá nếu có) nhưng **không** gắn `deliveryId` và không sinh event. Lý do: `deliveryId` nghĩa là "event sinh khi chốt kỳ"; sửa phiếu sẽ xóa mềm event (`delivery-service.ts:114-115`), chốt lại sẽ đặt HĐ = 0 (`ledger-service.ts:302`).
- Phiếu nằm trong marker đã ký, và guard mốc toàn cục (phase 2) chặn mọi ghi ngày ≤ mốc.
- **Chẩn đoán** (không chặn): bảng cặp × tháng so Σ thành tiền phiếu có giá với Σ TT `lay_hang` của Nhập Liệu. Thay cho ghép từng dòng.

**Sau 26/10:**
- Phiếu được ghi ở trạng thái chưa chốt, có giá nếu khối đối chiếu có giá.
- Dòng Nhập Liệu **"Lấy Hàng" sau mốc không bao giờ được ghi.** Mỗi dòng phải ghép được với một phiếu sau mốc (trong gói hoặc đã có trong ERP), cùng NCC và công trình, ngày ± 3:
  - phiếu có giá: thành tiền ± 1 đồng;
  - phiếu chưa giá (chỉ có ở "Vật tư ngày"): ghép theo số phiếu trong ngày.

  Dòng không ghép được là **lỗi chặn**. Cách xử lý: bổ sung phiếu vào file theo dõi, hoặc nhập phiếu vào ERP trước rồi "Lưu & tính lại". Không có lựa chọn ghi dòng tiền song song với phiếu.
- Dòng **"Trả Nợ" sau mốc**:
  - ghép với thanh toán đang có trong ERP của cặp (`thanh_toan` tay hoặc từ đợt đã đóng, ngày ± 3, số tiền ± 1 đồng): khớp thì bỏ;
  - không khớp thì ghi `thanh_toan` trong kỳ mở.
- **Đợt thanh toán `vat_tu` còn mở** (`draft` / `submitted` / `approved`) của NCC trong run là lỗi chặn. Người dùng phải đóng hoặc hủy các đợt này trước. Lý do: đợt đóng sau go-live ghi `thanh_toan` theo ngày đóng (`payment-ledger-sync.ts:31,39`), sẽ trừ lần nữa khoản đã có trong Nhập Liệu.
- **Khớp chéo mốc**: `thanh_toan` từ đợt đã đóng có ngày > mốc mà trùng số tiền với "Trả Nợ" ≤ mốc của cùng cặp (trong 30 ngày) là lỗi chặn. Người dùng chọn một trong hai: bỏ dòng Nhập Liệu, hoặc giữ cả hai kèm `ack`.

## Guard độc quyền (dùng chung điều kiện với guard hoàn tác của phase 5)

Commit bị chặn nếu:
- đã có một run `vat-tu-chuyen-doi` khác ở trạng thái `committed`;
- hoặc một cặp trong run đã có một trong các thứ sau: dòng sổ vật tư ngày ≤ 26/10 chưa xóa mềm (kể cả `dieu_chinh`), số dư ban đầu, kỳ đối chiếu còn sống.

Guard chạy lại dưới khóa NCC lúc commit. Phiếu sau mốc chỉ chèn phần chênh multiset theo (NCC, công trình, ngày, vật tư, KL), để phiếu người dùng đã nhập tay vào ERP không bị nhân đôi.

## Thứ tự ghi (một transaction, mọi dòng mang `importRunId`)

1. Khóa NCC (engine đã lấy theo `lockScope`).
2. Tạo Chủ thể, NCC, công trình (công trình mới có `entityId` theo khóa), vật tư theo các ánh xạ "Tạo mới".
3. Ghi số dư ròng (cặp chọn 0) hoặc 2 dòng lũy kế ngày 26/12/2025 (cặp chọn 1). Số Dư CDC đã được tách.
4. Ghi dòng Nhập Liệu ≤ 26/10, cộng dòng "Trả Nợ" sau mốc không khớp. `projectId` và `itemId` lấy theo ánh xạ.
5. Ghi phiếu ngày (phần chênh), dùng ngày đã giải hoặc đã chọn.
6. Ghi marker chuyển đổi cho **mọi** cặp có số dư, lũy kế, dòng sổ hoặc phiếu tới 26/10:
   - `periodFrom` 01/01/2026, `periodTo` 26/10/2026;
   - `signedBySupplier = true`, `signedDate` = lúc commit;
   - note "Chuyển đổi từ Excel đến 26/10/2026 — import #N";
   - snapshot và 4 cột tổng tính bằng `freezeReconciliationSnapshot` (phase 2) ngay trong transaction.

   `periodFrom` 01/01/2026 thỏa quy tắc 3 của biên kỳ với số dư asOf 31/12/2025. Dòng lũy kế 26/12/2025 nằm ngoài marker nhưng được guard mốc toàn cục bảo vệ. Bước kiểm "mọi phiếu trong kỳ có event" không áp dụng cho marker chuyển đổi.
7. Chạy `verification-queries` trên chính transaction. V2–V4 lệch thì ném lỗi, làm rollback toàn bộ. V1 tính từ DB phải bằng V1 đã hiển thị và được `ack` ở xem trước.
8. Ghi `expected` (kết quả V1–V4, mốc, danh sách danh mục đã tạo) vào `reviewJson`. Ghi một lần, không cập nhật lại.

## Xem trước dùng cùng đường mã

`review` chạy `apply-cutover` cùng `verification-queries` trong một transaction riêng dưới khóa NCC, rồi **rollback**. Nhờ vậy số trong xem trước được tính bằng đúng mã sẽ ghi, không có bản cài đặt thứ hai của phép tính sổ cái. Chỉ chạy bước này khi không còn lỗi chặn về ánh xạ và ngày.

## Đối soát (dung sai ±1 đồng)

- **V1 – Neo Excel.** Với mỗi file (hoặc nhóm gộp: NCC s, tập công trình M), lấy khối muộn nhất có biên thực Y ≤ 26/10 và có "Tổng nợ" (biên theo `block-chain.ts`). Kiểm Σ_{p∈M} nợ TT ERP(s, p, tại Y) + Σ dòng của khối có ngày > Y = Tổng nợ.
  - Bê tông HP × Trại Chuối: 480.583.111 + 28.980.000 = 509.563.111.
  - Nam Hương nhóm Trại Chuối + Tân Lộc CDC + ĐVP-CDC = 294.445.120.
  - Lộc Tài MN2: dòng 27/10 1.400.000 nằm trong khối cuối.
  - Lệch thì hiện chênh và cần `ack`, vì Excel có thể tự mâu thuẫn.
- **V2.** Đầu kỳ 2026 (TT, HĐ) = Số Dư (sau tách CDC) ở mọi cặp; cặp đã `ack` lệch được loại trừ có ghi chú.
- **V3.** Với cặp lũy kế: PS tăng (Toàn bộ) + Σ "Lấy Hàng" sau mốc bị bỏ = G (TT) và M (HĐ); Đã trả + Σ "Trả Nợ" sau mốc bị bỏ = H+I và N.
- **V4.** Mọi dòng "Lấy Hàng" sau mốc đã ghép được với phiếu. Với dữ liệu hôm nay là 11/11, nhưng con số được tính lại tại giờ đóng băng.

Các bất biến "số phiếu theo cặp = số dự kiến", "không có dòng ≤ mốc ngoài run", "mỗi cặp đúng một marker, kỳ gợi ý 27/10→26/11" được kiểm bằng test tích hợp, không thành báo cáo runtime.

## Xem trước hiển thị (theo thứ tự)

1. Tóm tắt: số file, số dòng theo loại, số dòng bỏ qua có lý do, số ngày đã sửa.
2. Lỗi chặn: tên chưa ánh xạ, công trình chưa có Chủ thể, lệch Chủ thể, ngày không giải được, guard độc quyền, "Lấy Hàng" sau mốc chưa ghép, đợt `vat_tu` còn mở, khớp chéo mốc chưa quyết, phiếu ≤ 26/10 ở cặp không có tiền (nghi ánh xạ sai).
3. Ánh xạ tên.
4. Tách CDC.
5. Duyệt từng cặp.
6. Quyết định ngày mơ hồ (kèm chữ gốc và khối).
7. Neo Excel V1, V2–V4 (từ lần chạy thử trong transaction).
8. Sau mốc: "Lấy Hàng" ↔ phiếu, "Trả Nợ" ↔ thanh toán ERP.
9. Chẩn đoán cặp × tháng.
10. Phiếu sẽ nhập theo cặp (trước / sau mốc, có giá / chưa giá, số bị gộp do trùng).
11. Danh mục sẽ tạo mới.

## Tests

- Unit:
  - `cdc-split.test.ts`: Nam Hương CDC 153.936.700 / 27.734.400 tách thành Tân Lộc CDC 109.336.700 / 0 và ĐVP-CDC 44.600.000 / 27.734.400. Tổng tách lệch thì sinh quyết định.
  - `pair-lifetime.test.ts`: Nam Hương × Trại Chuối có net trước 2026 = 59.868.420, mặc định 1. Cặp HĐ lệch 100.000.000 mặc định 0. Thành phần âm thì cấm chọn 1.
  - `post-cutover-matching.test.ts`:
    - 11 dòng mẫu ghép đủ;
    - dòng "Lấy Hàng" không có phiếu → chặn;
    - phiếu chưa giá ghép theo số phiếu trong ngày;
    - "Trả Nợ" trùng thanh toán ERP → bỏ;
    - đợt `vat_tu` còn mở → chặn;
    - khớp chéo mốc → chặn đến khi có quyết định.
- Integration `test/integration/vat-tu-chuyen-doi-import.integration.test.ts`, dùng gói tổng hợp nhỏ (file tổng, CSV, 3 file theo dõi; 1 NCC × 2 công trình, có một dòng CDC):
  1. Chưa ánh xạ, hoặc công trình chưa có Chủ thể → lỗi chặn. Sau ánh xạ thì ra bảng cặp với mặc định đúng.
  2. Sau commit:
     - mỗi cặp có một marker 01/01→26/10 đã ký, kể cả cặp chỉ có Số Dư;
     - Đầu kỳ 2026 = S;
     - Kỳ chuẩn T1/2026 có Đầu kỳ = S;
     - phiếu trùng giữa khối còn 1;
     - dòng "Lấy Hàng" sau mốc không có trong sổ cái.
  3. Sau commit:
     - chốt kỳ 01/10→26/10 bị biên kỳ chặn;
     - tạo phiếu 20/10 ở cặp mới bị guard mốc chặn;
     - kỳ gợi ý là 27/10→26/11, chốt kỳ đó chỉ sinh event cho phiếu sau mốc, và nợ sau chốt = Tổng nợ của khối.
  4. Import lại (kể cả file sửa 1 byte) bị guard độc quyền chặn.
  5. `reviewVersion` cũ → commit bị từ chối.
  6. Hoàn tác:
     - trước chốt kỳ ERP: khôi phục đúng số dòng từng bảng, run thành `rolled_back`, rồi import lại được;
     - sau chốt hoặc ký kỳ ERP, hoặc có `dieu_chinh` mới trong cặp: bị từ chối.
  7. V2 lệch giả lập ở bước verify → commit ném lỗi, không còn dòng nào được ghi.

## Ownership & Rollback

- Sở hữu: các tệp mới của phase này trong `lib/import/adapters/vat-tu-chuyen-doi/`, `cutover-review.tsx`, một dòng trong `adapter-registry.ts`, một mục trong `adapterReviewComponents`. Chỉ import (không sửa) tệp của phase 2, 5, 6.
- Rollback: gỡ dòng đăng ký và xóa các tệp mới.

## Verification

- `npx vitest run --project unit lib/import/adapters/vat-tu-chuyen-doi`
- `npx vitest run --project integration test/integration/vat-tu-chuyen-doi-import.integration.test.ts`
- `npx tsc --noEmit`, `pnpm lint`
