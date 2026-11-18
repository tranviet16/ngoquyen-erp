---
title: DT-HD-TT release 2 entry and mapping screens
date: 2026-11-17
summary: "Phases 6, 7, 9 built, reviewed, verified and dry-run on the local copy"
---

# DT-HD-TT release 2 entry and mapping screens

﻿## What happened
Phases 6, 7 and 9 of the DT-HD-TT plan built and verified in worktree feat/du-an-dt-hd-tt: three entry books (Hoa don, Thuc te nhap, Chi thuc te), mapping screens (Anh xa, Dau moi, Ma nhom), user guide and release 2 runbook. Subagents wrote the code; their Bash could not spawn (ENAMETOOLONG), so the controller ran tsc, eslint, unit (1321) and integration (24 files / 142) via PowerShell and fixed two small issues (test session leak into the audit FK, one tsc generic).

## Decisions
- Reviews found lost-update on grid edits, refusals hidden in production, and unparseable dates saved as null; fixed with patch-merge under the project lock, ActionResult refusals, strict cell parsers.
- Invoice entry is refused while legacy non-derived HD transactions exist, to avoid double counting in the old tabs.
- Alias writes re-sync derived transactions only when placement changes, with a 60 s transaction timeout.

## Dry run on the local copy
One entry per book, one mapped name, one H figure: reports and old tabs moved by exactly the entered amounts, all tie-outs stayed green, and rollback of the import is refused listing every edited row.

## Next steps
Commit phases 6, 7, 9 (pending user OK); production deploy only after explicit approval.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
