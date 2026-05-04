---
title: ERP Ngọ Quyến – Phase 1 Implementation
created: 2026-05-04
status: pending
mode: hard
source_brainstorm: ../260504-erp-phase1-brainstorm/brainstorm-summary.md
stack: Next.js 15 + TypeScript + PostgreSQL + Prisma + AG Grid
team_size: 1 dev full-time
estimated_duration: 10–12 tuần
---

# ERP Ngọ Quyến – Phase 1 Implementation Plan

## Goal
Số hóa nguyên trạng 6 file Excel SOP thành web app nội bộ (<20 user), giữ nguyên logic & layout báo cáo, bổ sung multi-user, RBAC, audit log.

## Source
- Brainstorm: [../260504-erp-phase1-brainstorm/brainstorm-summary.md](../260504-erp-phase1-brainstorm/brainstorm-summary.md)

## Phases

| # | Phase | Status | Priority | Effort | Depends On |
|---|-------|--------|----------|--------|------------|
| 1 | [Setup & Foundation (Auth, RBAC, Audit, Infra)](phase-01-setup-foundation.md) | completed | P1 | 2w | — |
| 2 | [Master Data (Entities, Suppliers, Projects, Items, ...)](phase-02-master-data.md) | completed | P1 | 1w | 1 |
| 3 | [Module: Quản lý Dự án Xây dựng](phase-03-module-du-an.md) | pending | P1 | 3w | 2 |
| 4 | [Module: Vật tư theo NCC (per-supplier)](phase-04-module-vat-tu-ncc.md) | pending | P2 | 1w | 2 |
| 5 | [Module: Công nợ Vật tư + LedgerService core](phase-05-module-cong-no-vat-tu.md) | pending | P1 | 1.5w | 2 |
| 6 | [Module: Công nợ Nhân công (reuse Ledger)](phase-06-module-cong-no-nhan-cong.md) | pending | P1 | 0.5w | 5 |
| 7 | [Module: Sản lượng – Doanh thu](phase-07-module-sl-dt.md) | pending | P2 | 1w | 3 |
| 8 | [Module: Quản lý Tài chính NQ + Dashboard](phase-08-module-tai-chinh.md) | pending | P2 | 1.5w | 5,6 |
| 9 | [Excel Import (one-shot) + Export (PDF/Excel)](phase-09-import-export.md) | pending | P1 | 1w | 8 |
| 10 | [UAT, Bug Fix, Training, Go-live](phase-10-uat-golive.md) | pending | P1 | 1w | 9 |

## Key Dependencies
- Phase 1 blocks everything (auth + audit middleware needed by all)
- Phase 2 (master data) blocks all module phases
- Phase 5 (LedgerService) blocks Phase 6 (Công nợ Nhân công reuses engine)
- Phase 9 (import) requires all module schemas → run near the end
- Phase 10 needs Phase 9 done (import historical data first)

## Cross-cutting Concerns (apply to ALL phases)
- Mọi mutation đi qua Prisma middleware ghi audit log
- Mọi route check RBAC qua middleware Better Auth
- Mọi giao dịch tiền có cặp `*_tt` / `*_hd`
- File code ≤ 200 dòng (per global rules)
- Compile check (`tsc --noEmit`) sau mỗi file mới/sửa

## Success Criteria (Phase 1 overall)
- [ ] 100% data từ 6 file Excel import vào DB không lỗi
- [ ] Báo cáo tháng khớp 100% với Excel cũ trên dataset mẫu
- [ ] ≥5 user đồng thời không lỗi
- [ ] Tất cả mutation có audit log
- [ ] Export Excel đúng mẫu cũ
- [ ] Load màn hình giao dịch <2s với 10k row

## Out of Scope
Mobile app, multi-tenant, e-invoice integration, BI cube, workflow approval đa cấp, public API.
