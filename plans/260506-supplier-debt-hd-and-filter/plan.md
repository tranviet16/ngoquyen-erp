---
title: Supplier debt HD columns + multi-supplier filter
description: ''
status: completed
priority: P2
created: 2026-05-06T00:00:00.000Z
---

# Supplier debt HD columns + multi-supplier filter

## Overview

Trang `Quản lý dự án → [dự án] → Công nợ NCC` hiện chỉ hiển thị 3 cột tiền TT (Lấy hàng / Đã trả / Còn nợ) → không khớp file import vì file gốc có cả cặp HĐ. Plan này: (1) bổ sung 3 field HĐ vào snapshot table, (2) adapter parse thêm 3 cột HĐ, (3) UI hiển thị 6 cột tiền + multi-select NCC qua URL param.

**Key files:**
- `app/(app)/du-an/[id]/cong-no/{page,cong-no-client}.tsx`
- `lib/du-an/supplier-debt-service.ts`
- `lib/import/adapters/du-an-xay-dung.adapter.ts` (block "Công Nợ" ~line 385-418, INSERT ~line 685-700)
- `prisma/schema.prisma` model `ProjectSupplierDebtSnapshot` (line 741)

**Acceptance:** sau re-import file mẫu, tổng `Còn nợ TT + Còn nợ HĐ` khớp tổng trên file Excel; chọn 1 NCC / nhiều NCC / để trống đều filter đúng.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema migration](./phase-01-schema-migration.md) | Completed |
| 2 | [Adapter HD parse](./phase-02-adapter-hd-parse.md) | Completed |
| 3 | [Service+UI HD+filter](./phase-03-service-ui-hd-filter.md) | Completed |
| 4 | [Verify](./phase-04-verify.md) | Completed |

## Dependencies

<!-- Cross-plan dependencies -->
