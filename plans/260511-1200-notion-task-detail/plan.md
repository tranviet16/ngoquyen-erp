---
title: "Notion-style Task Detail Panel"
description: ""
status: pending
priority: P2
created: 2026-05-11
---

# Notion-style Task Detail Panel

## Overview

Refactor task detail UI in `app/(app)/van-hanh/cong-viec` from a small modal into a Notion-style side drawer: inline editable title, properties table with click-to-edit rows, markdown description (Soạn/Xem tabs), auto-save with 800ms debounce, and tabs for Subtasks / Comments / Files / Activity (AuditLog-derived). Kanban card untouched. Reuses existing server actions and section components — styling/layout refactor, not a data-model rewrite.

**Reference:** [brainstorm-summary.md](./reports/brainstorm-summary.md)

**Effort:** ~1.5–2 dev days (5 phases)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Foundation & Drawer Shell](./phase-01-foundation-drawer-shell.md) | Pending |
| 2 | [Properties Table & Auto-save](./phase-02-properties-table-auto-save.md) | Pending |
| 3 | [Markdown Description](./phase-03-markdown-description.md) | Pending |
| 4 | [Tabs (Subtasks/Comments/Files/Activity)](./phase-04-tabs-subtasks-comments-files-activity.md) | Pending |
| 5 | [Polish & Verification](./phase-05-polish-verification.md) | Pending |

## Dependencies

<!-- Cross-plan dependencies -->
