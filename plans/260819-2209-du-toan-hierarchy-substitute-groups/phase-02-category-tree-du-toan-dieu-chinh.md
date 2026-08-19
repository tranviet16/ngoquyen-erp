# Phase 02 — `category-tree` helper + du-toan-dieu-chinh grouped table

## Context links

- Brainstorm §A
- Client hiện tại: `app/(app)/du-an/[id]/du-toan-dieu-chinh/du-toan-dieu-chinh-client.tsx` (77 dòng, read-only)
- Service data: `lib/du-an/norm-service.ts:70 listEstimateAdjusted` (dùng `vw_project_estimate_adjusted`)
- Reference cho SubtotalRow/ColumnDef: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx:182-318`

## Overview

Xây pure helper `category-tree.ts` (parse mã HM→section) + tests, và dùng nó rebuild `du-toan-dieu-chinh` thành grouped table read-only. Đây là proof-of-pattern trước khi làm 03/04.

## Key insights

- Regex `^(HM\d+)-(.+)$` → 2 levels; non-matching (vd `HM01`, `OTHER`) → level-1 group riêng, không có section, KHÔNG throw.
- Helper KHÔNG chứa presentation — trả về `TreeNode[]` với generic `<T>` để tái sử dụng cho estimates, change orders, adjustments.
- KHÔNG xây generic `<GroupedTable>` component. Copy SubtotalRow/ColumnDef pattern per tab (theo brainstorm agreement).

## Requirements

- FR1: `buildCategoryTree<T>(rows: T[], getCategory: (r: T) => Category)` → `HmGroup[]` với `{ hmCode, sectionGroups: SectionGroup[], directRows: T[] }` (directRows dùng cho non-matching code có `categoryId` riêng).
- FR2: Test cover: `HM1-VL, HM1-NC, HM2-VL, HM01, OTHER-CODE`, empty input, single category.
- FR3: Client `du-toan-dieu-chinh`: collapsible HM groups (mặc định expand); mỗi section header → item rows (columns: mã, tên, ĐVT, SL, gốc, CO impact, adjusted); subtotal cuối section + subtotal cuối HM + grand total sticky.
- FR4: Nhãn Vietnamese, currency dùng `vndFormatter`.

## Architecture

Pure helper signature:

```ts
export interface CategoryLite { id: number; code: string; name: string; }
export interface HmGroup<T> {
  hmCode: string;          // "HM1" hoặc "HM01" hoặc "__misc__" cho category không match
  hmLabel: string;         // hiển thị "HM1" hoặc code raw
  sections: SectionGroup<T>[];
  directRows: T[];         // rows thuộc category có code không match pattern
  categories: CategoryLite[];
}
export interface SectionGroup<T> {
  categoryId: number;
  sectionCode: string;     // "VL", "NC", "MAY", "CPC" (phần sau `-`)
  categoryName: string;
  rows: T[];
}
export function buildCategoryTree<T>(
  rows: T[], categoriesById: Map<number, CategoryLite>
): HmGroup<T>[]
```

Sort order: HM theo natural number (`HM2` trước `HM10`), section theo alphabetic của sectionCode.

Client structure:

```
<table>
  <thead sticky/>
  {tree.map(hm => (
    <HmHeaderRow />
    hm.sections.map(section => (
      <SectionHeaderRow />
      section.rows.map(r => <ItemRow />)
      <SectionSubtotalRow />
    ))
    hm.directRows.map(r => <ItemRow />)
    <HmSubtotalRow />
  ))}
  <GrandTotalRow sticky-bottom />
</table>
```

Subtotal cols: `original_total_vnd`, `co_cost_impact`, `adjusted_total_vnd`, `co_count`.

## Related code files

- Create: `lib/du-an/category-tree.ts` (pure, no `"use server"`)
- Create: `lib/du-an/__tests__/category-tree.test.ts`
- Modify: `app/(app)/du-an/[id]/du-toan-dieu-chinh/du-toan-dieu-chinh-client.tsx` (rebuild)
- Modify (thêm select `categoryId` nếu chưa có): `app/(app)/du-an/[id]/du-toan-dieu-chinh/page.tsx` (verify lấy categories qua `prisma.projectCategory.findMany`)

## Implementation steps

1. Viết `category-tree.ts`: parse regex, group, sort, expose `HmGroup<T>[]`.
2. Test cover: (a) all match, (b) mixed match + non-match, (c) empty, (d) sort HM2 vs HM10, (e) sort section alpha.
3. Verify `page.tsx` truyền `categories` sang client; nếu thiếu, thêm fetch giống `du-toan/page.tsx`.
4. Rebuild client: copy `SubtotalRow`, `ColumnDef` shape từ can-doi (không import — copy code, giữ độc lập).
5. Collapsible: `useState<Set<string>>` cho `collapsedHm`. Chevron trên HM header, click → toggle.
6. Sticky header + sticky grand total row (`position: sticky; top: 0` / `bottom: 0`).
7. Kiểm tra visual trên MNTC-GD1 (id=4, có HM1-VL/NC/MAY/CPC + HM2-VL + HM3-VL).

## Todo list

- [ ] `category-tree.ts` + tests xanh
- [ ] `du-toan-dieu-chinh-client.tsx` rebuild
- [ ] `page.tsx` verify categories truyền vào
- [ ] Manual: subtotal khớp Σ dòng con
- [ ] Manual: HM10/HM2 sort đúng (nếu có project như vậy)

## Success criteria

- `pnpm test lib/du-an/category-tree` xanh, coverage ≥95%.
- Tab DT Điều Chỉnh MNTC-GD1: 3 HM groups, subtotal cột `adjusted_total_vnd` = Σ `adjusted_total_vnd` dòng con (chính xác đến VND, tránh floating drift).
- Category code `"HM01"` (nếu seed) hiện làm 1 group độc lập không có section layer.

## Risk assessment

- **LOW** — Non-matching code degrade: đảm bảo có test case, không throw.
- **LOW** — Decimal precision cho subtotal. Mitigation: sum bằng `Number` là đủ với scale hiện tại; nếu cần chính xác, dùng `Prisma.Decimal` trong `buildCategoryTree` (KHÔNG cần v1).
- **MED** — DT Điều Chỉnh có thể có category rỗng (0 rows) — không render group đó (giống can-doi filter `catRows.length === 0`).

## Security considerations

- Pure helper, no I/O, no risks.
- Client vẫn dùng data từ server component (page.tsx) đã qua guard `requireModuleAccess`.

## Next steps

Phase 03 dùng cùng helper cho du-toan tab (editable). Phase 04 dùng cùng helper cho phat-sinh (totals tree layer).
