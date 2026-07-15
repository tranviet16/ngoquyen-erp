---
phase: 5
title: "An toàn release, migration và phục hồi"
status: completed
priority: P1
effort: "10h"
dependencies: [1, 2, 3]
---

# Phase 5: An toàn release, migration và phục hồi

## Context links

- [Plan](plan.md), [backup](../../scripts/backup-db.sh), [restore](../../scripts/restore-db.sh), [deploy docs](../../docs/operations/deploy.md)

## Overview

Đưa recovery từ “có script” thành khả năng đã kiểm chứng; ràng buộc release/migration theo quyết định rollback rõ ràng.

## Requirements

- Release candidate chạy full blocking suite, migration rehearsal và restore drill trên DB cô lập/anonymized.
- Migration có phân loại additive/destructive, data backfill idempotent/checkpoint/resume và rollback/repair decision trước merge.
- Có kill switch/config cho import apply, payment approval và export nhạy cảm khi khả thi.

## Architecture

Release checklist tiêu thụ manifest P0 và runbook. Restore drill tạo disposable DB, verify schema/data invariants và health check; không gọi `restore-db.sh --force` vào production.

## Related code files

- Modify: `scripts/backup-db.sh`, `scripts/restore-db.sh`, `docs/operations/backup-restore.md`, deploy/CI workflow cần thiết.
- Create: `scripts/verify-restore.sh`, `docs/operations/release-checklist.md`, `docs/operations/migration-policy.md`.
- Read: `prisma/migrations/**`, `docker/docker-compose.prod.yml`.

## Implementation steps

1. Characterize backup/restore scripts với disposable Postgres; kiểm tra exit code, checksum, row/schema invariant và app health.
2. Fix safety gaps tìm được: explicit target guard, non-production restore mode, locking/maintenance ownership, structured result; không tự sửa dữ liệu production.
3. Quy định migration two-step: additive deploy → backfill measured/resumable → contract cleanup ở release sau; destructive change cần owner/approval/repair plan.
4. Thêm RC checklist: full suite, dependency/secret findings, migration rehearsal, restore proof, P0 permission smoke, rollout/rollback owner.
5. Thiết kế kill switch tối thiểu ở shared config, audit all toggles, test enabled/disabled behavior và expiry/review.

## Todo list

- [x] Restore drill xanh trên disposable DB.
- [x] Migration policy được review.
- [x] Release checklist có owner ký nhận.

## Success criteria

- Restore drill bắt buộc reject production target, kiểm checksum/integrity backup, restore vào DB disposable, kiểm schema + row invariants + health check, và bảo đảm lỗi không để app production bị dừng.
- Backup không được coi là valid nếu chưa restore/verify thành công theo chu kỳ.
- Migration P0 không merge khi thiếu decision record.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Test restore nhầm target | disposable URL allowlist + deny production hostname/db |
| Feature flag thành nợ | owner, expiry, monthly review |

## Security considerations

Backup chứa dữ liệu nhạy cảm: encrypt at rest, least privilege, retention/access audit. Không commit credential.

## Next steps

Phase 7 theo dõi recovery drill success và change-failure rate.
