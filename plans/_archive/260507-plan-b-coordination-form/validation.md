---
title: "Validation — Plan B"
status: pending
---

# Validation — Plan B

Critical questions interview để verify plan đầy đủ.

## Q1: Phiếu `approved` có ai đọc không?
**Answer:** Có — creator + leader phòng KH + director + admin. Plan C sẽ tạo task tự động → người được giao nhìn thấy task. Plan B endpoint `/phieu-phoi-hop/[id]` đủ cho v1.

## Q2: Nếu director đổi (admin set user khác làm director) → phiếu cũ pending_director ai duyệt?
**Answer:** Director MỚI duyệt được (vì check `ctx.isDirector` runtime). Director CŨ mất quyền ngay. Audit log capture cả 2. **OK.**

## Q3: Có cần snapshot tên creator/leader/director vào row approval không?
**Answer:** Không. `approverId` FK → user.name. User name có thể đổi nhưng id không đổi. Nếu user bị xóa → cần soft-delete user (đã có `users` table). Currently no user deletion. **OK.**

## Q4: Phiếu `cancelled` rồi creator có tạo lại không?
**Answer:** Có — tạo phiếu mới với code mới (`PCV-202605-002`). Audit log giữ phiếu cũ. **OK.**

## Q5: Bulk approve có cần không?
**Answer:** Không (out of scope). Director duyệt 1-1 v1. Plan C có thể thêm sau.

## Q6: Notification email/zalo khi sao?
**Answer:** Out of scope Plan B. Locked decision: chỉ in-app. List page filter `Của tôi` + status `pending_*` đủ cho user check.

## Q7: Test data setup?
**Answer:** Plan A đã setup phòng + users + leader + director qua UI `/admin/phong-ban`. Phase 5 smoke test chạy trên data thật.

## Q8: Mobile UI?
**Answer:** Tablet OK (sidebar collapse), phone không trong scope v1 (admin tool desktop-first).

## Q9: I18n?
**Answer:** Vietnamese only v1. Hardcode strings.

## Q10: Performance — list 1000 phiếu?
**Answer:** Pagination 20/page + index `(executorDeptId, status)` + `(creatorId)` + `(status)`. Query thường <50ms. **OK.**

## Q11: Concurrency với 50 users?
**Answer:** Optimistic lock + retry handle OK. Postgres connection pool default 10 — Prisma 7 dùng singleton. **OK.**

## Q12: Rollback strategy nếu bug critical?
**Answer:** Migration reversible bằng `DROP TABLE coordination_form_approvals; DROP TABLE coordination_forms;` + revert User reverse relations. Audit log giữ lại history. Code rollback qua git revert.

## Q13: Plan B blocks Plan C — Plan C cần gì từ Plan B?
**Answer:** Plan C cần:
- `lib/coordination-form/coordination-form-service.ts` exports `directorApprove` → hook tạo task ở đây
- Schema `CoordinationForm.id` → task `sourceFormId` FK
- State machine `approved` event → trigger task creation

Plan B đã expose đủ. **OK.**

## Q14: Có cần search by code/content?
**Answer:** v1 chỉ filter status + scope. Search bằng Ctrl+F browser đủ (~20 phiếu/trang). Defer search box.

## Q15: Form attachments (file upload)?
**Answer:** Out of scope (đã ghi). Defer phiên bản sau.

## Validation summary

- ✅ Plan đầy đủ phases (5), thứ tự dependencies đúng
- ✅ Schema + state machine consistent với brainstorm locked decisions
- ✅ Permission matrix server-side enforced
- ✅ Risks documented + mitigated trong phase docs
- ✅ Plan B đủ cho Plan C downstream
- ✅ Effort estimate hợp lý (8-12h tổng)

**Verdict:** Plan B sẵn sàng để cook.
