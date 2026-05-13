---
phase: 4
title: "UI badges & list column"
status: pending
priority: P2
effort: "3h"
dependencies: [2, 3]
---

# Phase 4: UI badges & list column

## Overview

Cập nhật UI để TBP/Director/Creator nhìn thấy trạng thái SLA và escalation rõ ràng. Thêm cột SLA trong list, banner cảnh báo trong detail, disable buttons cho TBP sau escalate.

## Requirements

**Functional:**
- **List page** (`/van-hanh/phieu-phoi-hop`):
  - Cột mới "SLA" hiển thị: phiếu `pending_leader` chưa escalate → "Còn X giờ" (xanh nếu >12h, vàng 4-12h, đỏ <4h); đã escalate → badge "Quá hạn" (đỏ)
- **Detail page** (`/van-hanh/phieu-phoi-hop/[id]`):
  - Nếu `escalatedAt` set → banner đỏ phía trên: "⏰ Phiếu đã quá hạn 24h — đã chuyển Giám đốc duyệt"
  - TBP cũ (executor dept leader) → buttons "Duyệt"/"Từ chối" bị disabled, tooltip giải thích
  - Director → buttons hiển thị bình thường

**Non-functional:**
- Không thêm client-side polling (SLA tính server-side, refresh on navigation)
- Reuse component pattern hiện có (đọc detail page hiện tại để follow convention)

## Architecture

**List column:**
```tsx
// Trong list page, mỗi row:
function SlaCell({ form }: { form: CoordinationForm }) {
  if (form.status !== "pending_leader") return <td>—</td>;
  if (form.escalatedAt) {
    return <td><Badge variant="destructive">Quá hạn</Badge></td>;
  }
  const h = hoursRemaining(form);  // import from lib/coordination-form/sla
  if (h == null) return <td>—</td>;
  const color = h > 12 ? "text-emerald-600" : h > 4 ? "text-amber-600" : "text-red-600";
  return <td className={color}>Còn {Math.max(0, Math.floor(h))}h</td>;
}
```

**Detail banner:**
```tsx
{form.escalatedAt && (
  <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm">
    <strong>⏰ Phiếu đã quá hạn 24h</strong> — TBP không duyệt trong thời hạn, đã chuyển Giám đốc duyệt vào {formatDateTime(form.escalatedAt)}.
  </div>
)}
```

**Button disable:**
- Server đã resolve `availableActions` đúng (Phase 2 update `resolveAvailableActions`)
- UI render disabled button + tooltip nếu `form.escalatedAt && currentUser is TBP`:
  ```tsx
  <Button disabled title="Phiếu đã chuyển Giám đốc duyệt — bạn không còn quyền action">
    Duyệt
  </Button>
  ```

## Related Code Files

**Modify:**
- `app/(app)/van-hanh/phieu-phoi-hop/page.tsx` (list)
- `app/(app)/van-hanh/phieu-phoi-hop/[id]/page.tsx` (detail)
- Có thể thêm component nhỏ `components/coordination-form/sla-cell.tsx` nếu cell logic phức tạp

**Read for context:**
- `app/(app)/van-hanh/phieu-phoi-hop/page.tsx` — current list structure
- `app/(app)/van-hanh/phieu-phoi-hop/[id]/page.tsx` — current detail layout & how buttons render
- `components/ui/badge.tsx` — verify Badge component exists

## Implementation Steps

1. **Scout** — Đọc cả 2 file UI hiện tại để hiểu structure (column order, how form data flows, how buttons render). Identify exact insertion points.

2. **List page** — Thêm cột "SLA" sau cột "Trạng thái" (hoặc theo natural position). Import `hoursRemaining` từ `@/lib/coordination-form/sla`. Render cell logic như code mẫu.

3. **Detail page banner** — Thêm banner ngay sau page header, trước form content body. Format `escalatedAt` bằng `formatDateTime` từ `@/lib/utils/format` (verified `lib/utils/format.ts:77`).

4. **Detail page action buttons** — Đọc current button rendering logic. Nếu UI render dựa trên `availableActions` từ server → Phase 2 đã handle. Nếu UI tự tính → thêm prop `disabled={form.escalatedAt && !currentUser.isDirector}`.

5. **Tooltip** — Dùng existing tooltip component hoặc native `title` attribute (KISS).

5b. **Approval log render (null approverId)** — Detail page hiển thị danh sách approvals từ `form.approvals`. Phase 1 đã migrate `approverId` thành nullable. Khi `approval.approverId == null` (system escalation):
   - Hiển thị "(tự động)" thay tên người duyệt
   - Step label: "Tự động chuyển Giám đốc" cho `step === "auto_escalated"`
   - Action: `action === "escalated"` render "Quá hạn 24h"

6. **Dark mode** — Verify badge & banner colors hoạt động trên cả light/dark.

7. **Visual test** — Run dev server, test 3 scenarios:
   - Phiếu mới (pending, còn 20h) → list cell xanh "Còn 20h"
   - Phiếu sắp hết hạn (còn 2h) → cell đỏ "Còn 2h"
   - Phiếu escalated → cell badge "Quá hạn", detail có banner, TBP login thấy buttons disabled

8. **Verify:** `npx tsc --noEmit` clean, manual UI check qua browser.

## Success Criteria

- [ ] List page hiển thị đúng SLA cell với màu sắc đúng theo threshold
- [ ] Detail page hiển thị banner khi escalated
- [ ] TBP login thấy buttons disabled khi form escalated; Director thấy enabled
- [ ] Không có warning React (key, hydration mismatch)
- [ ] `npx tsc --noEmit` clean
- [ ] Dark mode visual ok

## Risk Assessment

- **Risk:** Server-side time vs client-side time lệch → "Còn X giờ" sai nhẹ.
  **Mitigation:** Render server-side bằng `hoursRemaining` (chạy trong Server Component) → snapshot tại thời điểm SSR. User refresh để cập nhật. Acceptable cho granularity giờ.

- **Risk:** Button disable logic phụ thuộc UI hiện tại — nếu UI dùng client-side `currentUser` không có flag `isDirector` thì cần wire thêm.
  **Mitigation:** Server-side render available actions; client chỉ render based on server output → an toàn nhất.

- **Risk:** Banner spam khi form escalated từ lâu — user thấy mỗi lần mở.
  **Mitigation:** Acceptable — banner là context quan trọng, không phải intrusive modal.
