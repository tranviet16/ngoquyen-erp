---
phase: 4
title: "Trang tổng hợp + export Excel"
status: pending
priority: P2
effort: "1.5h"
dependencies: [2]
---

# Phase 4: Trang tổng hợp + export Excel

## Overview
Trang `/thanh-toan/tong-hop` readonly aggregate theo tháng, layout khớp `Tổng_hợp_thanh_toán_tháng.xlsx`. Nút Export Excel sinh file `.xlsx` đúng template.

## Related Code Files
- Create: `app/(app)/thanh-toan/tong-hop/page.tsx` (server)
- Create: `app/(app)/thanh-toan/tong-hop/tong-hop-client.tsx`
- Create: `app/api/thanh-toan/tong-hop/export/route.ts` (GET, query `?month=`)
- Read for context:
  - `SOP/Tổng_hợp_thanh_toán_tháng.xlsx` — template layout
  - Existing xlsx usage: `grep -r "from \"xlsx\"" app lib` để tìm pattern hiện có

## Implementation Steps

### 1. Server page
```tsx
// app/(app)/thanh-toan/tong-hop/page.tsx
import { aggregateMonth } from "@/lib/payment/payment-service";
import { TongHopClient } from "./tong-hop-client";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = sp.month ?? new Date().toISOString().slice(0, 7);
  const rows = await aggregateMonth(month);
  return <TongHopClient month={month} rows={rows} />;
}
```

### 2. TongHopClient
- Filter: month input (type="month") + nút Refresh
- Pivot bảng khớp SOP:
  | STT | Đơn vị TT | Công trình Cty QL (Đề nghị / Duyệt) | Công trình giao khoán (Đề nghị / Duyệt) | Tổng TT lần này |
- Logic pivot: group by supplierId, các row có `projectScope` chia 2 cột
  ```ts
  const pivot = new Map<number, {
    supplierName: string;
    ctyQlDeNghi: number; ctyQlDuyet: number;
    giaoKhoanDeNghi: number; giaoKhoanDuyet: number;
  }>();
  for (const r of rows) {
    const k = r.supplierId;
    if (!pivot.has(k)) pivot.set(k, { supplierName: r.supplierName, ctyQlDeNghi: 0, ctyQlDuyet: 0, giaoKhoanDeNghi: 0, giaoKhoanDuyet: 0 });
    const p = pivot.get(k)!;
    if (r.projectScope === "cty_ql") { p.ctyQlDeNghi += r.soDeNghi; p.ctyQlDuyet += r.soDuyet; }
    else { p.giaoKhoanDeNghi += r.soDeNghi; p.giaoKhoanDuyet += r.soDuyet; }
  }
  ```
- Total row ở cuối (SUM tất cả cột)
- Nút Export → `window.location = "/api/thanh-toan/tong-hop/export?month=" + month`

### 3. Export API route
```ts
// app/api/thanh-toan/tong-hop/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { aggregateMonth } from "@/lib/payment/payment-service";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const rows = await aggregateMonth(month);

  // pivot giống client
  const pivotArr = /* ... map → array sorted by supplierName ... */;

  const aoa: any[][] = [
    [`TỔNG HỢP THANH TOÁN THÁNG ${month}`],
    [],
    ["STT", "Đơn vị TT", "Công trình Cty QL", "", "Công trình giao khoán", "", "Tổng TT lần này"],
    ["", "", "Số đề nghị TT", "Số duyệt TT", "Số đề nghị TT", "Số duyệt TT", ""],
    ...pivotArr.map((p, i) => [
      i + 1, p.supplierName,
      p.ctyQlDeNghi, p.ctyQlDuyet,
      p.giaoKhoanDeNghi, p.giaoKhoanDuyet,
      p.ctyQlDuyet + p.giaoKhoanDuyet,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } }, // Cty QL merge
    { s: { r: 2, c: 4 }, e: { r: 2, c: 5 } }, // giao khoán merge
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tổng hợp");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tong-hop-thanh-toan-${month}.xlsx"`,
    },
  });
}
```

### 4. Server-side guard cho export
Trong API route, gọi `auth.api.getSession` trước; nếu chưa login → 401.

## Success Criteria
- [ ] `/thanh-toan/tong-hop?month=YYYY-MM` render đúng pivot table
- [ ] Total row = SUM tất cả supplier
- [ ] Export Excel mở được trong LibreOffice/MS Excel, layout khớp SOP
- [ ] Tháng không có data → empty state "Chưa có đợt nào được duyệt trong tháng này"
- [ ] Unauthenticated user gọi `/api/thanh-toan/tong-hop/export` → 401

## Risk Assessment
- **Decimal → number conversion lose precision**: aggregateMonth đã `Number()` trong service. Với VND không có decimal, OK. Nếu sau dùng currency khác → revisit.
- **xlsx ESM compat trong route handler**: package CommonJS, Next.js App Router handle OK với `import * as XLSX`. Verify build pass.
