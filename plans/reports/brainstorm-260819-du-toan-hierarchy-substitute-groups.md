# Brainstorm: Phân cấp hạng mục + nhóm vật liệu thay thế + đối chiếu tên DT↔HĐ/TT

Date: 2026-08-19 · Advisor: kongming · Status: APPROVED (4 decisions locked)
Builds on: commits 63b0a39 (cân đối import), 8449cfc (3-mode screen + qtyHd), bbfa282 (dự toán official adapter)

## Problem

1. Dự Toán / Phát Sinh / DT Điều Chỉnh tabs are flat lists — no totals by hạng mục lớn (HM1, HM2…) / nhỏ (VL, NC, MAY, CPC).
2. Norm assessment penalizes substitutions: buying cát vàng when cát mịn ran out reads as "vượt cát vàng + thừa cát mịn". Need substitute-material groups assessed jointly.
3. DT names ≠ HĐ/TT commercial names (Gạch không nung ↔ "Gạch 600x600 mã 38017"); linkage exists via itemCode but is INVISIBLE; orphan txns ("ngoài DT") have no reassignment action.

## Verified constraints

- Category codes already encode hierarchy: `HM<n>-<SECTION>` → pure prefix parsing, NO ProjectCategory.parentId (degrades to 1 level for non-conforming codes e.g. "HM01").
- can-doi client already has collapsible-group/subtotal/ColumnDef machinery to reuse; can-doi service post-processes in TS (views stay untouched).
- normVtName + suppression rules (unitMismatch → null metrics) are the established contracts.
- No audit subsystem in lib/du-an — reassignment is a plain edit-level mutation (trace via txn.note if desired).
- Item master table exists but unused by this flow — do NOT link to it.

## Approved design

### A. Hierarchy display (no schema change)
- New pure helper `lib/du-an/category-tree.ts`: regex `^(HM\d+)-(.+)$` → 2 levels (HM → section=category); non-matching code → own level-1 group, no section layer.
- **du-toan (DECISION 3: grid MUST be grouped)**: replace DataGrid with can-doi-style grouped table (HM header → section header → item rows → subtotals + % share). Editing: keep CRUD dialog (Thêm/Sửa/Xóa); inline numeric edit for qty/unitPrice via OverrideCell-style inputs if cheap in plan, else dialog-only. Trade-off (losing DataGrid inline editing) explicitly accepted by user.
- **du-toan-dieu-chinh** (read-only): full grouped table, same pattern (columns: gốc, CO impact, điều chỉnh).
- **phat-sinh**: totals tree above the existing CRUD grid; `categoryId=null` COs → "Chưa gán hạng mục" bucket.
- Share the grouping helper (pure fn); copy header-row JSX per tab — do NOT build one generic grouped-table component spanning editable+read-only tabs, do NOT teach DataGrid trees.

### B1. Substitute-material groups (one migration)
- `ProjectMaterialGroup(id, projectId, name, note, deletedAt, createdAt, updatedAt)` — note field load-bearing ("đã hỏi CĐT, lấy HĐ cát vàng được").
- `ProjectEstimate.materialGroupId Int?` (SetNull on group delete).
- **DECISION 1: per-project scope** (copy-from-project action = future nicety).
- Grouping UI: multi-select estimate rows (dinh-muc or can-doi) → "Nhóm vật tư thay thế" → name + note. MANUAL first; heuristic suggestions (same section + same normalized unit + shared leading token) = v3; LLM/embeddings = never.
- Consumption rollup: group layer ADDED (group header + member rows), members keep rows. **DECISION 2: member-level flags muted/grey; group flag authoritative.** Σqty/%SL/avg-price at group level ONLY when all members share normVtName(unit); else money-only (same suppression contract as unitMismatch). NO unit conversion. Blended group price labeled "giá bq nhóm". Cheaper substitute ≠ auto "savings" — show numbers, no editorializing color.
- Consumed by: dinh-muc (norm flags) + can-doi mode "Thi công vs DT". Implemented as TS post-processing over existing service outputs; vw_project_norm and can-doi SQL untouched.

### B2. DT↔HĐ/TT name reconciliation (no schema change — build FIRST)
- can-doi estimate rows expandable (chevron) → member transactions (date, tên thương mại, số HĐ, SL, ĐVT, tiền HĐ/TT). Eager fetch fine at current scale.
- "tên khác DT" badge: `ARRAY_AGG(DISTINCT pt."itemName")` in estimate query; server-side crude token-intersection check vs estimate name (normVtName tokens) — no similarity scoring.
- Orphan ("ngoài DT") rows get "Gán vào dự toán…" action → searchable estimate picker → **DECISION 4: bulk reassign whole (categoryId, itemCode) txn cluster** to target estimate's (categoryId, itemCode); individual txns remain editable in Giao Dịch. Guard: edit-level project scope. Trace: append note "gán từ <old code>". No audit subsystem.
- Dedicated review screen: deferred, likely never (build only if badge count stays chronically high).

## Sequencing

- **v1** (no schema): B2 (expandable members + badge + gán-vào-DT) → A (category-tree helper; du-toan grouped table; du-toan-dieu-chinh grouped table; phat-sinh totals tree).
- **v2** (1 migration): MaterialGroup + grouping UI + group layer in dinh-muc/can-doi with muted member flags.
- **v3** (on demand): heuristic suggestions; review screen.

## Avoid (agreed)

ProjectCategory.parentId · DataGrid tree rendering · global Item catalog linkage · unit conversion between substitutes · similarity scoring/embeddings · audit subsystem for reassignment · generic grouped-table abstraction.

## Success metrics

- Dự Toán mở lên thấy ngay tổng từng HM và từng VL/NC/Máy, khớp Σ các dòng con.
- Bấm 1 dòng dự toán thấy đủ các hóa đơn tên thương mại thuộc nó; dòng lệch tên có nhãn.
- "Ngoài DT" giảm về ~0 sau khi dùng nút gán; %HĐ các dòng đích tăng tương ứng.
- Sau v2: nhóm "Cát xây" (mịn+vàng) chấm 1 cờ định mức chung; hết cảnh cờ đỏ giả.

## Decisions log (2026-08-19)

1. Nhóm thay thế: theo từng dự án.
2. Cờ định mức thành viên nhóm: làm mờ, cờ nhóm là chính.
3. Tab Dự Toán: lưới chính nhóm theo hạng mục (bỏ DataGrid inline; sửa qua dialog + ô sửa nhanh nếu rẻ).
4. Gán "ngoài DT": cả cụm cùng mã một lần.
