# Brainstorm: Cân đối vật tư — UX + thống kê 3 chế độ xem

Date: 2026-08-19 · Advisor: kongming · Status: APPROVED (4 decisions confirmed)
Builds on: `plans/260818-2150-can-doi-vat-tu-mam-non-trai-chuoi/` (commit 63b0a39) + `plans/reports/brainstorm-260818-can-doi-vat-tu-mam-non-trai-chuoi.md`

## Problem

Current tab = flat 10-col × 370-row table serving 3 distinct recurring jobs at once → unreadable, not actionable:
(a) invoice-collection worklist (daily, data exists), (b) construction efficiency TT vs DT (future — amountTt all 0), (c) TT↔HĐ reconciliation (future).

## Approved design (v1 unless noted)

### Information architecture — ONE screen, mode-driven
- Segmented switcher swaps **column sets only**: `[Lấy hóa đơn] [Thi công vs DT] [TT vs HĐ]`. Same rows/grouping/table. Rejected: separate routes (fragments 1 dataset), flat table with more cols (died once already), per-category pages (only 6 cats).
- **Categories collapsed by default** (370→6 rows on load). Group header: code — name, subtotal, CSS progress bar %HĐ/DT, còn phải lấy, row count. Expand-all/collapse-all.
- Header **StatCards** (dashboard pattern): Tổng dự toán (điều chỉnh) | Đã lấy HĐ (+% +bar) | Còn phải lấy HĐ (override-aware Σ) | Thực tế đã nhập ("x/370 dòng · y đ").
- **Top-10 "Còn phải lấy HĐ" card** (value desc, excl. rows overridden ≤0); click scrolls/expands to row. Primary daily artifact.
- Modes 2–3 with TT coverage ≈ 0 → empty-state panel ("Chưa có số thực tế — nhập cột TT trên dòng giao dịch, tab Giao Dịch") + grayed count badge. Tabs stay visible (teaches workflow).
- Plain HTML table + existing OverrideCell. NO glide-data-grid, NO charting lib (CSS bars), NO pagination.

### Metrics (server-side computed; null = suppressed → client renders "—")
Mode 1 — Lấy hóa đơn:
- `pctHdMoney = invoiceAmount / adjustedEstimateTotal` (DECISION 3: denominator = dự toán + CO đã duyệt via `vw_project_estimate_adjusted.adjusted_total_vnd`; falls back to totalVnd when no COs). Derived "Còn phải lấy HĐ" base switches to adjusted total too; manual override still wins.
- `pctHdQty = qtyHd_stream / estimateQty` only when units match && estimateQty>0.
- Bucket từ remaining: `chưa lấy` (HĐ=0, DT>0) / `thiếu` (rem>ε) / `đủ` (|rem|≤ε) / `vượt` (rem<−ε) / `ngoài DT`. **DECISION 2: ε = max(1.000đ, 0,5% dự toán dòng)**.
- Progress bar cell (clamp 0-100, overflow amber) + bucket badge. Rollups = Σ numerators/denominators, never avg of %.

Mode 2 — Thi công vs DT (rows with TT data):
- `qtyTt = Σ qty FILTER (amountTt ≠ 0)`; `giaBqTt = ΣamountTt/qtyTt` vs `pe.unitPrice`.
- Cols: TT SL | DT SL | %SL | Giá DT | Giá bq TT | Chênh giá (đ & %) | Tác động giá = (giaBqTt−giaDt)×qtyTt. Badge đỏ "vượt lượng DT" khi %SL>100.
- NO full price/volume decomposition mid-project (conflates "chưa làm xong" with "tiết kiệm") — price variance only; per-category PV = v3 on demand.
- Suppress price compare when unitMismatch || estimateQty=0 || aggregate/CPC rows ("compare price only where qty compare valid").

Mode 3 — TT vs HĐ:
- **DECISION 4 (schema change): tách SL hóa đơn riêng.** Add nullable `ProjectTransaction.qtyHd Decimal?` — invoice quantity; `qty` remains real/actual quantity. `qtyHd = null` ⇒ same as qty. User confirmed invoice qty legitimately differs from real qty for the same delivery.
  - Import adapter: invoice rows write qtyHd = sheet HĐ SL (and qty = same value as initial placeholder until actuals corrected).
  - Giao dịch form: optional "SL HĐ" input (default = SL); zod schema + labels.
  - vw_project_norm UNTOUCHED (other consumers); per-stream aggregates read qtyHd.
- Cols: SL TT | SL HĐ | Chênh SL | Giá bq HĐ (ΣamountHd/ΣqtyHd) | Giá bq TT (ΣamountTt/ΣqtyTt) | Chênh giá | Chênh tiền TT−HĐ.
- Coverage asymmetry: rows TT-only = "phát sinh chưa lấy HĐ" (→ feeds mode-1 worklist, v2); HĐ-only = neutral "chưa nhập TT".

### Interaction v1
Search (diacritic-insensitive, itemName+itemCode) · bucket filter chips (+ "có ✎", "ngoài DT") · expand/collapse all · sticky header + sticky grand total · **xuất .xlsx** (new route `app/api/du-an/[id]/can-doi/export/route.ts`, clone SheetJS aoa pattern from `app/api/thanh-toan/tong-hop/export/route.ts` but guard = `requireReleasedModuleRequest("du-an", read, project scope)` NOT admin-only; one sheet, all column groups side by side, category-grouped).
Nice-to-have v2: sort by %/delta, category multi-filter, URL-persisted filters. Skip: column config, saved views, pagination.

### Service changes (lib/du-an/can-doi-service.ts)
1. **Per-stream aggregates — correctness fix**: `vw_project_norm.actual_qty` conflates streams. New groupBy on project_transactions per (categoryId,itemCode): `SUM(COALESCE(qtyHd,qty)) FILTER (WHERE amountHd<>0)` as qty_hd, `SUM(qty) FILTER (WHERE amountTt<>0)` as qty_tt + amount sums per stream. Use `<>0` (negatives aggregate correctly). Bypass view for all qty; keep view (or plain estimate join) as estimate anchor only.
2. Select `unitPrice` (view already exposes) + adjusted totals from `vw_project_estimate_adjusted`.
3. Compute pct/bucket/weighted prices/suppression server-side; extend CanDoiRow/CanDoiSubtotal.

## Sequencing
- **v1**: schema `qtyHd` + migration + form/adapter wiring; service per-stream fix + metrics; collapsible groups + StatCards + worklist + mode switcher (mode 1 complete, modes 2–3 empty-state); search/filters; xlsx export; convention doc update (bucket + ε + qtyHd semantics).
- **v2** (auto-lights as TT entered): modes 2–3 active; "phát sinh chưa lấy HĐ" into worklist; top vượt-giá/vượt-lượng lists.
- **v3** (on demand): per-category PV decomposition report; time-series.

## Risks
- Denominator switch to adjusted estimate: MNTC-GD1 has no COs today → identical numbers; must not regress if CO appears (test with a fake approved CO).
- qtyHd backfill: existing imported rows have qty = invoice SL; migration sets qtyHd = qty for rows with amountHd≠0 (preserves current mode-1 coverage), leaves qty as-is (user corrects when entering actuals). Document.
- ε bucket must match export + StatCards (single source: server).
- Mode-3 qty delta only meaningful after users actually maintain both qty fields — UI must default SL HĐ = SL to keep entry cheap.

## Success metrics
- "Hôm nay đi lấy hóa đơn gì, bao nhiêu tiền" answerable <10s (worklist card).
- Load shows ≤20 visible rows (collapsed).
- Modes 2–3 light up with no code change when TT entered.
- Excel export totals = on-screen totals exactly.

## Decisions log (2026-08-19)
1. Overall design approved as proposed.
2. ε "đủ" = max(1.000đ, 0,5% dự toán dòng).
3. % denominator = dự toán + phát sinh đã duyệt (adjusted view), fallback gốc.
4. Schema: add `ProjectTransaction.qtyHd` (invoice qty separate from real qty).
