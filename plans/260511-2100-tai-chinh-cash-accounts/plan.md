---
title: "CashAccount + opening balance (Tai chinh NQ)"
description: >-
  Thêm master data CashAccount + opening balance, FK trên JournalEntry,
  seed 7 nguồn tiền từ SOP, backfill JE cũ, báo cáo thanh khoản chuẩn.
status: pending
priority: P2
created: 2026-05-11
---

# CashAccount + opening balance (Tài chính NQ)

## Overview
JournalEntry hiện dùng `fromAccount/toAccount` string tự do → typo lệch balance, KPI vị thế tiền mặt chỉ là delta, báo cáo thanh khoản không tính được. Thêm model `CashAccount` + FK cứng, seed 7 record từ SOP, backfill JE cũ qua name match.

**Context:** [brainstorm-summary.md](./reports/brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implementation](./phase-01-implementation.md) | Pending |

## Dependencies
None. Có thể ship song song với plan `260511-2105-tai-chinh-phan-loai-filter`.
