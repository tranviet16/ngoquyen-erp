# Tạo tài khoản người dùng từ trang quản trị

## Mục tiêu

Cho phép admin đang hoạt động tạo tài khoản active mặc định tại `/admin/nguoi-dung`, với tên, username, email, mật khẩu khởi tạo (tối thiểu 12 ký tự), vai trò và phòng ban tùy chọn.

## Trạng thái

Implemented and reviewed — 580 unit tests, Better Auth/PostgreSQL integration contract, lint, typecheck, risk manifest và production build đã xanh; chờ merge và production smoke. Không cần migration Prisma: `User` đã có unique `email`/`username`, `role`, `departmentId`, `isActive`.

## Phạm vi đã xác minh

- Trang hiện render theo module access nhưng mutation chỉ chấp nhận role literal `admin`. Phase này thống nhất trust boundary bằng cách giới hạn page và create action về admin active; không mở rộng quyền cho role động.
- Tách cấu hình Better Auth thành primary instance và provisioning instance dùng cùng Prisma/secret/plugins. Primary instance tắt public signup trừ khi `E2E=true` (không dùng cờ `CI`); provisioning instance không mount HTTP và cấu hình `autoSignIn:false`, nên tạo User + credential Account mà không tạo Session hay thay cookie admin.
- Audit interceptor hiện hữu là nguồn audit duy nhất cho `User.create/update/delete`; không thêm audit thủ công trùng. `Account`/`Session` tiếp tục nằm trong `SKIP_AUDIT`, nên password/token không vào audit.
- Compensation chỉ xóa đúng ID user vừa được provisioning tạo, trước khi response thành công và trước khi user có dữ liệu nghiệp vụ. Account cascade theo User; audit lịch sử được giữ lại có chủ đích.
- Risk manifest hiện đã liệt kê `app/(app)/admin/nguoi-dung/actions.ts` là P0 (`action-user-grants`); không thêm entry trùng.

## Phase

1. [Phase 01 — server flow, dialog và verification](phase-01-create-user-account.md)

## Điều kiện hoàn tất

- Non-admin, admin inactive và session rỗng bị từ chối trước bất kỳ ghi DB/auth create nào.
- Thành công tạo được credential login, username/email không trùng, role/phòng ban hợp lệ, `isActive=true`, không tạo session ngầm, audit không chứa mật khẩu.
- Lỗi sau auth create được compensate sạch đúng User cùng Account; duplicate trả lỗi hữu ích, không tạo record mới và không xóa tài khoản tồn tại trước đó.
- Unit/P0 contract, lint/type/build và E2E admin create → login đều xanh; deploy dùng image SHA và smoke test xác nhận luồng.
