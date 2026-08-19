# Phase 04 — Phát sinh: cây tổng theo hạng mục trên grid

## Context links

- Brainstorm §A: totals tree above existing grid
- Client hiện tại: `app/(app)/du-an/[id]/phat-sinh/phat-sinh-client.tsx` (251 dòng, DataGrid + CrudDialog)
- Schema: `prisma/schema.prisma:403 ProjectChangeOrder` — `categoryId Int?` (nullable)
- Helper: `lib/du-an/category-tree.ts` (Phase 02)

## Overview

Thêm block cây tổng (HM → section → subtotal) phía trên DataGrid hiện tại. `categoryId=null` gộp vào bucket "Chưa gán hạng mục". Không đổi DataGrid — chỉ thêm summary widget.

## Key insights

- Đây là **layer additive** — không rebuild grid như Phase 03 (change orders workflow user quen thao tác DataGrid).
- Cây tổng tính client-side từ `initialData` — không cần thêm SQL/service.
- Bucket "Chưa gán hạng mục" hiển thị riêng cuối cây, tổng riêng, KHÔNG thuộc HM nào.

## Requirements

- FR1: Widget cây tổng: mỗi HM group hiện tổng `costImpactVnd`, count CO, count CO đã duyệt. Section subtotal tương tự.
- FR2: Bucket "Chưa gán hạng mục" (rows với `categoryId=null`) là 1 group riêng cuối cây.
- FR3: Grand total: tổng `costImpactVnd` tất cả, riêng `costImpactVnd` các CO status=approved (số duyệt) — quan trọng vì `vw_project_estimate_adjusted` chỉ tính CO approved.
- FR4: Collapsible từng HM (default expand). Không đổi DataGrid.

## Architecture

Data flow:

```
initialData: CoRow[] (đã có categoryId nullable)
  → split: matched = filter categoryId != null; unmatched = filter categoryId == null
  → buildCategoryTree(matched, categoriesById) → HmGroup<CoRow>[]
  → aggregate subtotals per node
  → render tree card above DataGrid
```

Aggregation helper (pure, có thể co-locate trong client file hoặc thêm vào `category-tree.ts`):

```ts
function sumCoImpact(rows: CoRow[]): { total: number; approved: number; count: number; approvedCount: number }
```

Layout:

```
<Card>
  <CardHeader>Tổng phát sinh theo hạng mục</CardHeader>
  <CardContent>
    tree.map(hm) → <HmSummaryRow />
                    hm.sections.map(s) → <SectionSummaryRow />
    <UnmatchedRow /> (nếu có unmatched.length > 0)
    <GrandTotalRow />
  </CardContent>
</Card>
<DataGrid /> (unchanged)
```

## Related code files

- Modify: `app/(app)/du-an/[id]/phat-sinh/phat-sinh-client.tsx` (add tree widget trên top, giữ DataGrid)
- Import: `lib/du-an/category-tree.ts`
- Verify `page.tsx` có truyền `categories` sang client — đã có (line 39 trong client là `categories: CategoryOption[]`)

## Implementation steps

1. Viết `sumCoImpact` helper (file-local hoặc export từ category-tree — chọn file-local, nhỏ và specific).
2. `useMemo`: split matched/unmatched, build tree, precompute subtotals.
3. Render Card widget above `<DataGrid>`. Nếu `initialData.length === 0` → skip widget.
4. Collapsible per HM group với `useState<Set<string>>`.
5. Style: dùng `vndFormatter`, badge cho count/count-approved.
6. Không đổi CRUD/DataGrid flow.

## Todo list

- [ ] Add helper `sumCoImpact`
- [ ] Widget cây tổng render
- [ ] Bucket "Chưa gán hạng mục" khi có unmatched
- [ ] Grand total (tổng + duyệt)
- [ ] Manual: tạo CO không gán category → hiện trong bucket
- [ ] Manual: subtotal khớp Σ CO trong grid

## Success criteria

- Phat-sinh MNTC-GD1: widget hiện HM groups đúng, "Chưa gán hạng mục" xuất hiện khi có CO không gán.
- Tổng costImpact widget = Σ costImpact trong DataGrid.
- Tổng "đã duyệt" = Σ costImpact với status=approved (khớp `vw_project_estimate_adjusted.co_cost_impact` cho project).

## Risk assessment

- **LOW** — Widget hoàn toàn additive, không đụng CRUD.
- **LOW** — CO có `categoryId` trỏ đến category đã bị xóa (`deletedAt IS NOT NULL`) — categoriesById không có → fallback bucket "Không xác định". Test edge case này khi build tree.

## Security considerations

- Không thêm server action. Không mở surface mới.

## Next steps

Phase 05 (MaterialGroup — schema + rollup) — độc lập với 04.
