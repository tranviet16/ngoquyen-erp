---
phase: 3
title: "Markdown Description"
status: pending
priority: P2
effort: "2h"
dependencies: [2]
---

# Phase 3: Markdown Description

## Overview
Thay plain textarea description bằng editor 2-tab "Soạn / Xem": tab Soạn là textarea autosize hỗ trợ markdown, tab Xem render markdown qua `react-markdown` (đã có sẵn) với Tailwind `prose`.

## Requirements
- Functional:
  - 2 tabs: "Soạn" (textarea), "Xem" (preview)
  - Auto-save 800ms debounce khi gõ
  - Render đúng: heading, list, checkbox, code block, link, bold/italic, inline code
  - Placeholder "Nhập mô tả… hỗ trợ Markdown"
- Non-functional:
  - Bundle không tăng (react-markdown đã có)
  - Sanitize XSS (react-markdown default + không bật rehype-raw)

## Architecture
- Component in-file: `<DescriptionEditor value onChange>`
- Textarea autosize: CSS `field-sizing: content` nếu hỗ trợ, fallback `min-h-32 max-h-96` + scroll
- Preview: `<ReactMarkdown>` wrapped trong `<div className="prose prose-sm dark:prose-invert max-w-none">`
- Tab state local trong component; default "Soạn" khi empty, "Xem" khi đã có content
- Reuse `useAutoSave` từ phase 2

## Related Code Files
- Modify: `app/(app)/van-hanh/cong-viec/task-detail-panel.tsx`
- Reuse: `react-markdown`, `marked` (đã có trong package.json)

## Implementation Steps
1. Thêm tabs primitive nhỏ (button group, không cần Radix Tabs cho 2 tab)
2. Tab "Soạn": textarea autosize, maxLength 2000, autosave wired
3. Tab "Xem": `<ReactMarkdown>` với prose styling
4. Tab default: empty desc → "Soạn"; non-empty → "Xem"
5. Verify markdown render: tạo task test với heading/list/code/link

## Success Criteria
- [ ] Chuyển tab Soạn ↔ Xem mượt
- [ ] Markdown render đúng: `# H1`, `- list`, `[link](url)`, `**bold**`, code fence
- [ ] Auto-save khi gõ, không cần Save button
- [ ] Sanitize: paste `<script>` không execute
- [ ] `npx tsc --noEmit` pass

## Risk Assessment
- **Risk:** XSS qua markdown link `javascript:` → mitigate: react-markdown default block; verify với link test
- **Risk:** Long markdown gây giật → mitigate: max-h-96 + scroll
- **Risk:** User mất markdown khi chuyển tab nhanh → mitigate: value lưu ở parent state, tab chỉ là view mode
