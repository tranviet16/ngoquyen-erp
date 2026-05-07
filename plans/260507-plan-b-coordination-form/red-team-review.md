---
title: "Red-team review — Plan B"
status: pending
---

# Red-team review — Plan B

Adversarial review từ góc nhìn hostile reviewer. Mỗi finding có severity (S1=block release, S2=fix trước go-live, S3=ack & defer).

## Findings

### F1 [S2] — Code generator có race condition không retry đủ
**Vấn đề:** `nextFormCode()` dùng `count(*) + 1`. Khi 2 user submit đồng thời → cả 2 nhận `001` → 1 fail UNIQUE. Retry 3 lần OK với traffic thấp, nhưng nếu 5 user click cùng lúc (demo, training session) → ≥1 user nhận lỗi confusing.
**Mitigation:** Đã có retry. Bổ sung: nếu retry exhausted → fallback `${PREFIX}-${yyyymm}-${Date.now() % 1000}` để không bao giờ fail. **Decision:** v1 giữ retry 3, ack rủi ro. Document trong service.

### F2 [S2] — `executorDeptId` không validate `isActive`
**Vấn đề:** Admin disable phòng KH (`isActive=false`). Creator vẫn thấy phòng KH trong dropdown vì list-departments không filter. Submit thành công → leader phòng KH không tồn tại → tắc.
**Mitigation:** `createDraftSchema` thêm refine: query `executorDept.isActive === true`. UI: filter dropdown.

### F3 [S1] — Permission check race khi user chuyển phòng
**Vấn đề:** Leader phòng KH đang xem detail phiếu (status pending_leader). Admin chuyển user này sang phòng KT. User F5 nhanh, click `Duyệt` trước khi context refresh. Server check: `ctx.departmentId === form.executorDeptId` → giờ là KT ≠ KH → **bị từ chối đúng**. OK, không có bug.
**Verify:** Service `leaderApprove` re-fetch `getUserContext()` mỗi call (không cache). Đã đúng trong phase-02 design.

### F4 [S2] — Director self-approve tự phiếu
**Vấn đề:** Director vừa là creator vừa là leader phòng thực hiện → tự duyệt 3 bước. Audit log có ghi nhưng UI không cảnh báo.
**Mitigation:** v1 ALLOW (đã ghi trong phase-02 risks). Bổ sung: list page có badge `Tự duyệt` cho phiếu mà `creatorId === firstApproverId === lastApproverId`. **Decision:** defer, không block.

### F5 [S2] — Reject_close không có "khôi phục"
**Vấn đề:** Leader nhỡ tay click `Từ chối (đóng)` thay vì `Yêu cầu sửa` → phiếu vào terminal `rejected` không thể recover. Creator phải tạo phiếu mới mất số code.
**Mitigation:** Confirm dialog có warning rõ "Hành động này không thể hoàn tác". UI: button `reject_close` luôn variant=`destructive` đỏ. **Decision:** chấp nhận, làm rõ UX.

### F6 [S1] — Comment XSS / Markdown injection
**Vấn đề:** Reject comment 500 chars → có thể paste `<script>` hoặc markdown link `[click](javascript:...)`.
**Mitigation:** Render bằng React `{comment}` (auto escape). KHÔNG dùng `dangerouslySetInnerHTML` hay `react-markdown`. Verify trong phase-04 code review.

### F7 [S3] — Phòng thực hiện không có leader sau khi đã submit
**Vấn đề:** Phiếu submit → leader phòng KH bị bỏ flag isLeader (admin sửa). Phiếu kẹt ở `pending_leader` không ai duyệt được.
**Mitigation:** List page admin có cảnh báo `phiếu pending_leader của phòng không có leader`. Hoặc admin reassign. **Decision:** defer, ack.

### F8 [S2] — Updated form sau khi submit
**Vấn đề:** `updateDraft` chỉ check `status === 'draft' || 'revising'`. Nếu race: creator click Edit trong khi leader đang approve → leader update status thành `pending_director`, creator update content → phiếu approved mà nội dung đã thay đổi.
**Mitigation:** `updateDraft` thêm optimistic lock: `where: { id, status: { in: ['draft', 'revising'] } }`. Đã ngầm có vì service check status trước update, nhưng giữa check và update có window. **Fix:** dùng pattern atomic transaction giống state transition.

### F9 [S2] — Pagination filter URL không sync với client state
**Vấn đề:** Click filter pill → URL update → page re-render. Nhưng pagination `page=2` không reset về 1 khi đổi filter → empty page.
**Mitigation:** Filter pill click → `router.replace('?status=X&scope=Y&page=1')` luôn reset page.

### F10 [S3] — Audit log volume
**Vấn đề:** Mỗi state transition tạo: 1 audit log entry (auto từ `lib/prisma.ts`) + 1 approval row + 1 update form. 1 phiếu có thể tạo 6-10 rows audit. Sau 1 năm ~10k phiếu → 100k rows.
**Mitigation:** Postgres handle 1M+ rows OK. Index `auditLog(userId, createdAt)` đã có. Defer monitoring.

### F11 [S2] — Server action không rate-limit
**Vấn đề:** `createDraftAction` không có rate limit. Bot có thể spam tạo phiếu → cạn code sequence.
**Mitigation:** v1 internal app (auth required, ~50 users) không cần rate limit. Audit log + admin có thể detect. Defer.

### F12 [S1] — Director vắng = backlog không có cảnh báo
**Vấn đề:** Director đi nghỉ 2 tuần. Phiếu `pending_director` chất đống. List page admin không hiển thị warning.
**Mitigation:** List page có badge `${count} phiếu chờ giám đốc` ở header. Phase-03 phải implement.

## Summary

- **S1 (block):** F12 chỉ có 1 → fix bằng badge cảnh báo trong phase-03 (đã thêm vào success criteria)
- **S2 (fix trước go-live):** F1, F2, F4, F5, F6, F8, F9, F11 — đa số đã có mitigation, F2 + F8 + F9 cần update phase docs
- **S3 (ack & defer):** F7, F10 — document trong README

## Action items được nhặt vào plan

- ✅ Phase 3: Filter pill click reset `page=1` (F9)
- ✅ Phase 3: Filter dropdown phòng thực hiện chỉ show `isActive=true` (F2)
- ✅ Phase 3: Header list page hiển thị `${pendingDirectorCount} phiếu chờ giám đốc` (F12)
- ✅ Phase 2: `updateDraft` dùng atomic pattern (F8)
- ✅ Phase 2: `createDraftSchema` refine validate `executorDept.isActive` (F2)
