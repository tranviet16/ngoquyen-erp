---
phase: 1
title: "Inventory rủi ro và baseline an toàn"
status: pending
priority: P1
effort: "10h"
dependencies: []
---

# Phase 1: Inventory rủi ro và baseline an toàn

## Context links

- [Plan](plan.md), [kiến trúc ACL](../../docs/system-architecture.md), [test suite](../260516-comprehensive-test-suite/plan.md)

## Overview

Xây nguồn sự thật cho những gì phải được bảo vệ và xác nhận workspace/toolchain trước khi thay CI. Không chạy scan/load lên production trong phase này.

## Key insights

- ACL có module, project, department và role axis; test P0 phải phản ánh từng trục.
- Workspace hiện có source/test nhưng không thấy manifest build ở root; CI cũ giả định `package.json`. Phải xác minh checkout và command trước khi sửa gate.

## Requirements

- Canonical repository / clean checkout gate: repo URL, commit SHA, `git status`, remote và manifest/lockfile hợp lệ; toàn bộ command CI phải tái lập được trước Phase 2–8.
- Manifest machine-readable TypeScript tại `test/risk-manifest.ts`, export `RISK_MANIFEST_VERSION = 1`; record gồm `id`, kind/path/operation, tier, technical/business owner, data classification, authorization policy reference, required tests, recovery/kill switch.
- P0 nếu bề mặt thực hiện authn/authz; lộ/download/stream dữ liệu nhạy cảm; ghi/xóa tiền, payment approval, import bulk; làm mất audit trail; hoặc có thể gây unauthorized access, data exposure, sai số tiền hay outage toàn hệ thống. P1 là mutation có audit/blast radius giới hạn; P2 là UI read-only/trình bày.
- DB test chỉ chấp nhận tên `*_test`; fixture không dùng data production.

## Architecture

`risk-manifest` là input cho script diff classifier và checklist release. Một record P0 phải nêu ít nhất allow, deny, IDOR/cross-scope, audit và recovery owner.

## Related code files

- Create: `test/risk-manifest.ts` hoặc `test/risk-manifest.json`; `docs/operations/risk-register.md`.
- Modify: `docs/codebase-summary.md`; `.github/workflows/test.yml` chỉ sau khi xác minh command thực.
- Read: `app/api/**/route.ts`, `app/**/actions.ts`, `lib/acl/**`, `lib/auth.ts`, `lib/audit.ts`, `prisma/schema.prisma`.

## Implementation steps

1. Xác định canonical repo/commit và tạo checkout sạch; xác minh `git status`, remote, package manifest, lockfile, Vitest/Playwright config và toàn bộ command CI. Nếu không tái lập được, ghi blocker kèm vị trí canonical repo cần cung cấp và dừng các phase sau.
2. Chạy inventory có version: đếm route handlers, server actions, migrations, protected layouts và test hiện hữu; lưu output reviewable.
3. Đối chiếu từng API/action với authn, authz, scope resource và audit event thật; không suy diễn chỉ từ tên file.
4. Lập manifest P0: login/session, role/grants admin, ACL project/dept, payment approval, import apply, export, attachment/SSE.
5. Gán owner kỹ thuật và owner nghiệp vụ theo định danh team/user; owner không xác định là blocker release P0.
6. Tạo dataset seed cô lập, dùng synthetic/anonymized data; thêm guard ngăn DATABASE_URL production khi chạy test/load.

## Todo list

- [ ] Manifest P0/P1 review xong.
- [ ] Toolchain/CI command tái lập được từ checkout sạch.
- [ ] Test/load environment guard chứng minh không chạm production.
- [ ] Canonical checkout chạy tái lập được command CI; nếu không, blocker đã được escalated.

## Success criteria

- 100% API routes và mutation P0 có record; không có record P0 thiếu owner/test/recovery.
- Lệnh inventory phát hiện route/action mới chưa được phân loại.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Manifest thành tài liệu chết | CI so diff với manifest; reviewer cập nhật cùng PR |
| Chạy nhầm DB thật | fail-closed URL/name guard, account DB least privilege |

## Security considerations

Không đưa secret, user thật, dữ liệu tài chính thật vào fixture/report. Không đưa endpoint production hay token scan vào repo.

## Next steps

Phase 2 dùng manifest để chọn required checks.
