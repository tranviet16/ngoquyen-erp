---
phase: 5
title: "Polish & Verification"
status: pending
priority: P2
effort: "3h"
dependencies: [4]
---

# Phase 5: Polish & Verification

## Overview
Pass cuối: visual polish (spacing, typography, dark mode), keyboard shortcuts cơ bản, accessibility, performance check, type check, manual QA checklist từ acceptance criteria gốc.

## Requirements
- Functional:
  - Esc đóng drawer, focus trap khi mở
  - Tab/Shift+Tab navigation hợp lý qua các field
  - Hover states cho property rows, click affordance rõ
  - Dark mode đầy đủ (prose, properties bg, indicator color)
  - Loading skeleton khi switch task (replace ?taskId)
- Non-functional:
  - `npx tsc --noEmit` clean
  - `npx eslint .` no new warnings
  - Bundle size không tăng > 30KB
  - First open drawer < 200ms (no measurable jank)

## Architecture
- Visual polish in-place (chỉ chỉnh `task-detail-panel.tsx`)
- Focus trap: Sheet primitive đã built-in (Radix Dialog)
- Loading skeleton: simple opacity-50 + spinner trong header indicator khi `?taskId` đổi
- Accessibility: `aria-label` cho close button, properties row dùng `<button>` semantic

## Related Code Files
- Modify: `app/(app)/van-hanh/cong-viec/task-detail-panel.tsx` (polish only)
- Verify: không sửa logic, không sửa schema

## Implementation Steps
1. Audit spacing với Tailwind: pad-x-6, gap-3 giữa sections, divider mỏng giữa header/properties/desc/tabs
2. Hover states property rows: `hover:bg-muted/40 transition-colors cursor-pointer`
3. Dark mode: verify `dark:` variants cho mọi color custom
4. Keyboard: Esc đóng (Sheet built-in), Tab order check
5. Loading state khi switch task: indicator "Đang tải…" trong header
6. Empty title placeholder rõ: "Nhập tiêu đề task…"
7. Subtask checkbox animation (transition + check icon)
8. Manual QA: chạy acceptance criteria gốc từ brainstorm-summary
9. Type check: `npx tsc --noEmit`
10. Lint: `npx eslint . --max-warnings 0` (chỉ trong file đã thay đổi)
11. Smoke test trong dev: tạo task, edit field, comment, attach, view activity, delete

## Success Criteria
- [ ] Esc đóng drawer
- [ ] Focus trap: Tab không thoát ra ngoài drawer khi mở
- [ ] Hover/active states rõ ràng cho mọi clickable element
- [ ] Dark mode visually đúng (toggle theme test)
- [ ] Loading indicator khi switch giữa task
- [ ] Tất cả acceptance criteria từ brainstorm-summary pass:
  - [ ] Drawer slide từ phải, URL có `?taskId=`
  - [ ] Sửa field bất kỳ → auto-save ≤1s, indicator "Đã lưu ✓"
  - [ ] Esc/backdrop/✕ đóng; refresh giữ trạng thái
  - [ ] Markdown render đúng (heading, list, code, link)
  - [ ] Subtask toggle checkbox optimistic update
  - [ ] Tab Lịch sử list ≥1 change sau khi sửa task
- [ ] `npx tsc --noEmit` pass clean
- [ ] No new ESLint warnings

## Risk Assessment
- **Risk:** Theme regression khác → mitigate: chỉ chỉnh trong panel, không touch globals.css
- **Risk:** Focus trap conflict với inline editors → mitigate: test với keyboard-only
- **Risk:** Bundle size tăng do prose plugin → mitigate: prose đã có sẵn trong tailwind config, verify
