---
phase: 2
title: "Shared contract và characterization TDD"
status: completed
priority: P1
effort: 8h
dependencies: [1]
---

# Phase 2: Shared contract và characterization TDD

## Context Links

- [Parent plan](./plan.md)
- [Phase 1](./phase-01-coverage-manifest-blocker.md)
- Existing: `components/data-table/sort-header.tsx`, `components/data-grid/use-grid-view.ts`, `components/data-grid/apply-filter-sort.ts`, `lib/table/query-params.ts`

## Overview

Tạo contract dùng chung và khóa behavior hiện tại bằng characterization tests trước migration. Không tạo universal renderer; chỉ chia sẻ state machine, semantic value contract và HTML header behavior.

## Key Insights

- DataTable và DataGrid đang duplicate cycle `default/asc/desc`.
- Test cycle hiện mirror hàm private nên không bảo vệ implementation thật.
- DataGrid null-last bị đảo ở desc.
- Default nghĩa khác nhau theo family nhưng state machine phải giống nhau.

## Requirements

- Pure helper: cột mới → asc; active default → asc; asc → desc; desc → default.
- `SortState` biểu diễn explicit `default | asc | desc`, không dùng `null` mơ hồ ở core.
- Semantic comparator: number/currency, date, Vietnamese text, boolean/select label; null/rỗng luôn cuối.
- Stable sort và immutable input.
- Shared accessible header cho HTML/DataTable; Glide chỉ tái dùng state helper.
- Trạng thái `default` dùng icon trung tính, tooltip/accessible label “Thứ tự mặc định” và `aria-sort="none"`; thêm fixture khi `defaultSort` thực tế là asc và desc để không nhầm user state với effective DB order.

## Architecture

Core không biết Prisma hay React renderer. Family adapter chuyển `default` thành `ResourceSpec.defaultSort`, source row order, group leaf order hoặc matrix row order. Column accessor trả semantic raw value, không trả formatted string.

## Related Code Files

- Create: `lib/table/sort-state.ts`
- Create: `lib/table/semantic-compare.ts`
- Create: `components/data-table/sortable-header-button.tsx`
- Create/Modify tests under `lib/table/__tests__/` and component test location confirmed by Phase 1
- Modify later through adapters: `sort-header.tsx`, `use-grid-view.ts`, `apply-filter-sort.ts`
- Delete: duplicated private cycle helper after all callers migrate

## Implementation Steps

1. Viết failing tests trực tiếp import production helper cho full cycle, đổi cột và default restore.
2. Viết comparator tests cho vi text, numeric strings, Decimal-compatible numbers, dates, labels, equal values và null asc/desc.
3. Viết stable/immutable tests bằng duplicate keys và frozen input.
4. Characterize DataTable fallback default, DataGrid source order, grouped leaf order và matrix row order trước adapter changes.
5. Implement tối thiểu pure core và header semantics.
6. Test `defaultSort` asc/desc: UI vẫn báo trạng thái mặc định; asc/desc do người dùng chọn mới dùng `aria-sort="ascending|descending"`.
7. Thay test mirror hiện tại bằng test implementation thật.

## Todo List

- [ ] Tests đỏ trước implementation
- [ ] Shared state helper không phụ thuộc React/Prisma
- [ ] Null-last đúng cả hai chiều
- [ ] Stable sort giữ source index khi equal
- [ ] Header keyboard + `aria-sort` contract được test

## Success Criteria

- [ ] Direct helper tests pass; test mirror bị loại
- [ ] Default round-trip có fixture cho bốn family
- [ ] Không mutate source arrays
- [ ] Focused unit tests và TypeScript pass

## Risk Assessment

Abstraction quá rộng sẽ kéo query/render concerns vào core. Giảm thiểu bằng value-in/state-out pure APIs và adapter riêng. Không thêm multi-sort, persisted presets hoặc filter changes.

## Security Considerations

Sort query state vẫn phải được allowlist ở server; shared helper không được biến arbitrary URL key thành SQL/Prisma field.

## Next Steps

Phase 3 và 4 có thể bắt đầu sau khi Phase 2 tests xanh và API được review.
