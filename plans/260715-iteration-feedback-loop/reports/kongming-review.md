# Phản biện thiết kế

## Kết luận

Nền hiện hữu đã có Vitest, Playwright, ACL resolver, test IDOR/auth-bypass, N+1 query-count, load runner và CI unit/E2E. Hướng đúng là tăng cường theo rủi ro, không tạo full-suite đồng hạng cho mọi PR.

## Rủi ro cần khóa

- Coverage `lib/` khoảng 30.93%; không dùng số này thay cho P0 path coverage.
- CI workflow tồn tại nhưng cần xác nhận run xanh và branch protection thật sự bắt buộc.
- Baseline load hiện chưa được hiệu chuẩn ở môi trường ổn định.
- Monitoring có Uptime Kuma; error tracking còn tùy chọn.
- Route-guard audit là kiểm tra tĩnh, không thay được resource-level authz/IDOR E2E.

## Nguyên tắc được đưa vào kế hoạch

- P0: authn/authz, project/dept scope, permission admin, payment approval, import/export nhạy cảm.
- Gate theo diff; security failures không được hạ assertion chỉ để CI xanh.
- Mọi incident phải có tái hiện, blast radius, repair/rollback, regression test và metric xác minh.
- Performance đo ngoài PR runner; query-count chỉ ratchet, không tự nới baseline.
