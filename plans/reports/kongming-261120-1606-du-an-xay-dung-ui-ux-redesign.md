# Dự án xây dựng — UI/UX redesign counsel (focus: Đối chiếu DT-HĐ-TT)

Date: 2026-11-20. Advisory only; no code was changed. Code was read from the worktree `.claude/worktrees/du-an-danh-muc-hop-dong-d92348` (paths below are relative to it).

## TL;DR

Restructure DT-HĐ-TT around a "Tổng quan" page that lists what still needs doing and links to the place that fixes it, and give the three reports a separate on-screen layout while the current report components stay untouched as the print output. Regroup the project shell's 14 tabs into 7 groups without changing any URL. No schema change is needed, and the report engine, ACL and Excel export are not touched.

The finding that shapes the design: the ✓/✗ lines are mostly checks the engine cannot fail on user data, so they are not the user's to-do list. The real to-do list (chưa gán, thiếu hệ số, chưa chốt thực tế, chưa gắn đầu mối) is scattered across the screens as plain text with no links.

## What I could and could not verify

- Verified by reading code: everything cited with a file and line.
- Not verified: I did not run the app or see a rendered page, so layout widths are estimates. The Next.js guides in `node_modules` were blocked by a repo hook, so I recommend only navigation APIs this repo already uses (`useSelectedLayoutSegment` in `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx:30`).
- Row count: from your volumes I count roughly 700–800 table rows on DT-HĐ (at most 362 DT lines, 280 invoice rows, 91 group rows, plus block totals), a little under your "thousand+". The conclusion is the same.

## 1. Diagnosis

### Workflow problems (ranked)

1. **Reports are dead ends.** Every warning is plain text with no link to where it is fixed. The only link on any report is the settings banner (`report-bits.tsx:57`).

   | Warning on screen | Where | Where it is fixed |
   |---|---|---|
   | "Ngoài DT / chưa gán" | `dt-hd-view.tsx:127` | Ánh xạ, tab Hóa đơn |
   | "thiếu hệ số" | `dt-hd-view.tsx:29`, `dt-tt-view.tsx:39` | Ánh xạ (Hệ số) |
   | "chưa chốt thực tế" / "chưa chốt" | `dt-hd-view.tsx:52`, `dt-tt-view.tsx:71` | Đầu mối (Nguồn thực tế, Số chốt tay) |
   | "Thực tế nhập chưa gắn đầu mối" | `dt-tt-view.tsx:108` | Thực tế nhập |
   | "dự toán chưa xác định loại VL / NC / MTC" | `dt-tt-view.tsx:139` | Ánh xạ, tab Dự toán (Loại) |
   | "không thuộc đầu mối", "(tạm = HĐ)" | `hd-tt-view.tsx:15,29` | Đầu mối (NCC của đầu mối) |

2. **Kế toán reads on one page and types on another.** H, S, X and Z are read on HĐ-TT but edited in the second grid of the Đầu mối page, below a 420 px grid (`dau-moi/page.tsx:42-53`, `dau-moi-suppliers.tsx:110-124`). The page is filed under a register name, so the main review task is hidden.

3. **There is no landing page.** The index redirects to DT-HĐ (`dt-hd-tt/page.tsx:5`), the longest page in the module. The count of chưa gán is only visible after opening Hóa đơn, Thực tế nhập or Ánh xạ.

4. **✓/✗ lines are noise, and ✗ gives no guidance.** The DT-HĐ block check is an identity: every invoice of the đầu mối falls in exactly one of the three summed buckets (`dt-hd-report.ts:162-164,176`), and a stale Dòng DT falls back to its group or to chưa gán instead of being dropped (`book-index.ts:74-84`). The page still prints one green line per block. The checks a user can break are on HĐ-TT (for example, S typed on every NCC of a đầu mối so the parts no longer sum to its thực tế, `hd-tt-report.ts:90-97,136-141`), and the user guide only says "xem số Δ" (`doi-chieu-dt-hd-tt.md:97`).

5. **Phần B mixes a decision with a backlog.** "Ngoài DT" (decided) and "chưa gán" (work to do) share one tag (`dt-hd-view.tsx:127`). The engine knows which is which (`book-index.ts:16`) but the report row does not carry it.

6. **Ánh xạ is slow for its volume (716 aliases).** The filter opens on "Tất cả" (`anh-xa-client.tsx:40`). Dòng DT is a native select over up to 362 lines with no search (`anh-xa-editor.tsx:145-148`). The editor does not show the source lines (NCC, số HĐ, SL, đơn giá) needed to pick a line or a hệ số. Saving does not move to the next key. The page accepts only `?tab=` (`anh-xa/page.tsx:32`), so nothing can link to "chưa gán của tab Hóa đơn".

7. **Entry books cannot be filtered.** No column sets `filterable` (`hoa-don-client.tsx:109-122`), so 280 lines cannot be narrowed to one NCC, one số HĐ or the chưa gán rows. NCC is a native select over every active supplier (`hoa-don-client.tsx:201-204`). The grid has no initial-filter input (`components/data-grid/use-grid-view.ts:24`), so no number elsewhere can link to its lines.

### Screen-reading problems (ranked)

1. **DT-HĐ is one fully expanded page.** Every block, group, DT line and invoice row is rendered (`dt-hd-view.tsx:111-113`), with no collapse, filter or sticky header. The header cannot stick today because each table sits in an `overflow-x-auto` wrapper (`report-bits.tsx:30`).
2. **The most important numbers per đầu mối are the least readable.** They are a muted `text-xs` sentence of up to eight figures joined by "·" (`dt-hd-view.tsx:48-59`).
3. **HĐ-TT has 17 columns and no anchor.** Two name columns, 13 money columns, a ratio and a note, with labels like "I. Đã trả (H, chưa rà soát thì G)" (`export-sheet-hd-tt.ts:8-22`). No sticky first column. Markers "(H)", "(tạm = HĐ)", "(tách)" are appended inside right-aligned number cells (`hd-tt-view.tsx:19-30`).
4. **The shell shows no position.** All 14 tabs share one constant class and no `aria-current` (`layout.tsx:85-91`), in a horizontally scrolling row (`layout.tsx:82-83`). At about 110 px per tab the last tabs are likely off-screen on a 1366 px display (estimate). The sub-nav is nine equal pills mixing reports, books and registers (`dt-hd-tt-sub-nav.tsx:11-21`).
5. **Status is plain text.** "Vượt", "Còn thiếu" and "Đủ" look the same, and the group summary prints zeros: "0 thiếu | 0 vượt | 3 đủ | …" (`dt-hd-status.ts:46-54`).
6. **DT-TT is three stacked tables with no way to jump between Phần I, II and III** (`dt-tt-view.tsx:146-153`).
7. **Grids have fixed heights** (560, 420, 480 px) regardless of the window.

## 2. Information architecture

### Project shell: 14 tabs into 7 groups, URLs unchanged

Replace the tab row with a small client component that derives the active group and tab from the layout segment. No route moves, so links, bookmarks and breadcrumbs keep working.

| Group (first row) | Tabs (second row) |
|---|---|
| Tổng quan | (Dashboard) |
| Tiến độ & nghiệm thu | Tiến độ, Nghiệm thu |
| Dự toán | Dự toán, DT điều chỉnh, Phát sinh (CO) |
| Đối chiếu DT-HĐ-TT | its own grouped sub-nav (below) |
| Vật tư & công nợ | Giao dịch, Cân đối VT, Định mức, Công nợ NCC |
| Hợp đồng & dòng tiền | Hợp đồng, Dòng tiền 3 bên |
| Cài đặt | — |

The second row for DT-HĐ-TT is its existing sub-nav, so navigation never exceeds two rows. The four old tabs fed by the invoice book sit together and stay visible (decision 4). On a project that has the book, give that group a one-line note: "Hóa đơn ở các tab này lấy từ sổ Hóa đơn".

### DT-HĐ-TT: 9 pills into Tổng quan plus three labelled groups

- **Tổng quan** (new, replaces the redirect)
- **Báo cáo:** DT-HĐ, DT-TT, HĐ-TT
- **Nhập sổ:** Hóa đơn, Thực tế nhập, Chi thực tế
- **Thiết lập:** Ánh xạ (with the chưa gán count as a badge), Đầu mối, Mã nhóm

### What Tổng quan shows, top to bottom

Everything here comes from data the report pages already load (`report-service.ts:17`, `alias-service` board). Rule: every figure on this page is an existing report cell with a link to it. Do not compute new totals, because DT, HĐ and TT sit on different VAT bases.

1. **Số chính:** HĐ-TT totals E, I, T, V, Y, and the Phần III total row (dự toán against thực tế). Each links to its report.
2. **Việc cần làm:** one row per queue with count, amount and a link. Rows with zero are hidden.
   - Tên chưa gán, per source (Hóa đơn, Thực tế nhập, Dự toán) → Ánh xạ, filtered
   - Đề xuất chờ xác nhận → Ánh xạ, filtered
   - Dòng dự toán "Chưa kết luận (thiếu hệ số)" → DT-HĐ, filtered
   - Thực tế nhập chưa gắn đầu mối → Thực tế nhập, filtered
   - Đầu mối chưa chốt thực tế → Đầu mối
   - NCC có hóa đơn nhưng chưa thuộc đầu mối → Đầu mối
   - Dự toán chưa xác định loại; chưa cài đặt tỷ lệ → Ánh xạ tab Dự toán; Cài đặt
   - Việc cần làm của kế toán: the Z notes, listed per NCC → HĐ-TT
3. **Kiểm tổng:** one line, "7/7 khớp", expandable to the list. A ✗ shows Δ and the screen where that check can be fixed.
4. **In / Xuất Excel** shortcuts for the three reports.

## 3. Report screens: interaction patterns

### How to keep print identical

"In" is the browser printing the page (`app/globals.css:273-290`), so any on-screen collapse or filter would change the paper. Excel is safe: it is built from the report object by a separate route (`export-sheets.ts:33`).

Recommended for DT-HĐ and HĐ-TT: keep today's `DtHdView` and `HdTtView` unchanged and render them only for print (`hidden print:block`). Build the on-screen layout as a second component over the same report object (`print:hidden`). Print is then identical by construction, and figures cannot diverge because both read one object. The cost is that DT-HĐ's HTML roughly doubles; measure it on project 4 before committing. DT-TT is small, so screen-only additions in place are enough.

### DT-HĐ on screen

- **Summary table first:** one row per đầu mối with labelled columns — Dự toán, HĐ do NCC xuất, Trong nhóm của mình, Ngoài dự toán, Ở nhóm khối khác, Thực tế chưa VAT, Còn phải lấy HĐ, and status counts. This replaces the "·" sentence.
- **Expand a row** to see its groups; expand a group to see DT lines. Invoice rows ("↳") are behind one page-level switch, "Hiện dòng hóa đơn", off by default.
- **Filters:** Còn thiếu, Vượt, Chưa có HĐ, Thiếu hệ số, one đầu mối, and a name search. A filter opens the matching blocks and hides the rest. Keep the open đầu mối in the URL so Tổng quan can link to it.
- **Sticky column header** against the page scroll; drop the horizontal-scroll wrapper on this screen layout (ten columns fit a desktop width).
- **Phần B in two lists:** "Chưa gán" with a "Gán" link per name, and "Ngoài DT". This needs the reason on the report row: an additive field on `DtHdInvoiceRow`, no figure changes.
- **Status as badges** with text plus colour; hide zero counts.

### HĐ-TT on screen

- **Two-row header** grouping the 13 money columns: Hóa đơn | Thanh toán | Thực tế | Lấy về. Use plain names with the letter kept as a small code, for example "HĐ gồm VAT · E", because the team and the user guide speak in letters. Put the formula in a tooltip.
- **Do not edit `HD_TT_MONEY_COLS` labels.** They are also the Excel header (`export-sheet-hd-tt.ts:24`) and are asserted by a test (`export-sheets.test.ts:58`). Add a separate screen label map keyed by the same keys.
- **Sticky NCC column, sticky header, sticky total row;** rows grouped under their đầu mối.
- **Edit H, S, X, Z in place** for users with `edit`, calling the existing `updateCounterpartySupplier` action. ACL is unchanged because the server action already enforces it.
- **Markers as badges** beside the number, not text inside it.
- **Filters:** Cần nộp thêm, Nộp vượt, Còn phải lấy về, Tạm = HĐ, Không thuộc đầu mối, Có việc cần làm.
- **Number → lines:** E opens Hóa đơn filtered to that NCC; G opens Chi thực tế filtered to that NCC. This needs `filterable` columns and an initial-filter prop on the shared grid.

### DT-TT on screen

Add a sticky "Phần I · II · III" jump bar, make Phần I groups collapsible, and turn "chưa chốt" and the two warning lines into links.

## 4. Approaches

| | A. Polish in place | B. Tổng quan + drill-down (recommended) | C. B plus merging the old tabs |
|---|---|---|---|
| What | Active tabs, grouped sub-nav, sticky headers, badges, links on warnings; one DOM for screen and print | A, plus Tổng quan, separate screen layouts, HĐ-TT in-place edit, filterable books, faster Ánh xạ, shell regrouped without URL changes | B, plus folding Cân đối VT / Định mức / Giao dịch / Công nợ into the new screens and rebuilding the dashboard |
| Depends most on | The pain being readability only | Users working from a to-do list rather than from sheet order | The old tabs being redundant |
| Fails first when | The đội still asks "what do I do next" | Users open reports by habit and see Tổng quan as an extra click | A project without the book needs the old tabs |
| Effort (rough) | 3–4 days | 10–11 days | 15–20 days |
| Worst plausible case | A screen tweak silently changes the A4 print | Screen and print look different enough that users distrust the screen; HTML size grows | Reopens decision 4 and breaks projects that never imported a workbook |

**Recommendation: B.** A leaves the two largest workflow problems (dead ends, no landing) in place and carries the highest print risk because screen and print share markup. C is not justified while, as far as I can tell, one project uses the book.

### Increments, each shippable alone

1. **Shell and sub-nav (about 1 day).** Active state, 7 groups, grouped sub-nav. Pass `?tab=` on the two existing links into Ánh xạ.
2. **Tổng quan and links (about 2 days).** The page above; warnings on the three reports become links; Ánh xạ accepts `?tab=&status=&q=`.
3. **DT-HĐ screen layout (about 2.5 days).** Summary table, expand, filters, sticky header, Phần B split; current view kept for print.
4. **HĐ-TT and DT-TT screen layouts (about 2.5 days).** Grouped header, sticky column, in-place H/S/X/Z, filters; DT-TT jump bar.
5. **Books and Ánh xạ (2–3 days).** Grid filters with initial filter from the URL, searchable NCC and Dòng DT pickers, source lines in the editor, "Lưu và sang dòng kế". NCC quick-create stays admin-only, as the provider already enforces.

### What to avoid

- Do not put screen-only state into the print markup; that is how print drifts.
- Do not virtualise the report tables; 800 server-rendered rows are fine once collapsed.
- Do not rename or hide the old tabs per project in this work; it reopens decision 4.
- Do not turn the entry books into forms or wizards; the grid matches the team's Excel habit.

## Work checklist

- [ ] Before increment 3, save baselines on project 4: "In → PDF" of the three reports and the three Excel exports.
- [ ] Add a static-markup snapshot test of `DtHdView`, `DtTtView`, `HdTtView` on the existing fixture, so print markup cannot change unnoticed.
- [ ] After each increment, re-print and compare text against the baseline; run `npm test` (engine and export golden tests).
- [ ] Measure DT-HĐ HTML size with both layouts before merging increment 3.
- [ ] Update `docs/user-guide/doi-chieu-dt-hd-tt.md` when Tổng quan and in-place H/S/X/Z ship.

## Success metrics

- Print PDF text and Excel exports are identical to the baselines after every increment.
- From Tổng quan, each to-do item reaches its fix screen in one click, already filtered.
- DT-HĐ opens showing one row per đầu mối, with no page scroll needed to see all of them.
- Kế toán can type H, X and Z without leaving HĐ-TT.
- The active tab and group are visible on every project page, with no horizontal scroll at 1366 px.

## 5. Data and consistency follow-ups (not redesign scope)

1. **Dashboard "Thực tế (đã nhập)" is wrong on a book project.** It sums `ProjectTransaction.amountTt` (`dashboard-service.ts:34-37`), and transactions derived from the invoice book carry no thực tế amount (`derive-transactions.ts:3`). The card then shows about zero with "Biến động −100 %" in the green success tone (`du-an/[id]/page.tsx:56-59,80-85`).
2. **Two different "dự toán" totals.** The dashboard labels the sum of estimate lines "Tổng dự toán" (`page.tsx:73`), while Phần III's tổng dự toán adds the percentage costs. The same module shows two numbers under one name.
3. **Contract warning text hardcodes "trong 90 ngày"** (`page.tsx:113`) although the window is configurable and already returned as `warningDays` (`dashboard-service.ts:14,76`).
4. **Cân đối VT shows a "Thực tế đã nhập" card that is knowingly 0** on book projects (`can-doi-vat-tu-client.tsx:732`; user guide section 6).
5. **Two công nợ figures per NCC.** Công nợ NCC sums only "lấy hàng" transactions (user guide section 6), HĐ-TT column V is the book's nợ thực tế. Neither screen points to the other.
6. **Ánh xạ links open the wrong tab.** Thực tế nhập links to Ánh xạ without `?tab=tt` (`thuc-te-nhap-client.tsx:166`), and the page then opens Hóa đơn if it has unmapped keys (`anh-xa/page.tsx:34-35`). Fixed in increment 1.
7. **To confirm by test, read from code only:** an NCC with S typed but no đầu mối gets T = S (`hd-tt-report.ts:90-91`), which is not in the expected side of the Σ T check (`:130-140`), so the check turns ✗ with no explanation.

## Assumptions

| Assumption | Confidence | What would change the advice |
|---|---|---|
| Only MNTC-GD1 uses the book today | Medium | If most projects will, plan C's merge of the old tabs as a later project |
| Kế toán wants to type H/X/Z on HĐ-TT | Medium | If they prefer a separate entry page, keep Đầu mối as is and only add links |
| Print should always be the full report, never the filtered view | High | If filtered print is wanted, it must be an explicit second button |
| Desktop width of 1366 px or more | High | Narrower screens need a horizontal scroll on DT-HĐ |
| Doubling DT-HĐ HTML is acceptable on the office network | Medium | If not, use one markup with screen-only CSS classes and accept more print testing |

## 6. Unresolved questions for the product owner

1. How many projects will use the DT-HĐ-TT book in the next year? This decides whether the old tabs are ever merged.
2. Should kế toán edit H, S, X and Z directly on HĐ-TT, or keep entry on the Đầu mối page?
3. Which headline figures belong on Tổng quan, and on which VAT basis should DT, HĐ and TT be compared?
4. Keep Excel letter codes next to plain column names permanently, or drop them once users are used to the names?
5. Should DT-HĐ-TT open on Tổng quan for everyone, or on the last report the user viewed?
6. Who confirms Ánh xạ "đề xuất": the đội or kế toán?
7. Should the project dashboard read the book on projects that have one (follow-up 1), and with what priority?
