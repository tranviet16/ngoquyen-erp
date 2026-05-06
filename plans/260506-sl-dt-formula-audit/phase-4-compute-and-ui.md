---
phase: 4
title: Compute Service + 5 UI Reports
status: pending
priority: P1
effort: 8h
dependencies: [3]
---

# Phase 4 — Compute Service + UI

## Overview
Service compute layer (không lưu derived). 5 trang report mirror cấu trúc Excel.

## Service: `lib/sl-dt/report-service.ts` (rewrite)

### Core types
```typescript
type LotRow = {
  lotId: number;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  estimateValue: number;
  contractValue: number | null;
  // Inputs
  slKeHoachKy: number; slThucKyTho: number; slLuyKeTho: number; slTrat: number;
  dtKeHoachKy: number; dtThoKy: number; dtThoLuyKe: number;
  qtTratChua: number; dtTratKy: number; dtTratLuyKe: number;
  milestoneText: string | null; settlementStatus: string | null;
  // Computed
  slTongThoTrat: number;     // F + G
  slConPhaiTH: number;        // C - F
  slPctKy: number;            // E / D
  slPctLuyKe: number;         // F / C
  dtCongNoTho: number;        // D - G
  dtCongNoTrat: number;       // I - K
  dtTongKy: number;           // F + J
  dtTongLuyKe: number;        // G + K
  dtCongNoTong: number;       // H + L
  dtPctKeHoach: number;       // F / E
  dtPctLuyKe: number;         // G / D
  // Chỉ tiêu computed
  phaiNop: number;            // L formula
  paidStatus: string;         // O formula text
};
```

### Compute formulas (core)
```typescript
function computeLot(input: MonthlyInput, lot: SlDtLot, status: ProgressStatus, plan: PaymentPlan, scoreMap: Map<string, number>): LotRow {
  const C = +lot.estimateValue, D = +(lot.contractValue ?? 0);
  const E_sl = +input.slKeHoachKy, F_sl = +input.slThucKyTho, G_sl = +input.slLuyKeTho, H_sl_trat = +input.slTrat;
  const E_dt = +input.dtKeHoachKy, F_dt = +input.dtThoKy, G_dt = +input.dtThoLuyKe;
  const I_dt = +input.qtTratChua, J_dt = +input.dtTratKy, K_dt = +input.dtTratLuyKe;

  // SL formulas
  const slTongThoTrat = G_sl + H_sl_trat;
  const slConPhaiTH = C - G_sl;
  const slPctKy = E_sl === 0 ? 0 : F_sl / E_sl;
  const slPctLuyKe = C === 0 ? 0 : G_sl / C;

  // DT formulas
  const H_cn_tho = D - G_dt;
  const L_cn_trat = I_dt - K_dt;
  const M_dt_ky = F_dt + J_dt;
  const N_dt_luy = G_dt + K_dt;
  const O_cn_tong = H_cn_tho + L_cn_trat;
  const P_pct_kh = E_dt === 0 ? 0 : F_dt / E_dt;
  const Q_pct_luy = D === 0 ? 0 : G_dt / D;

  // Chỉ tiêu (phải nộp + status)
  const { phaiNop, paidStatus } = computePaidStatus(status, plan, scoreMap, F_dt + J_dt, G_dt + K_dt, C);
  return { /* ... */ };
}

function computePaidStatus(status: ProgressStatus, plan: PaymentPlan | null, scoreMap: Map<string, number>, _, _, estimateC: number) {
  if (status?.settlementStatus === "Đã quyết toán") return { phaiNop: estimateC, paidStatus: "" };
  if (!plan) return { phaiNop: 0, paidStatus: "" };

  const diem = scoreMap.get(status?.milestoneText ?? "") ?? 0;
  const m1 = scoreMap.get(plan.dot1Milestone ?? "") ?? 0;
  const m2 = scoreMap.get(plan.dot2Milestone ?? "") ?? 0;
  const m3 = scoreMap.get(plan.dot3Milestone ?? "") ?? 0;

  const can2 = diem >= (m1 - 10);
  const can3 = diem >= (m2 - 10);
  const can4 = diem >= (m3 - 10);
  const phaiNop = +plan.dot1Amount + (can2 ? +plan.dot2Amount : 0) + (can3 ? +plan.dot3Amount : 0) + (can4 ? +plan.dot4Amount : 0);
  // paidStatus tính sau với tienDaDong
  return { phaiNop, paidStatus: "" /* compute in caller */ };
}
```

### Subtotal rollup
Nhóm theo `phaseCode → groupCode → lots`, sum tất cả input cols, recompute formula trên sum (không tính avg %).

## UI: 5 Pages mirror Excel

### Route structure
```
app/(app)/sl-dt/
├── page.tsx                     # dashboard / month picker
├── san-luong/page.tsx           # Báo cáo sản lượng
├── doanh-thu/page.tsx           # Báo cáo doanh thu
├── chi-tieu/page.tsx            # Chỉ tiêu (input + status)
├── tien-do-xd/page.tsx          # Tiến độ XD
└── tien-do-nop-tien/page.tsx    # Tiến độ Nộp tiền + plan editor
└── cau-hinh/page.tsx            # Quản lý mốc điểm (CauHinh)
```

### Báo cáo Sản lượng
Bảng 11 cột: STT | Danh mục | C | D | E | F | G | H=F+G | I=C-F | J=E/D | K=F/C | Ghi chú.
Rows: phase header (rowSpan title), group header, lots, group subtotal, phase subtotal.
Sticky header. Format số VND.

### Báo cáo Doanh thu
Bảng 13 cột (D..Q của Excel) + STT/Danh mục.

### Chỉ tiêu
Form mode: editable cells D/E (chỉ tiêu) + M (tiến độ text dropdown từ MilestoneScore) + P (settlementStatus toggle). Compute cols L/O hiển thị real-time.

### Tiến độ XD
Read-only table hiển thị 6 cột status text (KHUNG BTCT, XÂY TƯỜNG, TRÁT NGOÀI, XÂY THÔ, TRÁT HOÀN THIỆN, HỒ SƠ).

### Tiến độ Nộp tiền
CRUD: 1 row/lô. Edit 8 fields (4 đợt × tiền+mốc). Cột derived = score.

### CauHinh
CRUD: milestone text → score.

## Files
- Modify: `lib/sl-dt/report-service.ts`
- Create: `lib/sl-dt/compute.ts` (pure functions)
- Create: `lib/sl-dt/rollup.ts` (subtotal logic)
- Create: `app/(app)/sl-dt/san-luong/page.tsx`
- Create: `app/(app)/sl-dt/doanh-thu/page.tsx`
- Modify: `app/(app)/sl-dt/chi-tieu/page.tsx`
- Modify: `app/(app)/sl-dt/tien-do-xd/page.tsx`
- Create: `app/(app)/sl-dt/tien-do-nop-tien/page.tsx`
- Create: `app/(app)/sl-dt/cau-hinh/page.tsx`
- Modify: `app/(app)/sl-dt/page.tsx` (dashboard)

## Success Criteria
- [ ] 5 pages render đúng cấu trúc cột Excel
- [ ] Compute cols match Excel formulas (T11 spot-check 5 lô)
- [ ] Subtotal nhóm/giai đoạn khớp Excel
- [ ] Edit Chỉ tiêu → save → re-render → status đổi đúng
- [ ] Edit Payment plan → Chỉ tiêu page reflect ngay (cùng request)
