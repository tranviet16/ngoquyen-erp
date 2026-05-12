---
phase: 1
title: Implementation
status: completed
priority: P2
effort: 2-3h
dependencies: []
---

# Phase 1: Implementation

## Overview
Tạo shared shell `components/ledger/ledger-overview-shell.tsx` (header + nav + 2 KPI + Top 5 + empty state). Rewrite 2 page.tsx (`cong-no-vt`, `cong-no-nc`) thành thin wrapper ~30 dòng — fetch summary + party map, pass vào shell.

## Requirements
- Functional:
  - 2 KPI: Tổng nợ TT (sum `balanceTt`), Tổng nợ HĐ (sum `balanceHd`)
  - Top 5 NCC/đội nợ nhiều nhất: aggregate theo `partyId`, sort desc theo `balanceTt + balanceHd`, lấy 5
  - Mỗi row Top 5: tên party + balanceTt + balanceHd + link drill-down `${basePath}/chi-tiet?partyId=${id}`
  - Empty state khi không có dòng nợ
  - Header nav 4 link giữ nguyên (Nhập liệu, Số dư, BC tháng, Chi tiết NCC/đội)
- Non-functional:
  - DRY: 1 shared shell, 2 thin wrapper ~30 line
  - `npx tsc --noEmit` clean
  - Server Component, không client component cần thiết

## Architecture

### Shared shell signature
```ts
// components/ledger/ledger-overview-shell.tsx
import type { SummaryRow } from "@/lib/ledger/ledger-service";

type NavLink = { label: string; href: string };

type LedgerOverviewProps = {
  title: string;                   // "Công nợ Vật tư"
  description: string;             // "Tổng hợp nợ TT/HĐ theo NCC × Chủ thể"
  partyLabel: string;              // "NCC" | "Đội thi công"
  basePath: "/cong-no-vt" | "/cong-no-nc";
  navLinks: NavLink[];             // 4 link header
  summary: SummaryRow[];
  parties: Map<number, string>;    // partyId → name
  emptyHref: string;               // link sang trang nhập liệu khi rỗng
};
```

### Top 5 aggregation logic
```ts
const byParty = new Map<number, { tt: Decimal; hd: Decimal }>();
for (const r of summary) {
  const cur = byParty.get(r.partyId) ?? { tt: new Decimal(0), hd: new Decimal(0) };
  cur.tt = cur.tt.add(r.balanceTt);
  cur.hd = cur.hd.add(r.balanceHd);
  byParty.set(r.partyId, cur);
}
const top5 = [...byParty.entries()]
  .map(([id, v]) => ({ id, name: parties.get(id) ?? `#${id}`, tt: v.tt, hd: v.hd, total: v.tt.add(v.hd) }))
  .filter(r => !r.total.isZero())
  .sort((a, b) => b.total.cmp(a.total))
  .slice(0, 5);

const totalTt = top5.reduce((s, r) => s.add(r.tt), new Decimal(0)); // recompute from full summary, not top5
```
*Note:* Tổng KPI sum trên TOÀN BỘ `summary`, không chỉ Top 5.

### Layout
```
{title}                          [Nav links 4]
{description}

[KPI Tổng nợ TT]   [KPI Tổng nợ HĐ]

┌─ Top 5 {partyLabel} nợ nhiều nhất ──────────────┐
│ 1. NCC Alpha   TT: 500M  HĐ: 300M           →   │
│ 2. NCC Beta    TT: 200M  HĐ: 150M           →   │
│ ...                                              │
│ [Xem chi tiết tất cả →]                          │
└──────────────────────────────────────────────────┘
```

## Related Code Files
- **Create:**
  - `components/ledger/ledger-overview-shell.tsx`
- **Rewrite:**
  - `app/(app)/cong-no-vt/page.tsx` (~140 → ~30 lines)
  - `app/(app)/cong-no-nc/page.tsx` (~140 → ~30 lines)

## Implementation Steps

1. **Tạo `components/ledger/ledger-overview-shell.tsx`:**
   - Server Component (không "use client")
   - Render header (title + description + nav links via `<Link>`)
   - Render 2 KPI card (`rounded-xl bg-card ring-1 ring-foreground/10 p-4`) với label trên + giá trị format VND
   - Compute Top 5 (logic ở Architecture)
   - Render Top 5 card: title "Top 5 {partyLabel} nợ nhiều nhất", list row (rank + name + balanceTt + balanceHd + ChevronRight icon), wrap mỗi row trong `<Link href="${basePath}/chi-tiet?partyId=${id}">`. Footer link "Xem chi tiết tất cả →" sang `${basePath}/chi-tiet`
   - Empty state: dùng `EmptyState` từ `@/components/ui/empty-state` với title "Chưa có công nợ" + action link sang `emptyHref`
   - Helper format: dùng `formatCurrency` hiện có trong codebase (check `lib/format` hoặc tương đương — fallback inline `new Intl.NumberFormat("vi-VN").format(...)`)

2. **Rewrite `app/(app)/cong-no-vt/page.tsx`:**
   ```tsx
   import { headers } from "next/headers";
   import { redirect } from "next/navigation";
   import { auth } from "@/lib/auth";
   import prisma from "@/lib/prisma";
   import { getMaterialSummary } from "@/lib/cong-no-vt/material-ledger-service";
   import { LedgerOverviewShell } from "@/components/ledger/ledger-overview-shell";

   export const dynamic = "force-dynamic";

   export default async function Page() {
     const session = await auth.api.getSession({ headers: await headers() });
     if (!session?.user) redirect("/login");

     const [summary, suppliers] = await Promise.all([
       getMaterialSummary(),
       prisma.supplier.findMany({ select: { id: true, name: true } }),
     ]);
     const parties = new Map(suppliers.map(s => [s.id, s.name]));

     return (
       <LedgerOverviewShell
         title="Công nợ Vật tư"
         description="Tổng hợp nợ TT/HĐ theo NCC × Chủ thể"
         partyLabel="NCC"
         basePath="/cong-no-vt"
         navLinks={[
           { label: "Nhập liệu", href: "/cong-no-vt/nhap-lieu" },
           { label: "Số dư đầu kỳ", href: "/cong-no-vt/so-du" },
           { label: "Báo cáo tháng", href: "/cong-no-vt/bc-thang" },
           { label: "Chi tiết NCC", href: "/cong-no-vt/chi-tiet" },
         ]}
         summary={summary}
         parties={parties}
         emptyHref="/cong-no-vt/nhap-lieu"
       />
     );
   }
   ```

3. **Rewrite `app/(app)/cong-no-nc/page.tsx`:** Mirror y hệt với `getLaborSummary`, `prisma.contractor.findMany`, "Công nợ Nhân công", partyLabel "Đội thi công", basePath `/cong-no-nc`, nav links chỉnh path tương ứng. **Đọc file gốc trước** để lấy đúng đường dẫn nav (`/cong-no-nc/...`) và verify tên service.

4. **Verify:**
   - `npx tsc --noEmit` clean
   - Khởi động dev server, mở 2 route:
     - `/cong-no-vt` — KPI số ≥ 0, Top 5 NCC sort đúng, click row navigate `/cong-no-vt/chi-tiet?partyId=X` (graceful — chi-tiet show full)
     - `/cong-no-nc` — tương tự với đội thi công
   - Empty state khi DB chưa có ledger entry: hiển thị card "Chưa có công nợ" với CTA link nhập liệu

## Success Criteria
- [ ] `components/ledger/ledger-overview-shell.tsx` tạo mới, Server Component
- [ ] 2 page.tsx rút xuống ≤40 line mỗi cái
- [ ] Top 5 sort đúng theo `balanceTt + balanceHd` desc
- [ ] KPI tổng = sum trên toàn `summary` (không chỉ Top 5)
- [ ] Click row Top 5 navigate `${basePath}/chi-tiet?partyId=${id}`
- [ ] Empty state hiển thị khi summary rỗng / tất cả balance = 0
- [ ] partyLabel hiển thị đúng ("NCC" vs "Đội thi công")
- [ ] `npx tsc --noEmit` clean
- [ ] Manual QA 2 route pass

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| `formatCurrency` helper không tồn tại | Fallback inline `Intl.NumberFormat("vi-VN")` |
| Decimal arithmetic edge case (null/undefined) | `SummaryRow` đã guarantee non-null Decimal từ service — không cần guard |
| Bảng raw cũ bị user phụ thuộc | Brainstorm confirmed: chi-tiet đã có. Loại bỏ là intent |
| Aggregate JS chậm | `summary` thường <100 row party — không vấn đề |
| Drill-down `?partyId=` không filter ở chi-tiet | Documented graceful behavior. Follow-up plan để thêm parse |
