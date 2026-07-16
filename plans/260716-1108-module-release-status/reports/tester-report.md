# Báo cáo kiểm thử — 2026-07-16 — trạng thái phát hành module

---
role: tester
scope: module-release-status
status: pass-with-blocker
---

## Tóm tắt

- Focused unit: **45/45 pass** (5 files).
- Full unit: **627/627 pass** (60 files).
- Integration/security: **30/30 pass** (8 files).
- TypeScript, ESLint, risk manifest: **pass**.
- Production build: **pass** khi cung cấp các biến môi trường build bắt buộc trong process.
- Migration mới: **applied**, schema up-to-date, CHECK constraint đúng.
- Blocker E2E: integration cleanup để lại `module_availability` rỗng; migration đã applied nên `migrate deploy` không chèn lại 18 row.

## Bằng chứng chạy kiểm thử

| Gate | Lệnh | Kết quả |
|---|---|---|
| Focused ACL/action/UI/entrypoint | `pnpm exec vitest run --project unit ...` | 5 files, 45 tests pass, 0 fail |
| Full unit | `pnpm test` | 60 files, 627 tests pass, 0 fail |
| ACL rollout bổ sung | `pnpm exec vitest run --project unit lib/acl/__tests__/effective.test.ts lib/acl/__tests__/role-permissions.test.ts --reporter=verbose` | 2 files, 64 tests pass |
| Integration/security | `pnpm test:integration` | 8 files, 30 tests pass, 0 fail |
| TypeScript | `pnpm exec tsc --noEmit` | exit 0 |
| ESLint | `pnpm lint` | exit 0 |
| Risk manifest | `pnpm risk:verify` | exit 0; 10 API routes + 20 server-action files |
| Production build | `pnpm build` | compile, TypeScript, 37 static pages và route manifest pass |

Build đầu tiên không có env dừng ở collect-page-data do thiếu `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Chạy lại bằng DB test và auth placeholder chỉ tồn tại trong process đã pass; không sửa hoặc in secret thật.

## Xác minh hành vi

### Fail-closed

- `lib/acl/module-availability.ts` khởi tạo toàn bộ key là `development`; chỉ row hợp lệ mới ghi đè.
- Focused tests pass cho missing row, invalid status và lỗi DB; lỗi DB không log chuỗi lỗi có credential.
- `assertModuleReleased` từ chối module development.
- Tests bổ sung xác nhận development chặn cả admin, shared role guard và project list trước khi tải user/project data.

### ACL entitlement trước development

- `requireModuleAccess`: authenticate → `canAccessEntitlement` → Forbidden nếu thiếu quyền → kiểm release → redirect development.
- `guards.test.ts` pass: user thiếu entitlement không gọi `isModuleReleased`; user có entitlement mới nhận redirect `/dang-phat-trien`.
- Sidebar dùng raw entitlement và availability map song song, nên module development chỉ hiện cho user vốn có quyền.

### Action atomic và audit

- `updateModuleAvailability` xác thực active admin, khóa `admin.permissions`, allowlist key/status và từ chối hai core module.
- Update và `auditLog.create` nằm trong cùng interactive transaction với isolation `Serializable`; revalidate chỉ chạy sau transaction hoàn tất.
- Action test pass cho deny trước transaction, core lock, invalid input, unchanged no-op, before-state + update + audit cùng callback.
- Khoảng trống: chưa có test cố ý làm `auditLog.create` lỗi để chứng minh rollback DB thực; tính atomic hiện được xác minh bằng cấu trúc transaction và unit mock, chưa bằng integration.

### Entry point coverage

- Contract test đối chiếu toàn bộ 20 file trong server-action risk manifest: 19 file module được map, `ho-so/actions.ts` là ngoại lệ ngoài catalog.
- Mỗi exported async function trong 19 action files và 3 bespoke API files phải có đúng một `assertModuleReleased` theo module map; test pass.
- Hai payment child layout (`ke-hoach`, `tong-hop`) có `requireModuleAccess`; test pass.
- Risk verifier độc lập pass với 10 API routes và 20 server-action files.
- UI contract pass: semantic switch, touch target, mobile `h-dvh`, pending/error announcements, synthetic inert shell không fetch/render dữ liệu nghiệp vụ.

## Migration và test DB

- `pnpm exec prisma migrate status`: 46 migrations; database schema up to date.
- `_prisma_migrations`: `20260716113000_add_module_availability` có trạng thái applied.
- PostgreSQL catalog: `module_availability_status_check` chỉ cho `ready|development`.
- Sau integration suite, bảng có `rows=0, ready=0, development=0`. Nguyên nhân: `test/helpers/test-db.ts::truncateAll()` truncate mọi bảng public trừ `_prisma_migrations`; không reseed bảng cấu hình.
- Vì migration đã applied, chạy lại `prisma migrate deploy` không phục hồi 18 row. E2E chạy ngay sẽ fail-closed toàn bộ module.

## Blocker và khuyến nghị

1. **Blocker E2E:** restore 18 row availability hoặc recreate/reset test DB trước E2E.
2. Sửa lifecycle integration về sau: preserve/reseed `module_availability` sau truncate, hoặc cung cấp fixture baseline rõ ràng.
3. Thêm migration integration test cho backfill 18 row + CHECK rejection; suite hiện chưa kiểm trực tiếp backfill trên DB mới.
4. Thêm integration rollback test khi audit insert lỗi.

## Câu hỏi chưa giải quyết

- E2E sẽ restore baseline bằng reset DB hay seed fixture chuyên biệt?
- `module_availability` nên được loại khỏi `truncateAll()` hay được reseed sau mỗi truncate?
