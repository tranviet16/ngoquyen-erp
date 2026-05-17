---
title: Công nợ lũy kế
description: >-
  Restructure công nợ VT/NC detail report into a pure cumulative report (8 cột
  TT/HĐ), include dieu_chinh to match báo cáo tháng, drop view toggle, fold ACL
  + remove 2 sidebar items.
status: completed
priority: P2
branch: main
created: 2026-05-17T00:00:00.000Z
tags:
  - ledger
  - cong-no
  - report
  - acl
  - refactor
---

# Công nợ lũy kế

## Overview

The "Công nợ chi tiết" report duplicates báo cáo tháng (has in-month columns + view toggle),
omits HĐ entirely, lacks an explicit Đầu kỳ column, and excludes `dieu_chinh` while báo cáo
tháng includes it — so numbers diverge. This plan rebuilds it as a **pure cumulative report**:
a cumulative ("lũy kế") version of báo cáo tháng with equivalent fields — Đầu kỳ / Phát sinh /
Đã trả / Cuối kỳ for BOTH TT (thực tế) and HĐ (hóa đơn). It is renamed "Công nợ lũy kế" and
removed as a standalone sidebar item (accessed via the parent VT/NC page tab).

## Confirmed Decisions (from brainstorm)

- **Đầu kỳ** = fixed inception opening balance from `ledger_opening_balances` (not running).
- **Grouping** = Chủ thể × NCC × Công trình, with entity-party and entity subtotals.
- **Name** = "Công nợ lũy kế".
- **Nav** = remove 2 sidebar "Chi tiết" entries; access via parent page `navLinks` tab; fold
  ACL `cong-no-vt.chi-tiet` / `cong-no-nc.chi-tiet` into parent module keys.
- **dieu_chinh** included with same sign-split as `queryMonthlyByParty` (positive→phát sinh,
  negative→đã trả), independently per TT and HĐ.
- `year/month` filter = cutoff ("tính đến hết tháng X"), not an in-month window.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Service rework](./phase-01-service-rework.md) | Completed |
| 2 | [UI table 8-col](./phase-02-ui-table-8-col.md) | Completed |
| 3 | [Pages nav ACL](./phase-03-pages-nav-acl.md) | Completed |
| 4 | [Tests](./phase-04-tests.md) | Completed |

## Dependencies

- Supersedes the completed plan `260514-1100-cong-no-detail-and-balance-service` (Sub-A),
  which originally built `/chi-tiet` with the now-removed view toggle and TT-only formula.
- No cross-plan blocking. Sequential: P1 → P2 → P3 → P4.
