---
title: "Danh mục hợp đồng dự án và màn chi tiết hợp đồng"
description: "Hợp đồng gắn đối tác có mã (NCC, đội thi công, CĐT); màn chi tiết gom lấy hàng, hóa đơn, chuyển tiền và nghĩa vụ còn lại từ sổ gốc, kèm bản scan."
status: completed
priority: P2
effort: 37h
branch: feat/du-an-danh-muc-hop-dong
tags: [du-an, hop-dong, cong-no, attachments, backend, frontend, infra]
blockedBy: []
blocks: []
created: 2026-11-18
---

# Danh mục hợp đồng dự án và màn chi tiết hợp đồng

## Overview

Tab "Hợp đồng" của mỗi dự án đã có danh mục, nhưng hợp đồng chưa gắn với đối tác nào nên chưa có số liệu. Plan này gắn mỗi hợp đồng kinh tế với một đối tác có mã: NCC, đội thi công, hoặc CĐT của dự án. Sau đó thêm màn chi tiết `/du-an/[id]/hop-dong/[contractId]` gồm:
- bản scan;
- giá trị hợp đồng theo DT và theo TT;
- ba danh sách lấy hàng, lấy hóa đơn, chuyển tiền, mỗi danh sách có dòng tổng;
- khối công nợ;
- khối phần hợp đồng chưa thực hiện.

Mọi số đọc từ sổ nhập gốc, không nhập lại:
- **NCC:** sổ công nợ vật tư.
- **Đội thi công:** sổ công nợ nhân công.
- **CĐT:** nghiệm thu, dòng tiền 3 bên, và sổ hóa đơn xuất CĐT mới.

## Đầu vào

- Contract đã chốt với người dùng: [brainstorm](../reports/brainstorm-261118-0910-danh-muc-hop-dong-du-an.md).
- Bằng chứng code và dữ liệu: [debate-evidence-packet](./reports/debate-evidence-packet.md).
- Ba ứng viên: [1](./reports/planner-debate-candidate-1.md), [2](./reports/planner-debate-candidate-2.md), [3](./reports/planner-debate-candidate-3.md). Bản tổng hợp: [debate-synthesis](./reports/debate-synthesis.md).
- Red-team: [red-team-adjudication](./reports/red-team-adjudication.md).

## Phases

| # | Phase | Phụ thuộc | Effort | Status |
|---|-------|-----------|--------|--------|
| 1 | [Schema, migration, rollback, hạ tầng lưu tệp](./phase-01-schema-migration-rollback.md) | PR #21 merge (để mở nhánh) | 7h | Completed |
| 2 | [Hàm tổng hợp thuần và unit test](./phase-02-pure-contract-figures.md) | không (song song P1) | 6h | Completed |
| 3 | [Gắn đối tác, danh mục và form hợp đồng](./phase-03-contract-binding-catalog.md) | P1 | 6h | Completed |
| 4 | [Nguồn số, sổ hóa đơn CĐT, tie-out](./phase-04-sources-cdt-invoices-tie-out.md) | P1, P2, P3 | 8h | Completed |
| 5 | [Màn chi tiết và bản scan](./phase-05-detail-screen-scans.md) | P4 | 7h | Completed |
| 6 | [Chạy thử trên bản sao, tài liệu, runbook](./phase-06-dry-run-docs-runbook.md) | P5 | 3h | Completed |

## Quyết định thiết kế chính

- **Cột giá trị.** `valueVnd` giữ tên, đổi nghĩa thành "Giá trị theo DT"; thêm `valueTtVnd`. Lý do: import ghi cột này bằng raw INSERT.
- **Đối tác.** Gồm `partyKind` (`ncc|doi_thi_cong|cdt`), `supplierId`, `contractorId`, có CHECK. Chỉ `docType = contract` mới gắn được đối tác.
  - Không có `entityId`: số cộng mọi Chủ thể; nếu cặp có từ 2 Chủ thể trở lên thì hiện băng.
  - Service ghi đủ trường và tự suy khóa từ `partyKind`.
- **Cách tính và chứng minh số.**
  - Phân loại giao dịch chỉ dùng fragment trong `lib/ledger/transaction-classification.ts`. Tổng hiển thị = Σ các dòng.
  - Độ khớp với `queryDetailReport` được chứng minh bằng integration test, script tie-out đếm N lúc chạy, và đối chiếu tay với Excel gốc. Không đối chiếu lúc chạy.
- **Công thức** (người dùng chốt 2026-11-18):
  - "Hóa đơn còn phải lấy" và "giá trị − lũy kế lấy hàng" **loại thuế HĐ**;
  - "giá trị − đã chuyển tiền" dùng **số HĐ** của dòng thanh toán;
  - số liệu CĐT tính **gồm VAT**;
  - số dư đầu kỳ chỉ vào khối công nợ, kèm chú thích;
  - phần chưa thực hiện là bảng 3 × 2 (DT và TT).
- **Quyền xem.** Người có quyền đọc `du-an` thấy các tổng. Ba danh sách từng dòng của NCC hoặc đội chỉ hiện khi có thêm quyền đọc `cong-no-vt` hoặc `cong-no-nc`. Bản scan: ai đọc được dự án thì xem; tải lên và xóa cần quyền edit; xóa vĩnh viễn chỉ admin.
- **Sổ hóa đơn xuất CĐT.**
  - Thuộc dự án, nằm ở trang riêng `/du-an/[id]/hop-dong/hoa-don-cdt`, vì màn hợp đồng chỉ đọc số.
  - Có ký hiệu hóa đơn, unique theo (ký hiệu, số), cho phép số âm.
  - `Project.contractValue` hiện cạnh tổng giá trị các hợp đồng CĐT, có băng khi lệch.
- **Danh mục.** Bảng thường, sửa qua hộp thoại (người dùng chốt). Picker NCC dùng lại `listSupplierOptions`, picker đội dùng `listContractorOptions` mới.
- **Bản scan.**
  - Lưu ở volume `/data/uploads` (`UPLOAD_DIR`) của container.
  - Đặt `proxyClientMaxBodySize`, vì `proxy.ts` chặn mọi đường dẫn mà mặc định chỉ đệm 10MB.
  - Xóa mềm; admin xóa vĩnh viễn được. FK RESTRICT. Guard rollback chặn hoàn tác import khi hợp đồng đã được sửa.
  - Header theo MIME. Lượt tải về có audit. Lỗi lưu trữ không lộ đường dẫn trên máy chủ.
- **Action và guard.**
  - Action ghi trả `ActionResult` qua `runEntryAction`, payload `{ id }` hoặc `{}`.
  - `projectId` của thao tác sửa lấy từ DB, và mọi trường hợp không tìm thấy dùng cùng một câu báo.
  - Page chép mẫu guard `requireModuleAccess` của `hop-dong/page.tsx`.

## Success Criteria

Lấy theo 9 tiêu chí chấp nhận trong brainstorm. Bằng chứng ghi ở Phase 6.

- [x] **AC1:** bấm dòng trong danh mục thì mở được màn chi tiết.
- [x] **AC2:** tổng của cặp NCC × công trình khớp `queryDetailReport` đến từng đồng; script báo N/N; một cặp đã đối chiếu với Excel gốc.
- [x] **AC3:** hợp đồng đội và hợp đồng CĐT hiện danh sách rỗng, tổng 0; sau khi nhập thử thì số hiện đúng.
- [x] **AC4:** phần chưa thực hiện tính đúng; giá trị chưa nhập thì ghi "Chưa nhập giá trị".
- [x] **AC5:** cặp có từ 2 hợp đồng trở lên thì hiện băng gộp và tổng giá trị.
- [x] **AC6:** scan qua đủ allow, deny, cross-scope (gồm IDOR action), audit (gồm tải về), recovery; câu báo tiếng Việt; chạy được trong container có volume, kể cả tệp khoảng 24MB.
- [x] **AC7:** loại không phải hợp đồng kinh tế thì không có khối số.
- [x] **AC8:** dòng hợp đồng kiểu import có `valueVnd` hiện ở ô "Giá trị theo DT"; migration có rollback.
- [x] **AC9:** `risk:verify`, typecheck, lint, vitest (unit và integration) đều xanh.

## Ràng buộc

- Không đụng production (admin-pc). Thay đổi compose production chỉ được ghi vào runbook để chủ hệ thống tự chạy.
- Chạy thử trên bản sao `localhost:3001`. Sao lưu DB trước khi migrate.
- Không đọc sổ DT-HĐ-TT.
- Không commit `Quản Lý Công Nợ/` hay `.claude/agent-memory/`. Chỉ commit khi người dùng yêu cầu.
- Next.js 16: `params` là Promise; đọc `node_modules/next/dist/docs/` trước khi viết page hoặc route.

## Red Team Review

### Session 2026-11-18
- **Findings:** 37 thô, gộp còn 18 mục (19 dòng trong biên bản), gồm 15 mục Accept, 3 mục Reject, và các câu chuyển sang kiểm định.
- **Severity:** 1 Critical, 8 High, 10 Medium (đếm theo 19 dòng của biên bản).
- Chi tiết từng mục: [red-team-adjudication](./reports/red-team-adjudication.md). Người dùng chọn "Áp dụng 15 mục".

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Scan không có chỗ lưu bền và ghi được trong container | Critical | Accept | P1, P5, P6 |
| 2 | `proxy.ts` chỉ đệm 10MB body | High | Accept | P5 |
| 3 | Sửa một phần làm vỡ việc đổi đối tác | High | Accept | P3 |
| 4 | Import rollback bị chặn mãi, hoặc xóa âm thầm phần người dùng đã sửa | High | Accept | P1, P5 |
| 5 | Thiếu test IDOR cho action | High | Accept | P3, P4, P5 |
| 6 | Lỗi `fs` lộ đường dẫn tuyệt đối | High | Accept | P5 |
| 7 | `server-only` chưa được cài | High | Accept | P4 |
| 8 | Khôi phục nhầm dump; shadow DB; bản sao lệch main | High | Accept | P1, P6 |
| 9 | Thiếu `status = pending` | High | Accept | P3 |
| 10 | Guard page, props của form, cổng kiểm chỉ quét tệp đã track | Medium | Accept | P3, P4, P5 |
| 11 | Payload `ActionResult`, câu "Forbidden" | Medium | Accept | P3, P4, P5 |
| 12 | Đối chiếu lúc chạy thừa; số truy vấn sai | Medium | Accept | P2, P4, P6 |
| 13 | Header PDF, audit tải về, mẫu manifest | Medium | Accept | P5 |
| 14 | SQL LEFT JOIN, oracle Decimal | Medium | Accept | P4 |
| 15 | Unique số hóa đơn CĐT cần ký hiệu | Medium | Accept | P1, P4 |
| 16 | Phiếu ngày chưa chốt không hiện | Medium | Accept | P4, P5 |
| 17 | AC8 và AC3 không chứng minh được trên bản sao | Medium | Accept | P1, P6 |
| 18 | UI làm thêm ngoài yêu cầu; loader trùng | Medium | Accept | P3, P5 |
| 19 | Câu về độ an toàn của build cũ sai | Medium | Accept | P1 |
| — | Trần dung lượng scan; FK CASCADE; merge sửa một phần | — | Reject | — |

### Whole-Plan Consistency Sweep
Đã rà lại toàn bộ plan sau khi áp các thay đổi. Danh sách thay đổi và kết quả rà:

| Thay đổi | Kết quả rà |
|---|---|
| Bỏ `server-only` | Chỉ còn nhắc ở P4, để cấm dùng. |
| Bỏ đối chiếu lúc chạy và `canonical` trong `buildLedgerFigures` | P2, P4 và plan.md đã thống nhất; tie-out dùng `sumByEntityRounded`. |
| Không ghi cứng "99/99" | P4, P6 và AC2 đều dùng "N/N". |
| Bỏ "chỉ ghi trường có mặt" | P3 dùng "ghi đủ trường". |
| Bỏ `listContractPartyOptions` | Thay bằng `listSupplierOptions` + `listContractorOptions`. |
| Chuyển tiền theo số HĐ | U4 dùng `ΣC_hd`; P5 có nhãn tương ứng. |
| Hóa đơn CĐT được âm | CHECK ở P1, schema ở P4, U8 ở P2, nhập thử ở P6. |
| Thêm `invoiceSymbol` | P1 schema, P4 service, trang và test. |
| Dump | Restore ở P6 dùng dump sau migrate. |
| Guard page | P4 (`hoa-don-cdt`) và P5 (chi tiết). |
| Tính effort | Tổng 37h, khớp bảng phase. |

Không còn mâu thuẫn chưa giải quyết.

## Validation Log

### Quyết định của người dùng (2026-11-18)

| Câu hỏi | Trả lời | Áp vào |
|---|---|---|
| Áp dụng red-team | Áp dụng 15 mục | Toàn plan |
| Người chỉ có quyền đọc `du-an` thấy gì ở hợp đồng NCC/đội | Thấy các tổng; danh sách chi tiết cần thêm quyền `cong-no-vt` hoặc `cong-no-nc` | P4, P5 |
| Thuế HĐ trong "hóa đơn còn phải lấy" và "giá trị − lũy kế lấy hàng" | Loại ra | P2 |
| VAT của nghiệm thu và giá trị hợp đồng CĐT | Đã gồm VAT | P2 |
| `Project.contractValue` trùng giá trị hợp đồng CĐT | Hiện cạnh nhau, có băng khi lệch | P2, P4, P5 |
| Danh mục | Bảng thường + hộp thoại | P3 |
| Hóa đơn CĐT âm | Cho phép (chặn 0) | P1, P2, P4 |
| Tiền thật đã chuyển cho khối "giá trị − đã chuyển tiền" | Số HĐ của dòng thanh toán | P2, P5 |

### Verification Results
- **Đã kiểm:** 31 khẳng định ở phần fact-check của red-team, cộng các trace của Flow Tracer. 4 khẳng định sai, đã sửa:
  - câu về độ an toàn của build cũ;
  - mẫu manifest dùng `DELETE`;
  - I3 so bằng float;
  - JOIN `items`.
- **Đã kiểm lại trực tiếp:** matcher của `origin/main:proxy.ts:118-121`; `package.json` không có `server-only`.
- **Tier:** Full (6 phase).
- **Còn chưa kiểm:**
  - tên tệp trong `docs/user-guide/`;
  - khóa cấu hình chính xác của `proxyClientMaxBodySize`; P5 đọc tài liệu Next trước khi đặt;
  - production có đặt `UPLOAD_DIR` ngoài compose hay không; runbook xử lý bất kể đáp án.

## Câu hỏi còn mở

Không còn câu hỏi chặn việc triển khai. Có một việc ngoài phạm vi: đính kèm của task hiện có cũng bị hai lỗi hạ tầng (lưu tệp và proxy). Phần hạ tầng của plan này sửa luôn cho task, nhưng chưa có test riêng cho task.

## Kết quả triển khai (2026-11-18)

- Đủ 6 phase; bằng chứng từng AC: [dry-run-ban-sao-danh-muc-hop-dong](./reports/dry-run-ban-sao-danh-muc-hop-dong.md); runbook production: [go-live-runbook-danh-muc-hop-dong](./reports/go-live-runbook-danh-muc-hop-dong.md); hướng dẫn: `docs/user-guide/hop-dong-du-an.md`.
- Lệch so với phase file (có lý do, ghi trong báo cáo dry-run): script tie-out tên `scripts/verify-contract-detail-tie-out.ts` (`.gitignore` bỏ qua `scripts/check-*`); action scan nhận thêm `projectId` của client chỉ để đối chiếu (quyền luôn theo `projectId` trong DB); dòng audit tải về / xem dùng `tableName` "ProjectContractAttachment" như dòng audit tự ghi; giới hạn body nâng lên `26mb` / proxy `27mb`; guard hoàn tác chặn cả sửa thông tin hợp đồng sau commit, hợp đồng đã xóa chỉ chặn khi còn scan.
- Chưa commit (chờ người dùng yêu cầu).
