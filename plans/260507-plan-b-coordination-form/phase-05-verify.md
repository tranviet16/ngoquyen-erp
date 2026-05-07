---
phase: 5
title: "Verify + smoke test"
status: pending
priority: P2
effort: "30m"
dependencies: [4]
---

# Phase 5: Verify + smoke test

## Overview
End-to-end smoke test luồng phiếu phối hợp + commit.

## Smoke test checklist

Pre-req: 2 phòng (KT, KH), creator (member KT), leader KH, giám đốc — đã setup ở Plan A.

1. [ ] Login creator → vào `/phieu-phoi-hop` → list rỗng
2. [ ] Click `+ Tạo phiếu mới` → form load
3. [ ] Submit form rỗng → client validation chặn
4. [ ] Submit hợp lệ → redirect detail, status=`draft`, code `PCV-202605-001`
5. [ ] Click `Gửi duyệt` → status=`pending_leader`, history +1
6. [ ] Logout, login leader KH → list filter `Chờ duyệt L` thấy phiếu
7. [ ] Vào detail → 3 buttons (Duyệt / Sửa / Từ chối)
8. [ ] Click `Yêu cầu sửa`, comment "test revise" → status=`revising`
9. [ ] Logout, login creator → detail thấy nút Sửa + Resubmit
10. [ ] Sửa content, resubmit → status=`pending_leader`, history +2 row
11. [ ] Login leader → approve → status=`pending_director`
12. [ ] Login director → approve → status=`approved`
13. [ ] Verify list filter `Đã duyệt` thấy phiếu
14. [ ] Optimistic lock test (manual): mở 2 tab leader, cả 2 click approve gần đồng thời → 1 thắng, 1 nhận `Phiếu đã được xử lý`
15. [ ] Self-submit test: creator dept = executor dept → ALLOW (per locked decision)
16. [ ] Cancel test: tạo nháp, cancel → status=`cancelled`, không re-submit được

## Verification commands

```powershell
npx tsc --noEmit
npx prisma migrate deploy
docker exec docker-postgres-1 psql -U nqerp -d ngoquyyen_erp -c "SELECT code, status, creator_id FROM coordination_forms ORDER BY id DESC LIMIT 5"
docker exec docker-postgres-1 psql -U nqerp -d ngoquyyen_erp -c "SELECT form_id, step, action, comment FROM coordination_form_approvals ORDER BY signed_at DESC LIMIT 10"
```

(Lưu ý: tên cột thực tế là camelCase do Prisma `@@map` chỉ map tên bảng, không map cột — kiểm tra lại trong `\d coordination_forms`.)

## Implementation Steps

1. Run smoke test theo checklist trên
2. Capture bug → fix tại phase liên quan, đánh dấu lại
3. Commit: `git add . && git commit -m "feat(coordination-form): add inter-department coordination form with 3-step approval"`

## Success Criteria

- [ ] Tất cả 16 case pass
- [ ] `npx tsc --noEmit` clean
- [ ] Audit log có entry cho mỗi mutation (xem `audit_logs` table)
- [ ] Commit pushed

## Risk Assessment

- **Smoke test bỏ sót edge case** → red-team-review.md liệt kê 10+ edge case bổ sung. Nếu phát hiện bug mới → mở phase fix bổ sung.
