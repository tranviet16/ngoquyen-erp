---
name: project-excel-material-debt-source-quirks
description: Verified quirks of the customer's material-debt Excel sources (Quản Lý Công Nợ/) that any import design must handle; checked 2026-11-05
metadata:
  type: project
---

Facts verified on 2026-11-05 while planning the material-debt cutover import (per-project tracking files under `Quản Lý Công Nợ/Theo Dõi Vật Tư/`, main file, CSV "Tổng công nợ"):

- The "Đối chiếu công nợ" sheet is the most complete delivery source; "Vật tư ngày" is empty in 6 of 24 files.
- Block period labels are unreliable: duplicated labels, a "27/09→26/10" block that contains a 27/10 delivery (its "Tổng nợ" includes it), stale "Hết 26/5/2026" carry-over labels, overlapping boundaries.
- Combined documents split rows by sub-section subtotal lines "Cộng <công trình>" (different from "Cộng P/S").
- "GTGT" lines look like deliveries (qty 1, price = VAT amount) and must not become deliveries.
- Dates with day ≤ 12 are stored as real dates with day and month swapped; day > 12 is text dd/mm/yyyy; year typos like "20260" and "2025".
- Nhập Liệu has one row per delivery with TT = qty × price, and its dates are real date cells, so it can disambiguate dirty dates.
- In the CSV, "Đã thanh toán" is column I (blank header); H only appears on "Cộng" rows; J = G − I on every row; the first table ends at "Tổng cộng".

**Why:** These break naive parsing and naive "balance at 26/10 = block Tổng nợ" acceptance checks; the codebase cannot reveal them.
**How to apply:** Re-verify before relying on them (files may be edited); design parsers and verification reports to tolerate them. See [[project-import-preview-has-no-mapping-ui]] if it gets written.
