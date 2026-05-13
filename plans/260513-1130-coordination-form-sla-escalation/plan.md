---
title: "CoordinationForm SLA 24h Escalation"
description: "TBP có 24h calendar duyệt phiếu phối hợp; quá hạn → tự chuyển Giám đốc + notify; thống kê escalation"
status: pending
priority: P2
created: 2026-05-13
---

# CoordinationForm SLA 24h Escalation

## Overview

Mỗi `CoordinationForm` ở trạng thái `pending_leader` có SLA 24h calendar tính từ `submittedAt`. Nếu TBP không duyệt trong 24h, phiếu **tự động** escalate sang Giám đốc (`user.isDirector = true`) — TBP bị khoá action, chỉ Director duyệt được. Director nhận notification in-app. Các phiếu bị escalate được thống kê tại trang riêng + badge trên dashboard hiệu suất.

**Decisions chốt từ brainstorm:**
- SLA = 24h **calendar** từ `submittedAt` (không tính giờ làm việc)
- Trigger = **lazy on-read** (check trong `getCoordinationForm` + `listForms`), không cần cron
- Lock policy = **TBP khoá hoàn toàn**, chỉ Director duyệt được
- Notification = in-app cho mọi user có `isDirector = true` (reuse `Notification` model)
- Stats = badge trên `/van-hanh/hieu-suat` + trang chi tiết `/van-hanh/phieu-phoi-hop/thong-ke-sla`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema & SLA helpers](./phase-01-schema-sla-helpers.md) | Pending |
| 2 | [Service guards & escalation](./phase-02-service-guards-escalation.md) | Pending |
| 3 | [Notifications](./phase-03-notifications.md) | Pending |
| 4 | [UI badges & list column](./phase-04-ui-badges-list-column.md) | Pending |
| 5 | [Stats page & dashboard widget](./phase-05-stats-page-dashboard-widget.md) | Pending |

## Dependencies

Không có cross-plan dependency. Kiểm tra `260511-1200-notion-task-detail` và `260511-1925-profile-config-page` — không chồng lấn file.

## Architecture Summary

```
Submit form ──▶ submittedAt = now, status=pending_leader
                       │
        (24h calendar) │
                       ▼
       ┌──── lazy check on read ────┐
       │ getCoordinationForm()      │
       │ listForms() loop           │
       └────────────┬───────────────┘
                    │ overdue?
            ┌───────┴───────┐
           No              Yes
            │               │
       (giữ nguyên)     escalateIfOverdue() [TXN]
                            │ SELECT FOR UPDATE
                            │ UPDATE escalatedAt, escalatedFromUserId
                            │ INSERT approval (step="auto_escalated")
                            │ INSERT notification × N directors
                            ▼
                       Director thấy badge + notification
                       TBP bị block (auth guard check escalatedAt)
                       Director duyệt → reuse leaderApprove/Reject*
```

## Files Impact

**New:**
- `lib/coordination-form/sla.ts` — pure helpers (`isOverdue`, `deadlineOf`, `hoursRemaining`)
- `lib/coordination-form/sla-stats.ts` — query escalated forms với filter
- `app/(app)/van-hanh/phieu-phoi-hop/thong-ke-sla/page.tsx` — trang thống kê
- `prisma/migrations/<ts>_add_coordination_form_sla/migration.sql`

**Modified:**
- `prisma/schema.prisma` (CoordinationForm: +escalatedAt, +escalatedFromUserId, +index)
- `lib/coordination-form/coordination-form-service.ts` (insert `escalateIfOverdue`, wire vào `getForm`/`listForms`, relax `requireLeaderForExecutor`, notify directors)
- `app/(app)/van-hanh/phieu-phoi-hop/page.tsx` (list — thêm cột SLA + badge "Quá hạn")
- `app/(app)/van-hanh/phieu-phoi-hop/[id]/page.tsx` (detail — banner escalation, disabled buttons cho TBP)
- `app/(app)/van-hanh/hieu-suat/page.tsx` (widget escalation count)

## Success Criteria

- [ ] Migration apply clean trên DB hiện tại (không mất data)
- [ ] Phiếu submit hôm qua > 24h → mở detail tự escalate, notification gửi tới mọi director
- [ ] TBP cố `leaderApprove` sau escalate → throw "Phiếu đã quá hạn — chỉ Giám đốc duyệt"
- [ ] Director `leaderApprove` thành công, đồng thời tạo Task như flow cũ
- [ ] Trang `/thong-ke-sla` list được phiếu escalated, filter theo TBP/tháng work
- [ ] Widget `/hieu-suat` hiển thị đúng số phiếu escalated trong tháng hiện tại
- [ ] Idempotent: gọi `escalateIfOverdue` 2 lần liên tiếp không tạo duplicate notification/approval
- [ ] No race: 2 user mở form cùng lúc → chỉ 1 escalation record (SELECT FOR UPDATE)

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Race condition duplicate escalate | Medium | `prisma.$transaction` + raw `SELECT ... FOR UPDATE` trên `coordination_forms.id` |
| Phiếu cũ không ai mở → không escalate | Low | Acceptable trade-off (KISS — không có cron infra). List view sẽ catch khi user vào trang |
| Director count = 0 → không ai duyệt được | Medium | Service throws rõ ràng khi escalate; admin có thể grant `isDirector` qua `/admin/nguoi-dung` |
| Existing forms với status `pending_leader` cũ (>24h trước migration) | High | Migration backfill: SET `escalatedAt = submittedAt + 24h` WHERE `status='pending_leader' AND submittedAt < NOW() - 24h` |
| Performance trên list view (loop escalate N forms) | Low | Index `[status, submittedAt]` + batch updateMany; expect <50 forms pending tại bất kỳ thời điểm |

## Effort Estimate

- Phase 1 (Schema + helpers): 1.5h
- Phase 2 (Service + auth): 3h
- Phase 3 (Notifications): 1h
- Phase 4 (UI form badges + list): 3h
- Phase 5 (Stats page + widget): 3h

**Total: ~11.5h (~1.5 ngày)**

## Validation Log

### Session 1 — 2026-05-13

**Verification Results (Tier: Full, 5+ phases):**
- Claims checked: 5
- Verified: 4 | Failed: 1
- Failure: `CoordinationFormApproval.approverId` is NOT NULL (schema.prisma:119) — must resolve before Phase 2

**Decisions:**

1. **approverId nullable migration** — Phase 1 sẽ gộp migration đổi `CoordinationFormApproval.approverId` từ `String` → `String?`. UI render "(tự động)" khi null. Rationale: semantic chính xác cho system actions, reusable cho future automation.

2. **Backfill scope** — Migration mark TẤT CẢ phiếu `status='pending_leader' AND submitted_at < NOW() - 24h` thành escalated. KHÔNG gửi notification cho backfilled rows. TBP bị khoá các phiếu cũ này (chuyển hết cho Director). Tránh burst N×M notifications khi deploy.

3. **Director auth** — Chỉ user có `isDirector = true` được duyệt phiếu escalated. Admin KHÔNG tự động có quyền. Nếu admin cần duyệt → grant `isDirector` qua UI hiện có. Giữ axis auth đơn nhất.

4. **Stats access** — Trang `/thong-ke-sla` truy cập **chỉ qua dashboard widget click** trên `/van-hanh/hieu-suat`. Không thêm sidebar menu item. KISS, tránh menu clutter.

**Minor correction:** Phase 4 tham chiếu `fmtDateTime` — actual helper là `formatDateTime` (`lib/utils/format.ts:77`). Sẽ dùng tên đúng khi implement.
