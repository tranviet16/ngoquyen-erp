---
phase: 3
title: "Kiểm thử security, ACL và API P0"
status: pending
priority: P1
effort: "24h"
dependencies: [1, 2]
---

# Phase 3: Kiểm thử security, ACL và API P0

## Context links

- [Plan](plan.md), [ACL resolver](../../lib/acl/effective.ts), [security tests](../../e2e/security), [manual review](../260516-comprehensive-test-suite/SECURITY-MANUAL-REVIEW.md)

## Overview

Mở rộng coverage theo P0 path, ưu tiên chứng minh bị từ chối đúng trước happy path. Không thay assertion để che lỗ hổng.

## Requirements

- Mỗi endpoint/action P0: anonymous, allowed role, denied role, cross-user/project/dept IDOR và no-leak response khi phù hợp.
- Mutation P0: atomicity, audit actor/action/target/outcome, rollback/error path.
- Payment approval phải test self-approval, state transition sai và cross-scope access.
- Import apply phải test dry-run, validation, partial failure và idempotency/repair boundary.
- Với endpoint chỉ kiểm session, business owner phải ký decision record về role, resource scope và export/filter policy trước khi expected matrix được chốt; test không được tự tạo policy.

## Architecture

Data-driven contract tables sinh test matrix cho HTTP routes và server actions. DB integration test dùng client thật + cleanup hiện hữu để exercise Prisma audit extension; E2E chạy built app.

## Related code files

- Modify: `e2e/security/endpoints.ts`, `e2e/security/*.spec.ts`, `test/security/acl-enforcement.test.ts`, `test/helpers/fixtures.ts`.
- Create: P0 domain specs trong `test/integration/` và `e2e/security/` theo manifest.
- Read: `lib/acl/guards.ts`, `lib/acl/effective.ts`, `lib/audit.ts`, payment/import/export services, `app/api/**/route.ts`.

## Implementation steps

1. Freeze semantics hiện có bằng unit tests cho ACL module/project/dept/role axes và explicit override/grant-all cases.
2. Với API/export/cascade session-only, tạo business authorization decision record: allowed roles, project/dept filtering, response fields và owner. Không viết assertion allow/deny trước record này.
3. Từ manifest và decision record, audit từng route/action để lập expected status và enforcement layer; update table thay vì test rời rạc.
4. Thêm IDOR test cho read lẫn mutation: user B không đọc/sửa/xóa resource của A; assert body không lộ metadata/signed URL.
5. Thêm server-action integration tests cho permission admin, payment workflow, import apply và export filtering với DB thật.
6. Kiểm thử audit trail trong success/failure where guaranteed; phân biệt audit failure với action business failure.
7. Chạy static route guard audit như supplementary check; thay manual checklist staging bằng environment disposable: synthetic seed, role matrix, attachment file, SSE hai user và workbook export inspection.
8. Bất kỳ unexpected 2xx là security incident: cô lập, đánh giá blast radius, sửa production code và thêm regression trước merge.

## Todo list

- [ ] P0 allow/deny/IDOR matrix xanh.
- [ ] P0 mutation có audit + transaction invariant tests.
- [ ] Manual review có owner và date.

## Success criteria

- Không còn P0 route/action thiếu negative test.
- 403/401 phản hồi không chứa dữ liệu protected.
- ACL/resource scope regression chặn merge qua Phase 2.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Expected matrix sai | Derive từng cell từ handler/service thực, review 2 người |
| Test raw request bỏ qua enforcement layer | E2E built server + assertion enforcement source |

## Security considerations

Không dùng session giả để thay cho E2E P0; token tampered được tạo synthetic. Chỉ seed test users.

## Next steps

Emit structured signals ở Phase 4 cho deny/audit failure được test ở đây.
