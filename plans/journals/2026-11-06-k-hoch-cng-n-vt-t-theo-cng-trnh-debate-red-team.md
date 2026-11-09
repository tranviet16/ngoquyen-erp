---
title: Kế hoạch công nợ vật tư theo công trình (debate + red-team)
date: 2026-11-06
summary: Lập kế hoạch 8 phase (89h) đưa theo dõi vật tư theo công trình và chuyển đổi Excel vào ERP; red-team sửa 2 lỗi Critical
---

# Kế hoạch công nợ vật tư theo công trình (debate + red-team)

## What happened
- Brainstorm, rồi `/ak:plan --debate`, cho tính năng công nợ vật tư theo công trình: thay thư mục Excel `Quản Lý Công Nợ/` (file tổng, CSV lũy kế, 24 file theo dõi).
- Kế hoạch nằm ở `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/`. Có 3 ứng viên độc lập (2 planner, kongming) và 4 reviewer red-team (36 phát hiện thô, gộp còn 15). Validate 7 câu với người dùng.
- Nhận định sai giữa phiên: lúc đầu tôi kết luận 11 dòng 27–31/10 không có khối lượng, và người dùng đã chỉ ra là sai. Nguyên nhân: ô ngày có số ngày > 12 được Excel lưu thành chữ, còn ô có số ngày ≤ 12 thì bị đảo ngày/tháng; script chỉ đọc ô kiểu date.
- Code hiện tại không như giả định ban đầu:
  - import chưa có bước ánh xạ (`commit-panel.tsx:26` gửi `{}`);
  - parser file tổng bỏ cả 922 dòng Nhập Liệu vì cột NCC có tiêu đề trống;
  - `du-an/[id]/cong-no` đọc `project_transactions`, không đọc snapshot.

## Decision
- Phạm vi đối chiếu, chốt, ký, khóa là NCC × công trình. Khóa advisory vẫn theo NCC, theo quy ước "khóa rồi mới kiểm".
- Một adapter `vat-tu-chuyen-doi`, một lần chạy cho cả thư mục. Xem trước chạy thử đúng đường mã ghi và đối soát rồi rollback; commit phải đúng `reviewVersion` đã xem.
- Tới 26/10, tiền chỉ lấy từ Nhập Liệu. Phiếu lịch sử không gắn `deliveryId`. Marker chuyển đổi 01/01→26/10 được ký ngay, cộng guard mốc toàn cục.
- Dòng lũy kế ghi ngày 26/12/2025, vì 31/12 rơi vào Kỳ chuẩn T1/2026 (27/12→26/01).
- Tân Lộc CDC và ĐVP-CDC là hai công trình; dòng CDC trong Số Dư được tách theo cột J/P của CSV.
- Dọn và bù công trình cho dữ liệu cũ trước migrate. CHECK được kiểm ngay lúc migrate (bỏ phương án NOT VALID).
- Hai lỗi Critical red-team đã sửa trong plan:
  - đợt `vat_tu` đóng sau go-live ghi `thanh_toan` theo ngày đóng, làm trừ nợ hai lần;
  - bấm Ghi lần hai biến run đã ghi thành `failed`, sau đó run bị xóa và `importRunId` của marker bị đặt NULL.

## Next steps
- `/ak:cook plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/plan.md`. Luồng song song: P2→P3, P5, P6, P4; sau đó P7, cuối cùng P8.
- Trước go-live: bật Docker, đếm dòng đợt `vat_tu` thiếu công trình và `thanh_toan` từ đợt; chạy thử trên DB riêng `ngoquyyen_erp_dryrun`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
