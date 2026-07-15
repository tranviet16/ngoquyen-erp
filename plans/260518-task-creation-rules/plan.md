---
title: Siết quy tắc tạo task
description: ''
status: completed
priority: P2
created: 2026-05-18T00:00:00.000Z
---

# Siết quy tắc tạo task

## Overview

Siết quyền tạo task trong `createTaskManual()`. Hiện bất kỳ thành viên phòng nào cũng tạo & giao task cho bất kỳ ai cùng phòng. Mục tiêu: admin/giám đốc tạo cho mọi người mọi phòng; trưởng bộ phận chỉ tạo trong phòng mình giao cho thành viên phòng mình; nhân viên thường chỉ tự giao cho chính mình. Trường hợp khác → dùng Phiếu phối hợp công việc. `assigneeId` thành bắt buộc.

Approach A (siết tại chỗ). Context đầy đủ: [reports/brainstorm-summary.md](./reports/brainstorm-summary.md).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Service authz rework](./phase-01-service-authz-rework.md) | Completed |
| 2 | [UI scoping form tạo task](./phase-02-ui-scoping-form-t-o-task.md) | Completed |
| 3 | [Tests](./phase-03-tests.md) | Completed |

## Dependencies

<!-- Cross-plan dependencies -->
