---
title: "Module Dự án đọc sổ công nợ vật tư"
description: "Cho tab Giao Dịch và Công Nợ NCC của mọi công trình đọc thẳng sổ Công nợ vật tư, khớp đúng module Công nợ vật tư, không chép tiền sang project_transactions và không cộng gộp hai nguồn."
status: completed
priority: P1
effort: 2d
branch: main
tags: [feature, backend, frontend, du-an, cong-no-vt]
blockedBy: []
blocks: []
created: 2026-11-26
---

# Module Dự án đọc sổ công nợ vật tư

## Overview

Cho tab Giao Dịch và Công Nợ NCC của mọi công trình đọc thẳng sổ Công nợ vật tư, khớp đúng module Công nợ vật tư, không chép tiền sang `project_transactions` và không cộng gộp hai nguồn. Nguyên nhân gốc và số liệu: [brainstorm](../reports/brainstorm-261126-1650-du-an-giao-dich-thieu-so-cong-no-vt.md), [gói bằng chứng](./reports/debate-evidence-packet.md). Repo công khai: chỉ ghi `NCC #id`, không ghi tên hay số tiền.

## Hợp đồng

- **Kết quả:** mở bất kỳ công trình nào có hoạt động vật tư (ví dụ #1 TC, #14 DCX) thấy công nợ từng NCC ở tab Công Nợ NCC, bằng đúng báo cáo lũy kế của Công nợ vật tư, và đủ dòng sổ ở tab Giao Dịch; phiếu ngày chưa chốt được báo; Cân Đối VT / Định Mức / Dashboard nói rõ vì sao trống.
- **Quyền xem (chủ đầu tư chốt 26/11):** giống tab Hợp đồng — người đọc được dự án thấy công nợ từng NCC và tổng; từng dòng sổ cần thêm quyền đọc Công nợ vật tư.
- **Ràng buộc:** không ghi `project_transactions` từ sổ VT; không cộng hai nguồn; không tự tạo hạng mục; không đổi schema; mọi số tiền sổ VT lấy từ `queryDetailReport`, tổng tính ở server; integration test chỉ chạy trên 127.0.0.1:5435; production (5433 / 3001) không chạm.
- **Không làm:** làm đầy Cân Đối VT / Định Mức; công nợ nhân công; link sửa theo từng dòng; import file đội cho công trình khác; đổi Dashboard ngoài một thông báo; đổi quyền tab Hợp đồng; triển khai production.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Lớp đọc sổ VT theo công trình](./phase-01-project-ledger-data-layer.md) | Done (27/11) |
| 2 | [Công Nợ NCC đọc sổ VT](./phase-02-supplier-debt-tab-reads-ledger.md) | Done (27/11) |
| 3 | [Công tắc nguồn ở Giao Dịch](./phase-03-transactions-tab-source-switch.md) | Done (27/11) |
| 4 | [Trạng thái rỗng, làm mới trang và tài liệu](./phase-04-empty-states-notices-and-docs.md) | Done (27/11) |

Phase 1 chứa mọi thứ dùng chung (loader, hàm đếm, thông báo phiếu chưa chốt), nên phase 2 và 3 không sửa chung file và chạy song song được. Phase 4 chạy sau 2 và 3.

## Kết quả debate (3 planner + kongming phân xử)

Báo cáo: [ứng viên 1](./reports/planner-debate-candidate-1.md) (tái dùng tối đa), [ứng viên 2](./reports/planner-debate-candidate-2.md) (đúng số trước), [ứng viên 3](./reports/planner-debate-candidate-3.md) (luồng người dùng), [phân xử](./reports/kongming-debate-adjudication.md).

- **Đồng thuận:** Công Nợ NCC = `queryDetailReport` gom theo `partyId` bằng `sumReportRows`; Giao Dịch có công tắc `?nguon=`; không ghi, không gộp; không đổi schema.
- **Chọn theo phân xử:** nền ứng viên 2, thư mục `lib/du-an/project-ledger/` của ứng viên 3, bộ lọc theo mã NCC của ứng viên 1; cửa sổ lũy kế; `showZero: true`; xóa `supplier-debt-service.ts`, giữ `supplier-multi-select.tsx`; link sửa từng dòng để sau; mặc định nguồn sổ VT khi đọc được.
- **Đổi sau red-team và chủ đầu tư:** kongming chọn "không quyền Công nợ VT thì không thấy gì"; red-team chỉ ra tab Hợp đồng đã cho người đọc dự án thấy tổng (`contract-detail-loader.ts:155-178`, test `du-an-hop-dong-tie-out.integration.test.ts:239-247`); chủ đầu tư chọn giống tab Hợp đồng.

## Success Criteria

- [x] Trên bản dev, Công Nợ NCC của #1, #4, #14: từng NCC (cộng các Chủ thể) và tổng bằng `/cong-no-vt/chi-tiet` chế độ "Toàn bộ" lọc đúng công trình, cả TT và HĐ.
- [x] Giao Dịch nguồn sổ VT: #1 lưới 490 dòng sổ + dải 1 số dư đầu kỳ, #14 lưới 109 dòng (số dev 16–17/11, đếm lại trước khi nghiệm thu).
- [x] #4 nguồn "Sổ dự án": vẫn 280 dòng, tổng HĐ không đổi; tạo / sửa / xóa vẫn chạy, kể cả khi đọc sổ VT lỗi.
- [x] Người dùng không phải admin, có du-an nhưng không có `cong-no-vt`: thấy công nợ từng NCC và tổng như tab Hợp đồng; không nhận dòng sổ, số dư đầu kỳ chi tiết hay số dòng sổ (integration test).
- [x] Hai tab hiện số mới sau khi ghi sổ bằng Nhập liệu, chốt phiếu ngày và đợt thanh toán.
- [x] `npx tsc --noEmit`, lint, `npx vitest run --project unit`, integration (127.0.0.1:5435) xanh.

Kiểm tra 27/11: [báo cáo triển khai](./reports/implementation-verification-261127-du-an-doc-so-cong-no-vt.md). Đã chạy tie-out dev (script, 11/11 công trình khớp) và kiểm tay trên giao diện dev (cả hai tab của #1, #4, #14; làm mới trang; cô lập lỗi). Trên giao diện, sổ dự án mới thử thao tác tạo; sửa / xóa dùng code không đổi và đã có integration test.

## Rủi ro chính

- **Thứ tự mở module:** `du-an`, `cong-no-vt`, `vat-tu-ncc` đều `development`. Mở `du-an` trước thì người dùng thường thấy tổng công nợ nhưng Giao Dịch chỉ có Sổ dự án (kèm thông báo); mở `cong-no-vt` cùng lúc để có đủ dòng sổ.
- **#4 đổi số ở Công Nợ NCC:** từ tổng HĐ sổ Hóa đơn sang TT + HĐ của sổ công nợ (chủ đầu tư chốt); ghi vào hướng dẫn kế toán.
- **Test chạm production:** `test/helpers/test-db.ts:23` chỉ kiểm tên DB đuôi `_test`; worktree cắt trước f7ada4f còn `.env.test` trỏ 5433. Mọi phase kiểm cổng 5435 trước khi chạy integration.

## Validation Log

### Session 1 — 2026-11-26
**Trigger:** red-team xong, chốt câu hỏi mở của chủ đầu tư.
**Questions asked:** 4

1. **[Risks]** Áp dụng 15 phát hiện red-team thế nào? — Options: Áp dụng cả 15 | Xem từng phát hiện | Bỏ qua. **Answer:** Áp dụng cả 15.
2. **[Architecture]** Người có quyền xem Dự án nhưng không có quyền Công nợ vật tư thấy gì? — Options: Giống Hợp đồng | Chặt ở 2 tab mới | Chặt mọi nơi. **Answer:** Giống Hợp đồng. **Rationale:** nhất quán với tính năng đã chạy và đã có test.
3. **[Tradeoffs]** Công trình dùng sổ đội như #4, Công Nợ NCC lấy HĐ từ đâu? — Options: Sổ công nợ vật tư | Sổ Hóa đơn. **Answer:** Sổ công nợ vật tư.
4. **[Scope]** Có cộng gộp các Chủ thể? — Options: Cộng gộp | Tách theo Chủ thể. **Answer:** Cộng gộp.

#### Confirmed Decisions
- Quyền: tổng thấy với người đọc dự án, dòng sổ cần `cong-no-vt` — giống tab Hợp đồng.
- Nguồn HĐ công nợ: sổ công nợ vật tư cho mọi công trình.
- Chủ thể: cộng gộp, mỗi NCC một dòng.

#### Impact on Phases
- Phase 1: loader trả tổng cho mọi người đọc dự án, `rowsVisible` gác dòng sổ; test (f) đổi theo.
- Phase 2: bỏ khung "cần quyền"; bảng hiện cho mọi người đọc dự án.
- Phase 3: nguồn sổ VT chỉ khi `rowsVisible`; thông báo trỏ tab Công Nợ NCC.
- Phase 4: thông báo Dashboard không cần kiểm `cong-no-vt`; hướng dẫn ghi đúng quy tắc quyền.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-04.
- Decision deltas checked: 6 (quy tắc quyền; link NCC `/ngay?projectId=`; thông báo và hàm đếm chuyển sang phase 1; phase 4 phụ thuộc 2–3; số dòng không tính số dư đầu kỳ; số dòng tham chiếu đã sửa).
- Reconciled stale references: 5 (link `/vat-tu-ncc/{id}`; `cong-no-client.tsx:84-89`; `material-ledger-service.ts:30-33`; "nothing visible without cong-no-vt"; "2 và 3 không sửa chung file" khi thông báo còn ở phase 2).
- Unresolved contradictions: 0.

## Red Team Review

### Session — 2026-11-26
**Findings:** 15 (15 accepted, 0 rejected), gộp từ 23 phát hiện của 3 reviewer.
**Severity breakdown:** 0 Critical, 6 High, 9 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Cam kết quyền sai: tab Hợp đồng đã lộ tổng công nợ | High | Accept (chủ đầu tư chọn giống Hợp đồng) | plan, P1–P4 |
| 2 | Giao Dịch sập cả CRUD khi đọc sổ VT lỗi | High | Accept | P3 |
| 3 | `?nguon=` và số dòng công tắc chưa định nghĩa | High | Accept | P1, P3 |
| 4 | Phase 2–3 không song song được | High | Accept | P1, plan |
| 5 | Link `/vat-tu-ncc/{id}` 404; số dòng tham chiếu sai | High | Accept | P2, plan |
| 6 | Integration test có thể chạm DB 5433 | High | Accept | P1–P4, plan |
| 7 | Thiếu test guard `module-release-entrypoints` | Medium | Accept | P1–P3 |
| 8 | NCC chỉ có phiếu chưa chốt bị mất | Medium | Accept | P1 |
| 9 | `?ncc=` và tổng khi lọc chưa định nghĩa | Medium | Accept | P1, P2 |
| 10 | Số tiền phiếu ngày (Vật tư NCC) lọt sang trình duyệt | Medium | Accept | P1 |
| 11 | Tiêu chí 490 dòng lệch vì số dư đầu kỳ | Medium | Accept | plan, P3 |
| 12 | Khẳng định (d) rỗng vì seed thiếu hợp đồng | Medium | Accept | P1 |
| 13 | Giao Dịch rơi về Sổ dự án trống không giải thích | Medium | Accept | P3 |
| 14 | Trang có thể cũ sau ghi sổ qua 4 đường ghi | Medium | Accept | P4, plan |
| 15 | Phase 4 ra sớm; điều kiện thông báo Dashboard; `doi-chieu-dt-hd-tt.md:454` | Medium | Accept | P4 |

Chưa kiểm: quyền mặc định `cong-no-vt` của các vai trò không phải admin nằm trong bảng `role_permissions` (`lib/acl/role-defaults.ts:18-24`); xem lại trước khi mở module.

<!-- slug: du-an-doc-so-cong-no-vat-tu -->
