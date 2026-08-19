# Phase 05 — Docs + full verify

## Context links

- Convention hôm nay: `docs/du-an/can-doi-vat-tu-convention.md`.
- Changelog: `docs/project-changelog.md`.
- Journal template: `docs/journals/260818-can-doi-vat-tu-mam-non-trai-chuoi.md`.
- Development rules: `docs/development-rules.md`.

## Overview

Cập nhật convention doc để phản ánh: bucket + ε, semantics `qtyHd` vs `qty`, quy ước nhập "SL HĐ" trên form giao dịch, và mô tả 3 chế độ xem. Thêm 1 changelog entry. Chạy full gate + manual walkthrough trên dev data (MNTC-GD1). Không viết file .md khác trừ khi cần.

## Key insights

- Doc convention tồn tại — phần "3. Còn phải lấy HĐ" giữ, thêm section mới "3a. Bucket & ngưỡng ε" và "3b. 3 chế độ xem"; section "2. Khi có số thực tế" bổ sung dòng "SL HĐ có thể ≠ SL nếu hóa đơn cân thuế / xuất khối lượng chỉ định".
- Changelog: 1 entry theo format hiện tại (`feat(du-an): …`).

## Requirements

- `docs/du-an/can-doi-vat-tu-convention.md`:
  - Section §2: nêu SL HĐ vs SL, khi nào nên nhập khác nhau, mặc định = SL.
  - Section §3a (mới): bucket labels + ε công thức + màu.
  - Section §3b (mới): mô tả 3 chế độ + khi nào có ý nghĩa (mode 2/3 = chỉ khi cột TT được nhập).
  - Section §4 (import): note import đang set `qtyHd = qty` — sau import, "SL HĐ" mặc định giống SL cho tới khi người dùng chỉnh.
- `docs/project-changelog.md`: 1 mục date 2026-08-19 mô tả rebuild UI + qtyHd + export.
- Manual walkthrough (checklist trong `## Todo list`).
- Gate: `pnpm exec tsc --noEmit`, `pnpm exec eslint .`, `pnpm exec vitest run`, `pnpm build`. Không skip fail.
- Tùy chọn: fake 1 CO approved với costImpactVnd > 0 trên 1 estimate của MNTC-GD1 → verify Dự toán (adj) StatCard tăng đúng, rollback sau khi verify.

## Related code files

- Modify: `docs/du-an/can-doi-vat-tu-convention.md`.
- Modify: `docs/project-changelog.md`.
- Không modify code.

## Implementation steps

1. Đọc convention hiện tại, chèn 2 section mới (không xóa nội dung cũ).
2. Chèn changelog entry (giữ format `- YYYY-MM-DD ...` hoặc bullet — check pattern file).
3. Chạy `pnpm exec tsc --noEmit` → fix cuối cùng nếu còn.
4. `pnpm exec eslint .` → fix warning nếu có.
5. `pnpm exec vitest run` → toàn bộ pass.
6. `pnpm build` → success.
7. `pnpm dev` → walkthrough trên `/du-an/4/can-doi-vat-tu`:
   - StatCards có 4 card đủ số.
   - Worklist 10 dòng, click 1 dòng → expand + scroll.
   - Đổi 3 tab, xác nhận cột mode 1 đủ, mode 2/3 empty-state.
   - Search "cốt", filter "thiếu".
   - Tạo 1 giao dịch mới với SL=10, SL HĐ=8 → refresh → mode-3 hiện chênh SL = -2.
   - Xuất Excel → mở, đối chiếu TỔNG CỘNG = StatCards.
8. (Optional) Fake CO test → note kết quả trong journal, rollback CO.
9. Journal ngắn `docs/journals/260819-can-doi-vat-tu-ux-analytics.md` — quyết định lớn, trở ngại (nếu có), decision log.

## Todo list

- [ ] convention §2 mở rộng
- [ ] convention §3a bucket & ε
- [ ] convention §3b 3 chế độ xem
- [ ] convention §4 note qtyHd sau import
- [ ] changelog entry
- [ ] tsc pass
- [ ] eslint pass
- [ ] vitest pass
- [ ] build pass
- [ ] dev walkthrough all 8 items
- [ ] (optional) CO fake test
- [ ] journal entry

## Success criteria

- 4 gate lệnh pass exit 0.
- Convention doc đọc từ đầu đến cuối coherent, không nội dung mâu thuẫn.
- Walkthrough hoàn thành, không lỗi console/network.
- Changelog nêu chính xác việc thay đổi (không dùng "AI"/"Claude").

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Test contract git-ls-files fail vì file plan/reports mới | Med | Low | Contract test scope trong `lib/` — plan files ngoài phạm vi; nếu fail thì thêm ignore hoặc trim. |
| Build fail do dynamic route thiếu type params | Low | Med | Route mới đã dùng App Router convention chuẩn. |
| Fake CO test làm dirty dev DB | Med | Low | Bọc trong transaction rollback hoặc DELETE thủ công sau. |

## Security considerations

- Không commit fake CO vào git.
- Journal entry không chứa data PII của khách hàng.

## Next steps

Commit theo conventional (khuyến nghị chia 4 commit: schema/wiring, service, ui, export+docs). Tag/PR sau khi user review.
