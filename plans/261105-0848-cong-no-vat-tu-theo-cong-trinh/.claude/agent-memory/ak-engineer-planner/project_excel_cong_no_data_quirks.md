---
name: excel-cong-no-data-quirks
description: Non-obvious quirks of the "Quản Lý Công Nợ" Excel/CSV data (material debt cutover) that break naive parsing or acceptance checks
metadata:
  type: project
---

Verified 2026-11-05 with openpyxl on `Quản Lý Công Nợ/` (untracked in git).

- Per-project đối chiếu blocks include lines dated after the block's "đến hết ngày Y" (Bê tông HP × Trại Chuối block 27/09→26/10 contains 27/10, and its Tổng nợ 509.563.111 includes it). Anchor check must be ERP(Y) + Σ lines > Y = Tổng nợ.
- Last block is often not 27/09→26/10 (some stop at 26/06–26/09, some lack Tổng nợ, one has to<from typo "27/08→26/07", duplicate same-range blocks exist; some files have a 27/10→26/11 block).
- Dates: day≤12 stored as real dates with day/month swapped; day>12 stored as text; typos like "14/09/20260", "19/4/2025"; Nhập Liệu has 3 text dates with year 0206. Continuation rows (no STT/date) belong to the row above; subtotal rows "Tổng …" must be skipped.
- Nhập Liệu: one row can aggregate several delivery lines of a day; "Thuế hóa đơn" rows are tax; HĐ-only "Lấy Hàng" rows are invoice issuance. Only "Cống hộp - Tiên lãng" has two Chủ thể.
- CSV is UTF-8 without BOM, has shifted numeric cells and a second table with #REF!.
- The import UI (as of df1e1e7) has no conflict-resolution step: commit-panel sends mapping "{}".

**Why:** these facts are costly to rediscover and silently invert reconciliation results.
**How to apply:** any plan/import touching this data must use typed cell reading, block-range date resolution, max-multiplicity dedupe, and the adjusted anchor formula. See [[vat-tu-cutover-plan-candidate-2]] report in plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/.
