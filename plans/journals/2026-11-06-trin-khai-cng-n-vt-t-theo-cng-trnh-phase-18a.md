---
title: Triển khai công nợ vật tư theo công trình (phase 1–8a)
date: 2026-11-06
summary: Code xong 8 phase qua nhiều agent song song; unit/tsc/lint/build xanh; integration chờ Docker
---

# Triển khai công nợ vật tư theo công trình (phase 1–8a)

## What happened
- Chạy `/ak:cook` cho `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/` theo các luồng song song có tách tệp: P1+P2 và P6, rồi P3, P4, P5, rồi P7 và P8a, cuối cùng một vòng review và một vòng sửa.
- Kết quả: `tsc` 0 lỗi, 1204/1204 unit test (trước đó 960), eslint sạch, `next build` thành công.
- Docker Desktop tắt cả phiên, nên chưa chạy migration, integration, e2e và hai script SQL. SQL chỉ được parse-check bằng pglast.
- Smoke trên dữ liệu Excel thật: 11/11 dòng sau mốc ghép được với phiếu; tách CDC đúng; 16/23 neo khớp (7 neo lệch là do chính Excel).

## Decision
- Người dùng chọn xác nhận từng đợt thanh toán `vat_tu` còn mở thay vì chặn cứng; chỉ chặn đợt trùng số tiền với một dòng "Trả Nợ".
- Review phát hiện 16 điểm, không có lỗi Critical về logic; đã sửa #2–#16. Các điểm đáng nhớ:
  - guard mốc chỉ đọc ngày qua JSONB;
  - sửa số dư ban đầu theo id;
  - server action trả `{ok, message}` vì production ẩn thông điệp lỗi;
  - script dọn có danh sách giữ lại NCC;
  - audit của bước đông cứng marker ghi trong cùng transaction.
- Đã stage xóa 12 tệp (3 adapter cũ, component chết, một test cũ) bằng `git rm`, vì test entrypoint đọc `git ls-files`.

## Next steps
- Bật Docker, `prisma migrate deploy` trên DB `_test`, rồi `pnpm test:integration` và e2e.
- Chạy thử runbook Phần A trên `ngoquyyen_erp_dryrun`; người dùng duyệt danh sách dọn; go-live.
- Đề xuất riêng: chuyển các server action còn lại trong repo sang mẫu `{ok, message}`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
