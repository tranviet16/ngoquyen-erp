---
title: "Rewrite Phan loai chi phi (filter view) + costBehavior"
description: >-
  Rewrite `/tai-chinh/phan-loai-chi-phi` từ CRUD master hierarchy thành filter view
  trên journal_entries (4 nhóm composed key). Thêm `costBehavior` enum cho JE.
status: completed
priority: P2
created: 2026-05-11
---

# Rewrite Phân loại chi phí (filter view)

## Overview
Trang `/tai-chinh/phan-loai-chi-phi` đang là CRUD `ExpenseCategory` — sai purpose so với SOP (phải là TRA CỨU/FILTER giao dịch). JE schema thiếu `costBehavior` (cố định vs biến đổi) để map 4 nhóm SOP: Thu cố định, Thu biến đổi, Chi cố định, Chi biến đổi. Rewrite page thành filter view + thêm `costBehavior` enum + backfill JE cũ default `variable`.

**Context:** [brainstorm-summary.md](./reports/brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implementation](./phase-01-implementation.md) | Pending |

## Dependencies
Không phụ thuộc Plan A (CashAccount). Ship song song được. Nếu ship sau Plan A → cột "Nguồn" trong bảng kết quả lấy name từ FK; ship trước thì lấy string trực tiếp.
