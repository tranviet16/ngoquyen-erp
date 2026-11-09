---
title: "Công nợ vật tư theo công trình: nhập theo công trình, đối chiếu theo cặp, tổng hợp năm / từ đầu, chuyển đổi Excel qua Import"
description: "Đổi phạm vi đối chiếu sang NCC × công trình, thêm cửa vào theo công trình và trang tổng hợp xoay chiều, rồi nạp toàn bộ dữ liệu Excel (file tổng, CSV lũy kế, 24 file theo dõi) bằng một lần import có duyệt."
status: in-progress
priority: P1
effort: 89h
branch: main
tags: [feature, backend, frontend, database, ledger, vat-tu-ncc, cong-no-vt, import]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Công nợ vật tư theo công trình

## Overview

Hiện người dùng nhập công nợ vật tư hai lần: một lần vào file theo dõi từng công trình, một lần vào file tổng "Quản Lý Công Nợ Vật Tư". Kế hoạch này đưa toàn bộ vào ERP:

- Kế toán nhập phiếu, chốt kỳ, đối chiếu, ký và thanh toán ngay trong từng **NCC × công trình**; sổ cái sinh ra từ đó.
- Một trang tổng hợp xem theo năm hoặc từ đầu, nhóm theo NCC hoặc theo công trình.
- Toàn bộ dữ liệu Excel được nạp bằng **một lần import có duyệt** qua `/admin/import`.

Đầu vào:
- Brainstorm đã chốt: [`plans/reports/brainstorm-261105-1504-cong-no-vat-tu-theo-cong-trinh.md`](../reports/brainstorm-261105-1504-cong-no-vat-tu-theo-cong-trinh.md).
- Gói bằng chứng: [`reports/debate-evidence-packet.md`](reports/debate-evidence-packet.md).
- Ba ứng viên tranh luận: [`-1`](reports/planner-debate-candidate-1.md) (ít thay đổi nhất), [`-2`](reports/planner-debate-candidate-2.md) (toàn vẹn dữ liệu), [`-3`](reports/planner-debate-candidate-3.md) (luồng người dùng, kongming).
- Bốn báo cáo red-team: [`reports/red-team-*.md`](reports/).

## Quyết định của người dùng (không tranh luận lại)

| # | Quyết định |
|---|---|
| D1 | Đối chiếu, chốt kỳ, ký, khóa kỳ theo **NCC × công trình**. |
| D2 | Một công trình = một bản đối chiếu; không có nhóm công trình. |
| D3 | CSV "Tổng công nợ" lệch "Số Dư Ban Đầu" thì **duyệt từng cặp** trong màn xem trước. |
| D4 | Cống hộp Tiên Lãng tách hai công trình: "Tiên Lãng (Việt Úc)" thuộc Lưu Minh Xuân, "Tiên Lãng (SH)" thuộc Lê Văn Huyên. |
| D5 | Mốc chuyển đổi **hết 26/10/2026**. |
| D6 | **Toàn bộ lịch sử khối lượng** trong 24 file theo dõi được đưa vào ERP. |
| D7 | Mọi dữ liệu nạp **qua chức năng Import của sản phẩm**. Ngoại lệ được chấp nhận: dọn và sửa dữ liệu cũ bằng script có duyệt (V2). |
| V1 | "Tân Lộc CDC" và "ĐVP-CDC" là **hai công trình**; dòng "CDC" trong Số Dư được tách theo CSV. |
| V2 | Dữ liệu cũ không phải pilot: **xóa dòng ≤ 26/10** (Nhập Liệu thay thế), **gán công trình cho dòng > 26/10**, bằng script SQL theo danh sách người dùng duyệt, chạy trước migrate. |
| V3 | Tab Công nợ của Dự án giữ nguồn `project_transactions`, chỉ thêm liên kết sang trang công trình. |
| V4 | Kỳ chuyển đổi được **ký ngay khi import**. |
| V5 | **Xóa hết** dữ liệu pilot 07/10 sau khi duyệt danh sách. |
| V6 | Đóng 3 module (`vat-tu-ncc`, `cong-no-vt`, `thanh-toan`) bằng kỹ thuật trong buổi go-live. |

## Kiến trúc đã chọn

1. **Một sổ cái.** `ledger_transactions` + `ledger_opening_balances` là nguồn sự thật duy nhất. Trang tổng hợp và trang công trình chạy trên `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:108`), không viết lại SQL báo cáo.
2. **Phạm vi cặp.**
   - `SupplierReconciliation.projectId` là NOT NULL. Biên kỳ, `assertPeriodOpen`, chốt, ký, gỡ ký, snapshot, khóa số dư ban đầu và đồng bộ đợt thanh toán đều nhận `(supplierId, projectId)`.
   - Sổ vật tư, số dư vật tư và phiếu có CHECK bắt buộc công trình. Dòng đợt `vat_tu` mới hoặc sửa được kiểm ở service.
   - Chủ thể của mọi ghi vật tư được **suy từ `Project.entityId`**. Công trình đã có dữ liệu vật tư thì không đổi Chủ thể được.
3. **Khóa advisory giữ theo NCC.** Khóa thô hơn phạm vi nghiệp vụ vẫn đúng, nếu mọi đường ghi theo quy ước "khóa rồi mới kiểm", kể cả commit import.
4. **Mỗi khoảng thời gian một nguồn tiền.**
   - Tới 26/10, tiền chỉ từ Nhập Liệu, cộng số dư ròng (asOf 31/12/2025) hoặc 2 dòng lũy kế ngày **26/12/2025**. Ngày 26/12 nằm ngoài cửa sổ Kỳ chuẩn T1/2026 bắt đầu từ 27/12.
   - Phiếu lịch sử chỉ là bản ghi khối lượng: không gắn `deliveryId`, không sinh event.
   - Sau 26/10: dòng Nhập Liệu "Lấy Hàng" không bao giờ được ghi; mỗi dòng phải ghép được với một phiếu, và phiếu sẽ sinh event khi chốt kỳ trong ERP. Dòng "Trả Nợ" được đối chiếu với thanh toán đã có trong ERP. Đợt `vat_tu` còn mở và các khoản khớp chéo qua mốc phải được xử lý trước khi ghi.
5. **Kỳ chuyển đổi và guard mốc toàn cục.**
   - Mỗi cặp có dữ liệu tới 26/10 nhận một marker `01/01/2026 → 26/10/2026`, được ký ngay khi import, gắn `importRunId`, có snapshot. UI không gỡ ký được marker này.
   - Khi đã có run chuyển đổi được commit, mọi ghi vật tư có ngày ≤ mốc đều bị chặn với mọi cặp, kể cả cặp mới. `dieu_chinh` vẫn ghi được ở ngày sau mốc.
6. **Một adapter, một lần chạy, một gói thư mục.**
   - Adapter `vat-tu-chuyen-doi` nhận cả thư mục `Quản Lý Công Nợ`. Xem trước chạy thử đúng đường mã ghi và đối soát trong một transaction rồi rollback.
   - Commit chạy theo thứ tự: khóa dòng run → khóa NCC → kiểm lại → ghi → đối soát (V2–V4 lệch thì rollback) → đổi trạng thái, tất cả trong một transaction 300 giây.
   - Commit phải đúng `reviewVersion` người dùng đã xem. Run đã ghi không bao giờ thành `failed` hay bị xóa; hoàn tác giữ run ở trạng thái `rolled_back`.
   - Ba adapter cũ ghi dòng không có công trình được gỡ khỏi registry.
7. **Giao diện.**
   - Hai trang danh sách `/vat-tu-ncc/cong-trinh` và `/vat-tu-ncc/cong-trinh/[projectId]`. Liên kết dẫn sang trang NCC hiện có với `?projectId=`. Các tab theo cặp, khi thiếu tham số, hiện bộ chọn công trình. Số nợ chỉ hiện khi có quyền đọc `cong-no-vt`.
   - Trang `/cong-no-vt/tong-hop-cong-trinh` xoay chiều, có xuất Excel. Ma trận NCC × Chủ thể cũ giữ nguyên.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Chốt, ký, khóa của NCC A tại X không ảnh hưởng A tại Y; mọi đường ghi vật tư kiểm theo cặp | P1 |
| 2 | Nhập phiếu, chốt, đối chiếu, thanh toán ngay trong công trình; lỗi khóa kỳ hiện trên UI | P1 |
| 3 | Trang tổng hợp năm / toàn bộ, nhóm NCC ↔ công trình, lọc Chủ thể, xuất Excel; đẳng thức kỳ có test | P1 |
| 4 | Một lần import có duyệt nạp đủ dữ liệu Excel; không tính trùng trước hay sau mốc; hoàn tác được | P1 |
| 5 | Đối soát chứng minh được (neo Excel, Đầu kỳ 2026, lũy kế CSV, ghép sau mốc), cùng đường mã cho xem trước và commit | P1 |
| 6 | Go-live an toàn: đóng module, sao lưu, kiểm kê, dọn trước migrate, đóng băng Excel | P1 |

## Phases

| # | Phase | Status | Effort | Phụ thuộc |
|---|---|---|---|---|
| 1 | [Schema và migration](./phase-01-schema-migration.md) | Pending | 2h | — |
| 2 | [Phạm vi cặp trên mọi đường ghi](./phase-02-pair-scope-backend.md) | Pending | 16h | 1 |
| 3 | [Cửa vào theo công trình, master data Chủ thể](./phase-03-project-first-ui.md) | Pending | 12h | 2 |
| 4 | [Trang tổng hợp theo công trình và Excel](./phase-04-project-summary-pivot.md) | Pending | 8h | 1 |
| 5 | [Engine import: gói thư mục, review, guard](./phase-05-import-engine-review.md) | Pending | 12h | 1 |
| 6 | [Parser chuyển đổi (module thuần)](./phase-06-cutover-parsers.md) | Pending | 14h | — |
| 7 | [Adapter chuyển đổi: duyệt, ghi, đối soát](./phase-07-cutover-adapter.md) | Pending | 18h | 2, 5, 6 |
| 8 | [Hồi quy, tài liệu, chạy thử, go-live](./phase-08-regression-docs-go-live.md) | Pending | 7h + ~3h go-live | 1–7 |

Các luồng chạy song song sau P1:
- A: P2 → P3
- B: P5
- C: P6 (bắt đầu ngay, không cần P1)
- D: P4

P7 chạy sau P2, P5, P6. Đường găng là P1 → P2 → P7 → P8, khoảng 43 giờ. Hai phase song song không sửa chung tệp; mỗi phase có mục sở hữu tệp.

## Success Criteria

- [ ] Ký A×X kỳ 27/09→26/10 thì phiếu A×X ngày 15/10 bị từ chối, phiếu A×Y vẫn được; chốt A×Y cùng biên tạo marker riêng; snapshot A×X chỉ có dòng của X.
- [ ] Mọi dòng sổ vật tư, số dư vật tư, phiếu và kỳ đều có công trình (DB kiểm). Chủ thể suy từ công trình; công trình chưa có Chủ thể thì báo lỗi rõ.
- [ ] Màn công trình → NCC (`?projectId=`) → các tab hoạt động. Ghi phiếu vào kỳ đã khóa hiện toast lỗi. Người không có quyền `cong-no-vt` không thấy số nợ.
- [ ] `/cong-no-vt/tong-hop-cong-trinh` có test chứng minh:
  - Còn nợ (Toàn bộ, đến T) = Cuối kỳ (Năm, đến T);
  - Đầu kỳ + PS tăng − PS giảm = Cuối kỳ ở mọi nút;
  - Kỳ chuẩn T1/2026 có Đầu kỳ = Số Dư.
  Excel xuất cùng số.
- [ ] Import trên thư mục thật:
  - đọc được 922 dòng Nhập Liệu và dừng trước dòng ma;
  - sửa được các năm lạ;
  - đọc được 24 file theo dõi, mọi ngày được giải hoặc được đưa thành quyết định;
  - mọi dòng "Lấy Hàng" sau mốc ghép được với phiếu;
  - không có đợt `vat_tu` còn mở.
- [ ] Đối soát V1–V4 đạt hoặc được giải thích, với neo tính theo công thức: nợ ERP tại biên thực Y + Σ dòng của khối có ngày > Y = "Tổng nợ". Ví dụ Bê tông HP × Trại Chuối: 480.583.111 + 28.980.000 = 509.563.111. Bản gộp so với tổng các công trình thành viên, gồm cả Tân Lộc CDC và ĐVP-CDC.
- [ ] Năm 2026: Đầu kỳ = Số Dư (sau tách CDC) ở mọi cặp. Toàn bộ: LH và Đã trả khớp CSV ở các cặp được duyệt.
- [ ] Sau import: mỗi cặp có một marker 01/01→26/10 đã ký; kỳ gợi ý là 27/10→26/11; ghi ngày ≤ 26/10 ở mọi cặp bị chặn. Chốt kỳ đầu cho Quang Minh × DCX ra nợ 159.360.000 nếu không có thanh toán.
- [ ] Bấm Ghi lần hai không đổi trạng thái run. Hoàn tác giữ run ở trạng thái `rolled_back`, khôi phục đúng số dòng, và bị từ chối khi đã có kỳ ERP ký, event ERP hoặc `dieu_chinh` mới trong cặp.
- [ ] `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build` đều xanh.

## Bất biến

Giữ nguyên:
- Ngày sổ cái là ngày nghiệp vụ Asia/Bangkok lưu tại UTC 00:00; truy vấn cửa sổ dùng `date >= from AND date < to + 1 ngày`.
- Kỳ đã ký bất biến; chênh lệch đi qua `dieu_chinh`.
- Module nhân công không đổi hành vi.
- Server action có guard đúng module; `revalidatePath` dùng đường dẫn literal; bảng dùng `components/sortable-table`.

Thêm mới:
- **I1** Mọi dòng vật tư có công trình.
- **I2** Chủ thể = `Project.entityId`; không đổi Chủ thể khi công trình đã có dữ liệu.
- **I3** Tiền tới 26/10 chỉ đến từ run chuyển đổi; sau khi commit, không ghi được ngày ≤ mốc.
- **I4** Phiếu lịch sử không bao giờ sinh event; dòng "Lấy Hàng" sau mốc không bao giờ cùng tồn tại với phiếu của nó.
- **I5** Closing của kỳ chuyển đổi = opening của kỳ ERP đầu.
- **I6** Mọi đường ghi theo quy ước "khóa rồi mới kiểm".
- **I7** Commit đúng phiên bản đã xem; run đã ghi không bị xóa hay đổi trạng thái sai.
- **I8** Guard hoàn tác = guard import lại.

## Tổng hợp tranh luận (sau red-team)

| Điểm | Ứng viên 1 | Ứng viên 2 | Ứng viên 3 | Chọn |
|---|---|---|---|---|
| Khóa advisory | Theo NCC | Theo cặp | Theo cặp | **Ứng viên 1**: khóa thô vẫn đúng và ít thay đổi; red-team bổ sung yêu cầu commit import cũng phải khóa trước khi kiểm. |
| Bắt buộc công trình | zod | zod + 5 CHECK `NOT VALID` | zod | **Sau red-team**: dọn trước migrate, 3 CHECK kiểm ngay, kỳ NOT NULL; không CHECK trên đợt thanh toán; bỏ chế độ marker cũ. |
| Gắn phiếu lịch sử vào Nhập Liệu | Gắn `deliveryId` | Không gắn | Gắn, kèm event 0 đồng | **Ứng viên 2**; ghép từng dòng thay bằng bảng chẩn đoán cặp × tháng. |
| Kỳ lịch sử | Marker đã ký | Marker đã ký 31/12→26/10 | Marker chưa ký | **Đã ký, 01/01→26/10, cho mọi cặp có dữ liệu**, cộng guard mốc toàn cục (red-team, V4). |
| Nạp dữ liệu | Mở rộng adapter cũ, 1 run | Adapter mới, 1 run | 3 adapter tuần tự | **Ứng viên 2**. |
| Engine | Review + báo cáo + timeout | Digest, khóa toàn cục, guard | Review, LIFO | **Đơn giản hóa sau red-team**: `reviewVersion` thay digest, khóa dòng run thay khóa toàn cục, review do adapter hiển thị, không "Dùng lại ánh xạ". |
| Dòng Nhập Liệu sau 26/10 | Khớp thì bỏ, không khớp thì ghi | Chặn | Bỏ và liệt kê | **Sau red-team**: "Lấy Hàng" không bao giờ ghi, phải ghép phiếu; "Trả Nợ" đối chiếu thanh toán ERP; đợt mở và khớp chéo mốc phải xử lý trước. |
| Route theo công trình | `?projectId=` | Route lồng | `?project=` | **Ứng viên 1/3** (red-team): `revalidatePath` theo NCC vẫn đúng, không nhân đôi guard. |
| Đối soát | Báo cáo sau commit | V1–V7 hai cột | Trang kiểm tra | **Sau red-team**: một đường mã (chạy thử rồi rollback / ghi thật), V1–V4; các kiểm còn lại thành test. |
| `du-an/[id]/cong-no` | Đọc sổ cái | Đọc sổ cái | Đọc sổ cái | **V3**: giữ nguồn cũ, thêm liên kết. |

## Red Team Review

### Session — 2026-11-06
**Findings:** 15 sau khi gộp từ 36 phát hiện thô của 4 reviewer (15 chấp nhận; 3 đề xuất phụ bị bác).
**Severity breakdown:** 2 Critical, 7 High, 6 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Tính trùng sau mốc: đợt `vat_tu` đóng sau go-live ghi theo ngày đóng (`payment-ledger-sync.ts:31,39`); "Trả Nợ" sau mốc trùng thanh toán ERP; "ghi như dòng sổ" để tồn tại song song với phiếu; phiếu không giá không ghép được | Critical | Accept | Phase 7, 8 |
| 2 | Bấm Ghi lần hai làm run `committed` thành `failed` (`import-engine.ts:149-157`), sau đó bị xóa; FK `SetNull` gỡ `importRunId` khỏi marker | Critical | Accept | Phase 5 |
| 3 | Guard chạy trước khi khóa NCC; khóa 300 giây chiếm pool kết nối; "đóng băng" chỉ là thông báo | High | Accept (bác `lock_timeout` toàn cục) | Phase 5, 7, 8 |
| 4 | CHECK `NOT VALID` chặn UPDATE dòng cũ (`payment-service.ts:409,472,495,534`); VALIDATE hỏng giữa go-live; chế độ marker cũ là nhánh chết; revert code là sai | High | Accept có sửa (bác "bỏ mọi CHECK") | Phase 1, 2, 8 |
| 5 | Guard hoàn tác và guard import lại lệch nhau; `dieu_chinh` ghi lùi lọt qua; đổi `Project.entityId` tách cặp (`project-service.ts:101,109-125`) | High | Accept | Phase 2, 3, 5, 7 |
| 6 | Dòng lũy kế 31/12/2025 rơi vào Kỳ chuẩn T1/2026 (`period.ts:11-12`) | High | Accept | Phase 4, 6, 7 |
| 7 | Nơi gọi không định kiểu lọt khỏi `tsc` (`components/ledger-grid/*`, `thanh-toan/page.tsx:36-60`, `period-close-service.ts:314-321`, test schema, `scripts/smoke-import-apply.ts`) | High | Accept | Phase 2, 3, 5 |
| 8 | Digest không gắn với thứ người dùng đã xem; 4 cơ chế chống trùng chồng nhau; `ack` không kiểm (`import-actions.ts:77-79`) | High | Accept có sửa | Phase 5, 7 |
| 9 | Nhãn biên khối Excel không đáng tin; khối gộp Lộc Tài tự mâu thuẫn; 389 dòng ma trong Nhập Liệu; năm "206" | High | Accept | Phase 6 |
| 10 | Marker chỉ phủ cặp có marker; cặp mới vẫn ghi được ngày ≤ mốc | Medium | Accept | Phase 2, 7 |
| 11 | Đối soát sau commit không chặn; `projection.ts` cài lại phép tính sổ cái | Medium | Accept | Phase 7 |
| 12 | Khung `ReviewSection` tổng quát chỉ có một nơi dùng; chồng sở hữu giữa P5 và P7 | Medium | Accept | Phase 5, 7 |
| 13 | Route lồng không mỏng; trang công trình lộ số nợ dưới quyền `vat-tu-ncc` (`layout.tsx:17-19,42`); kỳ không được kiểm đúng cặp | Medium | Accept | Phase 3 |
| 14 | `sourceFile` bị kéo ở trang danh sách (`import-engine.ts:162-172`); gói chứa file lạ; đường dẫn không được kiểm | Medium | Accept | Phase 5 |
| 15 | Vận hành: so số dòng vòng tròn trong script dọn, `pg_dump` thiếu `-U`, thứ tự deploy, chạy thử chưa có DB riêng, CSV cũ, `migrate dev` trên container dùng chung | Medium | Accept (bác "chỉ gỡ adapter file tổng": `gach-nam-huong`/`quang-minh` không ghi `projectId`) | Phase 1, 8 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-08 (viết lại toàn bộ sau phân xử và validate).
- Decision deltas checked: 14.
  - Bỏ CHECK `NOT VALID` / VALIDATE; bỏ chế độ marker cũ; kỳ NOT NULL.
  - Dọn trước migrate; bỏ CHECK đợt thanh toán và index sổ cái.
  - Ngày lũy kế 26/12/2025; marker 01/01/2026 cho mọi cặp; guard mốc toàn cục.
  - Không gắn `deliveryId`; "Lấy Hàng" sau mốc không ghi; bỏ "ghi như dòng sổ".
  - `reviewVersion` thay digest; khóa dòng run thay khóa toàn cục; hoàn tác giữ `rolled_back`; bỏ "Dùng lại ánh xạ".
  - Route `?projectId=` thay route lồng; Chủ thể suy từ công trình và khóa đổi.
  - Đối soát một đường mã, V1–V4; tách CDC; tab Dự án giữ nguồn.
- Reconciled stale references: "31/12/2025" → 26/12/2025 cho dòng lũy kế (asOf số dư vẫn 31/12/2025); "route lồng" → `?projectId=`; "NOT VALID" và "VALIDATE" → kiểm ngay; "marker cũ" bị xóa khỏi P2 và P7; "digest" bị xóa khỏi P5 và P7; "V5–V7 runtime" → test; "gán entityId lúc commit" → chặn khi thiếu; "CDC gộp" → tách.
- Unresolved contradictions: 0.

## Validation Log

### Session 1 — 2026-11-05 / 2026-11-06
Hỏi 7 câu (gộp với cổng red-team). Người dùng trả lời:
1. Áp dụng 15 phát hiện red-team → Có, tất cả.
2. Dữ liệu cũ không phải pilot → xóa ≤ 26/10, gán công trình > 26/10, bằng script có duyệt (ngoại lệ của D7).
3. "Tân lộc CDC" / "ĐVP-CDC" → **hai công trình riêng** (khác mặc định gộp). Dòng "CDC" trong Số Dư được tách theo cột còn nợ J/P của CSV; lệch thì người dùng chọn công trình nhận phần chênh.
4. Tab Công nợ của Dự án → giữ nguồn cũ, thêm liên kết.
5. Kỳ chuyển đổi → ký ngay khi import.
6. Dữ liệu pilot → xóa hết.
7. Đóng 3 module khi go-live → chấp nhận.

Quyết định của planner (ghi lại để người dùng phản đối nếu cần):
- Khóa advisory giữ theo NCC.
- Chủ thể của "Tân Lộc CDC" và "ĐVP-CDC" lấy theo dòng CDC trong Số Dư (Công Ty Quản Lý).
- Vật tư chưa có trong danh mục được tạo mới theo tên.
- Gỡ 3 adapter cũ.

### Verification Results
- Tier: Full (8 phase). Bốn reviewer red-team đã kiểm chứng bằng grep với vai trò Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier.
- Failures đã sửa trong plan:
  - Component sổ (`components/ledger/*` → `components/ledger-grid/*`).
  - Guard trang thanh toán là `cong-no-vt`.
  - Test entrypoint không quét page.
  - Việc xóa marker theo `importRunId` đã có sẵn (`import-engine.ts:303`).
  - "Dùng lại ánh xạ từ lần chạy thử" mâu thuẫn với chạy thử trên DB khác.
  - Rollback phase 2 bằng git revert là sai.
- Unverified còn lại:
  - Số dòng đợt `vat_tu` thiếu công trình và số `thanh_toan` từ đợt trên DB thật. Docker đang tắt; runbook bước 4 sẽ đếm.
  - Lệnh `pg_dump -U nqerp` dựa trên `.env.example`. Kiểm khi chạy thử.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-08.
- Decision deltas checked: 7 (V1–V6, ngoại lệ D7).
- Reconciled stale references: tách CDC ở P6, P7, P8 và trong Success Criteria; ký marker ở P7; xóa pilot và đóng module ở P8; tab Dự án ở P3.
- Unresolved contradictions: 0.

## Implementation Status — 2026-11-06

Code của phase 1–7 và phần tài liệu, script, runbook của phase 8 đã xong; chưa commit. Báo cáo từng phase nằm ở `reports/cook-phase-*.md`, kết quả review và các sửa đổi theo review ở `reports/code-review-cook-phases-1-5.md`.

| Kiểm tra | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `npx vitest run --project unit` | 122 file, 1204/1204 test pass (trước khi làm: 92 file, 960 test) |
| `npx eslint .` | sạch |
| `npx next build` | thành công; có route mới `/vat-tu-ncc/cong-trinh`, `/vat-tu-ncc/cong-trinh/[projectId]`, `/cong-no-vt/tong-hop-cong-trinh` |
| Smoke trên thư mục Excel thật (lớp parser và lớp lập kế hoạch thuần) | 922 dòng Nhập Liệu; 23 file theo dõi; 538 phiếu; 11/11 dòng "Lấy Hàng" sau mốc ghép được với phiếu; tách CDC đúng; 16/23 neo V1 khớp, 7 neo còn lại do Excel tự lệch |
| Integration, e2e, `prisma migrate deploy`, hai script SQL | **Chưa chạy**, vì Docker Desktop tắt. SQL mới chỉ được kiểm bằng parser của PostgreSQL |

Thay đổi so với kế hoạch đã ghi nhận:
- Đợt `vat_tu` còn mở cần xác nhận từng đợt thay vì bị chặn cứng (người dùng quyết định 2026-11-06). Chỉ đợt trùng số tiền với một dòng "Trả Nợ" mới bị chặn cho tới khi người dùng quyết.
- Phiếu ≤ mốc ở cặp không có dòng tiền là mục cần xác nhận, không chặn (gặp ở Tùng Lâm và Gia Bảo DCX).
- Có 23 file theo dõi, không phải 24.
- Các server action của chốt kỳ, đối chiếu, thanh toán và sổ trả `{ok, message}`, để thông điệp lỗi hiện được ở bản production.
- Script dọn có thêm danh sách "giữ lại NCC".

Việc còn lại:
1. Bật Docker, chạy `prisma migrate deploy` trên DB `_test`, rồi `pnpm test:integration` và các e2e mới.
2. Chạy thử theo runbook Phần A (`reports/go-live-runbook.md`) trên `ngoquyyen_erp_dryrun` và ghi kết quả vào `reports/dry-run-result.md`.
3. Go-live cùng người dùng.

<!-- slug: cong-no-vat-tu-theo-cong-trinh -->
