---
phase: 2
title: "Bootstrap CI và quality lane"
status: pending
priority: P1
effort: "12h"
dependencies: [1]
---

# Phase 2: Bootstrap CI và quality lane

## Context links

- [Plan](plan.md), [workflow hiện có](../../.github/workflows/test.yml), [flaky policy](../260516-comprehensive-test-suite/FLAKY-TESTS.md)

## Overview

Dựng các lane CI theo rủi ro ở report-only trước. Required check và branch protection chỉ được bật tại Phase 8 sau khi Phase 3 hoàn chỉnh P0 security contract. Không đưa load test vào PR gate.

## Requirements

- Base PR: dependency install reproducible, Prisma generate/migrate test DB, typecheck, lint, unit/integration.
- Diff chạm P0 (`app/api`, `lib/acl`, `lib/auth`, `lib/audit`, Prisma migration/schema, permission actions) phải chạy security lane và review checklist.
- E2E/security lane có tên status ổn định; trong phase này chỉ report để tìm gap. Coverage và performance chỉ report.
- Chưa cấu hình branch protection hoặc required checks trong phase này.

## Architecture

`changed-files → risk-manifest classifier → required jobs`. Fallback fail-closed: không phân loại được file P0 thì chạy security lane. Job không được rely vào `continue-on-error` cho security/ACL/API.

## Related code files

- Modify: `.github/workflows/test.yml`; `package.json` và lockfile sau Phase 1 verification; test config hiện hữu.
- Create: `scripts/classify-risk-change.ts`; `docs/operations/ci-quality-gates.md`.
- Read: `test/security/acl-enforcement.test.ts`, `e2e/security/**`, `test/performance/**`.

## Implementation steps

1. Viết test cho classifier: P0 paths, mixed changes, rename/delete, unknown path; unknown P0-like path phải chọn strict lane.
2. Tách CI thành baseline, security-contract, E2E-security; cache chỉ là tối ưu, không được làm mất clean install.
3. Chạy migration trên service Postgres ephemeral trước integration/E2E; upload report/artifact dù thất bại.
4. Thêm secret/dependency scan đã pin version; triage finding có severity/owner, không log secret.
5. Chạy PR thử, ghi runtime/flaky baseline và chứng minh lane nhận đúng diff P0/P1; không bật branch protection trước khi Phase 3 pass.
6. Bổ sung expiry SLA cho `@flaky`/`it.skip`; mọi skip thiếu owner, issue và deadline làm job thất bại.

## Todo list

- [ ] Risk lanes hiện trên PR thử với status names ổn định.
- [ ] Security lane fail được report đúng; activation deferred sang Phase 8.
- [ ] Flaky policy được máy kiểm tra.

## Success criteria

- CI lanes tái lập được từ canonical checkout và phân luồng đúng P0/P1 diff.
- Performance/coverage vẫn report nhưng không làm PR đỏ do runner noise.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Path classifier bỏ sót file nhạy cảm | Default strict; manifest review bắt buộc |
| CI quá chậm | Chỉ chạy heavy lane theo diff; đo median runtime |

## Security considerations

Secrets chỉ qua GitHub secret/env runtime; PR từ fork không nhận secret hoặc target production.

## Next steps

Phase 3 bổ sung các suite được Phase 2 gọi.
