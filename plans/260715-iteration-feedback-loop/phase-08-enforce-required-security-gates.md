---
phase: 8
title: "Bật required security gates"
status: pending
priority: P1
effort: "4h"
dependencies: [1, 2, 3]
---

# Phase 8: Bật required security gates

## Context links

- [Plan](plan.md), [CI bootstrap](phase-02-pr-quality-gates.md), [P0 contracts](phase-03-security-acl-api-coverage.md)

## Overview

Chỉ sau khi security matrix P0 xanh, kích hoạt hard gate và branch protection trên canonical repository. Đây là cấu hình GitHub ngoài repo, cần owner có quyền admin.

## Requirements

- Required status names cố định: baseline, security-contract, e2e-security.
- Owner có GitHub admin quyền cấu hình branch protection và lưu bằng chứng PR bị chặn khi một check fail.
- Performance/load/coverage vẫn không là required check.

## Related code files

- Modify: `.github/workflows/test.yml` nếu cần chốt status name.
- Create: `docs/operations/branch-protection-evidence.md`.

## Implementation steps

1. Xác nhận canonical Git remote, protected branch và GitHub admin owner từ Phase 1.
2. Mở PR thử thay đổi ACL/API có fixture failing kiểm soát; xác nhận security-contract và e2e-security fail đúng.
3. Cấu hình required checks `baseline`, `security-contract`, `e2e-security`; yêu cầu branch up-to-date theo policy đội ngũ.
4. Thử merge PR failing để lưu evidence bị chặn; revert fixture, chạy PR xanh và xác nhận merge hợp lệ.
5. Document owner, check names, cách thay đổi policy và break-glass process có audit.

## Success criteria

- ACL/auth/API/migration change không merge được nếu required security gate fail.
- Có evidence PR fail bị chặn và PR xanh được phép merge.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Gate chặn mọi PR do flaky test | Chỉ activate sau Phase 3, flaky policy enforced |
| Không có GitHub admin | Escalate; không tuyên bố gate active |

## Security considerations

Branch protection override/break-glass phải restricted và audit được.
