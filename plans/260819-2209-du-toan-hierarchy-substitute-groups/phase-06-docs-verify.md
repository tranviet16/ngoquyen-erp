# Phase 06 — Docs, changelog, full gates

## Context links

- `docs/system-architecture.md` (nếu có section du-an module)
- `docs/project-changelog.md`
- `docs/code-standards.md` (nếu chưa có convention về pure helpers vs `"use server"`)
- `docs/journals/` (thư mục journal daily)

## Overview

Cập nhật docs cho: convention phân cấp hạng mục (regex + degradation), semantics nhóm vật liệu thay thế, runbook gán ngoài-DT. Chạy full test/typecheck/build và verify walkthrough.

## Requirements

- FR1: Section mới "Phân cấp hạng mục & nhóm vật liệu thay thế" trong `docs/system-architecture.md` (hoặc file mới nếu chưa có section du-an):
  - Regex `^(HM\d+)-(.+)$` — 2 levels; non-matching degrade 1 level.
  - Suppression contract: `normVtName(unit)` không đồng nhất → qty/price null, chỉ hiện tiền.
  - Nhóm thay thế: per-project scope, cross-category=reject, member flag muted, group flag authoritative.
  - Rollup ở TS-layer; views KHÔNG đổi.
- FR2: Runbook "Gán ngoài DT" (append vào architecture hoặc `docs/runbooks/du-an-can-doi.md` nếu tồn tại pattern runbook):
  - Trigger: nút "Gán vào dự toán…" trên dòng orphan.
  - Behavior: bulk update cụm `(categoryId, itemCode)`, append note trace.
  - Rollback: sửa lại từng txn qua tab Giao Dịch.
- FR3: `docs/project-changelog.md` — entry ngày 2026-08-19 tóm tắt 5 phases (không tham chiếu plan ID).
- FR4: Full gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- FR5: Manual walkthrough acceptance 1–6 (plan.md).

## Implementation steps

1. Đọc `docs/system-architecture.md` + `docs/code-standards.md` để tìm chỗ chèn.
2. Viết section convention (Vietnamese, kỹ thuật ngắn gọn).
3. Runbook gán ngoài-DT.
4. Changelog entry (Vietnamese, mô tả user-facing behavior).
5. Full gates. Ghi commit conventional (`docs:` prefix).
6. Manual walkthrough MNTC-GD1: acceptance 1–6.
7. Journal daily entry trong `docs/journals/260819-du-toan-hierarchy.md` (bài học từ implementation).

## Todo list

- [ ] Convention doc section
- [ ] Runbook gán ngoài-DT
- [ ] Changelog entry
- [ ] `pnpm lint typecheck test build` xanh
- [ ] Manual walkthrough acceptance 1–6
- [ ] Journal entry

## Success criteria

- Docs merged; new dev đọc convention hiểu quy tắc HM parsing và suppression.
- Full gates xanh trên local + CI.
- Acceptance 1–6 verify on MNTC-GD1.

## Risk assessment

- **LOW** — Docs-only phase.
- **MED** — Full gates có thể fail lint/type do 5 phases trước. Mitigation: fix ngay tại phase gây fail, không đẩy tất cả xuống 06.

## Security considerations

- Docs không expose secrets / credentials.

## Next steps

Nếu %ngoài-DT vẫn cao sau adoption → v3 review screen (dedicated) hoặc heuristic suggestion. Không lên roadmap ngay.
