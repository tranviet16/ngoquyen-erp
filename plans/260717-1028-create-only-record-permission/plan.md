---
title: "Quyền create-only cho record ERP"
description: "Tách quyền tạo record khỏi chỉnh sửa/xóa, giữ admin bypass và bind capability từ server qua 7 module user-scoped."
status: in_progress
priority: P1
effort: 8-12d
branch: main
tags: [feature, auth, backend, frontend, database, critical]
blockedBy: []
blocks: []
created: 2026-07-17
---

# Quyền `create` độc lập cho record ERP

## Overview

Chuẩn hóa hierarchy `read < comment < create < edit`. `create` chỉ tạo record mới; `edit` tạo/sửa/xóa. Role literal `admin` bypass bằng predicate riêng, không còn nằm trong `AccessLevel`. Áp dụng 7 module đã chốt; admin-only modules và self-actions giữ nguyên scope.

## Quyết định kiến trúc

- Một canonical business `AccessLevel`: `read|comment|create|edit`; trục module/project/dept/role dùng cùng thứ tự.
- Server guard authoritative. Server Components resolve `canCreate/canEdit/canDelete`; client chỉ render capability, không suy từ role.
- Pure create dùng min `create`; update/delete/mixed/workflow dùng `edit`; raw override dùng exact admin.
- `PaymentRound.departmentId` bất biến. Legacy null fail-closed/admin-only. Đây là dependency để bật create Thanh toán.
- `thanh-toan.tong-hop` chỉ `read`; không expose create/edit controls.

## Phases

| Phase | Tên | Status | Gate |
|---|---|---|---|
| 1 | [Characterization và contract inventory](./phase-01-characterization-contracts.md) | Completed | characterization tests green |
| 2 | [ACL domain và migration dữ liệu](./phase-02-acl-domain-migration.md) | Completed | migration + ACL contracts green |
| 3 | [Guard CRUD cho project, vật tư, công nợ](./phase-03-direct-crud-guards.md) | Completed | server-side guards verified |
| 4 | [Payment dept scope và workflow guards](./phase-04-payment-and-workflow-guards.md) | Completed | integration + atomicity checks green |
| 5 | [Server-derived UI capabilities](./phase-05-server-derived-ui-capabilities.md) | Completed | E2E permission journeys green |
| 6 | [Regression, docs và deploy](./phase-06-regression-docs-deploy.md) | In progress | production migration/rebuild/probes pending |

## Dependencies

- PostgreSQL migration chạy trước application binary mới.
- Hệ thống không có staging. Mọi rehearsal chạy trên disposable local DB restore từ backup production đã mã hóa và khử nhạy cảm; rollout production dùng maintenance window và canary accounts.
- Payment UI không bật create cho non-admin trước khi dept backfill/filter verification đạt.
- Không sửa `SOP/*.xlsx`, `docx/`, profile/notification self-actions, hoặc admin-only business modules.

## Acceptance criteria

- Create-only tạo được record ở đúng scope nhưng mọi update/delete/mixed/workflow bị 403/error server-side.
- Edit làm được create/update/delete; read/comment không tạo record; admin literal vẫn bypass.
- Không còn production caller dùng `admin` như `AccessLevel`; 55 callsite được phân loại và test.
- Mixed batch atomic; payment legacy null không lộ cho non-admin; Tổng hợp chỉ read/export.
- Migration/backfill, unit/integration/E2E, lint, build và deploy probes đều green.

## Handoff

Thực thi tuần tự: `/ck:cook C:/Users/Admin/Desktop/ngoquyyen-erp/plans/260717-1028-create-only-record-permission/plan.md`
