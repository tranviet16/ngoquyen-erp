# Audit Phase 1 — table coverage manifest

Ngày audit: 2026-08-20  
Phạm vi: manifest, inventory, live trace và mã nguồn live. Không sửa source/manifest.

## Gate verdict: FAIL

Counts render đã reconcile, và live trace đóng đúng nhiều nguồn raw/server. Tuy nhiên chưa đạt điều kiện “không còn unknown” vì:

1. Inventory vẫn giữ nhiều nhãn `NV` cùng tuyên bố “chưa xác minh loader/service”, trái với checkbox đã đóng trong manifest.
2. Claim mọi DataGrid nhận full array chưa được trace upstream theo từng occurrence. Không có pagination prop trong DataGrid không chứng minh loader không có `take`/`limit`.
3. Claim 100% computed/select/FK có semantic source hoặc exclusion chưa có mapping column-level cho 25 DataGrid; inventory vẫn ghi `conditional` cho từng nhóm caller.

## Findings

### Major — Tài liệu hợp thành manifest vẫn còn `NV`/unknown

- Manifest claim: `reports/table-coverage-manifest.md:3,66` nói inventory + live trace là một phần manifest và “không còn `NV`/`unknown`”.
- Evidence: `research/table-inventory.md:66-72,79` vẫn chứa `CF/NV`, `NV`, `fetched client/NV`; dòng `93` còn ghi rõ loader/service của các mục `NV` chưa được xác minh.
- Live trace có bằng chứng đóng các mục này tại `scout/manifest-trace.md:33-70`, nhưng inventory chưa được reconcile. Vì manifest định nghĩa cả hai tài liệu là contract hợp thành, trạng thái hiện tại tự mâu thuẫn.
- Correction: cập nhật từng row inventory từ `NV` sang `CF`, `RP`, `server-limited` hoặc `SV` dựa trên exact evidence trong trace; bỏ/viết lại dòng 93. Sau đó whole-plan grep `\bNV\b|unknown|chưa xác minh` và chỉ cho phép từ ngữ lịch sử “former NV”, không cho phép marker trạng thái mở.

### Major — Full-set premise của DataGrid chưa được chứng minh occurrence-level

- Manifest claim: `table-coverage-manifest.md:36` nói 25 DataGrid renders nhận caller-provided full array; dòng `64` đánh dấu 100% paginated/limited source có loader và limit.
- Evidence ngược: `table-inventory.md:85` chỉ nói không thấy pagination prop trong DataGrid và cảnh báo điều đó **không chứng minh** mọi caller load toàn bộ DB. `manifest-trace.md:3` mô tả scope trace gồm former-NV HTML, 7 DataTable, expense và coordination; không trace 24 DataGrid production upstreams.
- Tác động: client sort có thể chỉ sort một server-limited slice, vi phạm yêu cầu cốt lõi của plan.
- Correction: thêm bảng 25 occurrence với caller, page/action/service upstream, exact query line, `take/skip/limit` status, default order owner và verdict `full | server-limited | report`. Demo ghi excluded. Bất kỳ source-limited caller nào phải chuyển server strategy hoặc giữ non-sortable trước Phase 4.

### Major — Semantic accessor/exclusion chưa đủ chi tiết để đóng 100%

- Manifest claim: `table-coverage-manifest.md:65` đánh dấu computed/select/FK đã có semantic source hoặc exclusion rõ.
- Evidence: `table-inventory.md:40,44-55` chỉ ghi `conditional` theo nhóm caller; không liệt kê từng column, `kind/options/fk/accessor`, display value hoặc exclusion. Manifest dòng `36` cũng chỉ nêu contract tổng quát.
- Correction: trong occurrence manifest, enumerate từng data column ít nhất bằng `column key → displayed source → comparator/server mapping → sortable/excluded reason`. Không được dùng `conditional` cho gate PASS.

## Spot-check factual claims

| # | Claim | Live evidence | Result |
|---:|---|---|---|
| 1 | DataTable có 8 render / 8 file | Fresh `rg -F '<DataTable'`: đúng 8 site trong 8 file | PASS |
| 2 | 7 enhanced + 1 legacy DataTable | Bảy list caller truyền `resourceSpec`; `project-detail-client.tsx:125-130` truyền full `project.categories`, `page=1`, `pageSize=length`, không có resourceSpec | PASS |
| 3 | Legacy project detail nhận full category array | `project-detail-client.tsx:127-130`; page lấy một project ở `projects/[id]/page.tsx:17-22` | PASS |
| 4 | DataGrid command có 27 match / 25 file | Fresh count trả 27/25 | PASS |
| 5 | Hai match DataGrid dư là generic, không phải render | `ledger-grid/opening-grid.tsx:80` và `transaction-grid.tsx:122` là `useMemo<DataGridColumn...>`; render thật ở `:134` và `:195` | PASS |
| 6 | Có 25 DataGrid render, gồm 24 production + 1 demo | Sau loại hai generic còn 25 JSX render; `app/(app)/__demo/data-grid/page.tsx:97` là demo duy nhất | PASS |
| 7 | Raw `<table>` có 45 occurrence / 38 file | Fresh regex `<table(?:\s|>)` trả 45/38 | PASS |
| 8 | Loại UI primitive còn 44 business / 37 file | `components/ui/table.tsx:13` là match primitive duy nhất | PASS |
| 9 | Department có hai table và nguồn full-set | Tables tại `department-client.tsx:190,253`; `department-service.ts:14-18,52-63` dùng `findMany` không take/skip, order code/name asc | PASS |
| 10 | Import history là latest 50, không phải full-set | `import-engine.ts:162-166`: default limit 50, `orderBy createdAt desc`, `take: limit` | PASS |
| 11 | Import detail errors lấy một record đầy đủ | `import-engine.ts:169-171` dùng `findUnique`; raw table tại `admin/import/[runId]/page.tsx:75` | PASS |
| 12 | Expense raw table là server-paginated với count parity | `journal-service.ts:74-92`: cùng `where`, `findMany`, `skip/take`, `count`, aggregate; order date/createdAt desc | PASS |
| 13 | Coordination list là server page 20 với ACL + count | `coordination-form-service.ts:57-103`: ACL predicates, `skip`, `take: PAGE_SIZE`, matching count; reload giữ cùng ID/order tại `:107-114` | PASS |
| 14 | Round list là full ACL-filtered set | `payment-service.ts:120-142`: `findMany`, ACL department filter, no take/skip, order month/sequence desc | PASS |
| 15 | Round detail lấy complete items và order id asc | `payment-service.ts:145-163`: one round, included items, no take/skip, `orderBy id asc` | PASS |
| 16 | Ba consistency tables dùng complete SQL result | Tables tại `kiem-tra-khop-client.tsx:79,107,135`; `period-recon-check-service.ts:57-96` dùng parameterized FULL OUTER JOIN, không LIMIT, order date/id | PASS |
| 17 | Period-close chỉ truncate violation preview, không truncate delivery table | `chot-ky-client.tsx:142` dùng `violations.slice(0,10)` nhưng `:169` map toàn bộ `preview.deliveries`; service `period-close-service.ts:64-67` không limit | PASS |
| 18 | Cân đối vật tư có ba occurrence và popup slice 50 | Raw tables tại `can-doi-vat-tu-client.tsx:187,641,727`; presentation slice tại `:254` | PASS |
| 19 | SL-DT construction progress là full active-lot set | `report-service.ts:383-411`: `findMany`, no take/skip, deterministic phase/group/sortOrder, filter sau map | PASS |
| 20 | SL-DT payment plan là full active-lot set | `report-service.ts:435-459`; milestone scores `:464-465`; không take/skip | PASS |
| 21 | Reconciliation derivation lấy full period ledger rows | `reconciliation-derive-service.ts:113-121`: period filter, no limit, date/id tie-breaker | PASS |
| 22 | Reconciliation list là full set và signed rows dùng persisted values | `reconciliation-derive-service.ts:262-280`: no limit, periodFrom desc, signed branch đọc stored balances | PASS |
| 23 | Roles là full set với real permission count và derived user count | `role-service.ts:28-53`: role findMany + `_count.permissions`, full `User.groupBy`, order id asc | PASS |
| 24 | Không còn `NV` trong contract hợp thành | Inventory còn `NV` tại `:66-72,79` và disclaimer mở tại `:93` | **FAIL** |
| 25 | Mọi DataGrid source là full set | Không có upstream trace cho 24 production caller; inventory `:85` thừa nhận chưa chứng minh | **FAIL** |
| 26 | Mọi computed/select/FK column có source/exclusion | Inventory chỉ ghi `conditional`, không có column-level mapping | **FAIL** |

## Missing occurrence / count / unknown summary

- Missing render occurrence: **không phát hiện** trong ba grep family; counts reconcile.
- Incorrect count: **không phát hiện**; 27 textual DataGrid matches được giải thích đúng thành 25 render.
- Unknown còn lại: **có** — các marker `NV` stale trong inventory; upstream/full-set status của 24 production DataGrid; semantic mapping/exclusion theo từng DataGrid column.
- Gate Phase 1: **FAIL** cho đến khi ba unknown trên được đóng bằng live evidence và reviewer recheck.

**Status:** DONE_WITH_CONCERNS  
**Summary:** Spot-check 26 claim: 23 PASS, 3 FAIL; counts đúng nhưng occurrence contract chưa hết unknown.  
**Concerns/Blockers:** Không mở Phase 2/implementation khi inventory còn `NV`, DataGrid upstream chưa trace và column semantic mapping còn `conditional`.

---

## Re-audit sau gap closure — 2026-08-20

### Gate verdict mới: PASS

Lượt này supersede verdict FAIL phía trên. Ba blocker cũ đã được đóng:

- Inventory không còn marker trạng thái `NV`, `unknown`, `chưa xác minh` hoặc `conditional`.
- Appendix có đúng 24 row production DataGrid và cover đúng 24 live render path sau khi loại demo và hai generic-type matches.
- Mỗi row appendix liệt kê đầy đủ mọi column ID trong range khai báo được trích, với semantic class/accessor; automated comparison tìm thấy **0 missing column ID trên cả 24 row**.

Một lỗi citation Minor còn lại không tạo unknown về scope: demo render live nằm tại `app/(app)/__demo/data-grid/page.tsx:97`, trong khi inventory `:54` và trace `:74` ghi `:47`. Cần sửa citation thành `:97`, nhưng demo đã được định danh/exclude đúng và count không đổi.

### Fresh verification

| # | Claim re-audit | Live evidence | Result |
|---:|---|---|---|
| 1 | DataTable population vẫn là 8/8 | Fresh count: 8 textual/render matches, 8 files | PASS |
| 2 | DataGrid population vẫn là 27 textual / 25 files | Fresh count: 27/25 | PASS |
| 3 | Raw table population vẫn là 45/38 | Fresh count: 45/38; primitive exclusion vẫn cho 44/37 | PASS |
| 4 | Production DataGrid render set có đúng 24 | Lọc hai `DataGridColumn` generic matches và `__demo` khỏi fresh grep còn đúng 24 | PASS |
| 5 | Appendix có đúng một row cho mỗi production render | 24 live render paths đều xuất hiện trong trace; appendix có đúng 24 rows | PASS |
| 6 | Không còn marker trạng thái mở | Clean grep `\bNV\b|\bunknown\b|chưa xác minh|\bconditional\b` trên inventory/trace/manifest trả zero match | PASS |
| 7 | Column mapping exhaustive cho row 1 ledger transaction grid | Range `ledger-grid/transaction-grid.tsx:124-140` có 16 IDs; cả 16 có mapping, zero missing | PASS |
| 8 | Column mapping exhaustive cho row 2 opening grid | Range `ledger-grid/opening-grid.tsx:83-89` có 7 IDs; zero missing | PASS |
| 9 | Column mapping exhaustive cho dormant row 3 | Range `ledger/transaction-grid.tsx:160-180` có 14 IDs; zero missing | PASS |
| 10 | Dormant/export-only classification là thật | Whole-app `rg TransactionGrid` chỉ thấy definition `components/ledger/transaction-grid.tsx:101` và re-export `components/cong-no-vt/transaction-grid.tsx:7`; không có render caller | PASS |
| 11 | Ledger transaction renderer là capped dataset | `ledger-service.ts:68-78` dùng `skip/take pageSize` + count; traced callers request 200 và grid không có pager | PASS |
| 12 | Ledger opening grid là full set | `ledger-service.ts:279-287` dùng `findMany`, no take/skip, default `entityId asc, partyId asc` | PASS |
| 13 | Delivery grid là full set | `delivery-service.ts:10-21` dùng `findMany`, no take/skip, `date desc,id desc` | PASS |
| 14 | Journal grid là capped 200 | `tai-chinh/nhat-ky/page.tsx:9-13` gọi `listJournalEntries({pageSize:200})`; service `:74-86` dùng skip/take + count | PASS |
| 15 | Expense classification grid là capped 2000 | `expense-classification-service.ts:39-55` có `take:2000`, `date desc,id desc`, không pager/count contract | PASS |
| 16 | Obligation transaction grid là full set | `state-obligation-service.ts:136-145`: no take/skip, `date desc,id desc`, real type/cashAccount includes | PASS |
| 17 | Obligation type grid là full set | `state-obligation-service.ts:62-67`: no limit, `category asc,sortOrder asc` | PASS |
| 18 | Loan schedule là one parent/full child | `loan-service.ts:110-115`: one loan; full non-deleted payments relation ordered `dueDate asc` | PASS |
| 19 | Monthly supplier grid là full aggregate | `delivery-service.ts:24-35`: parameterized view query, no LIMIT, `month desc,item_id asc` | PASS |
| 20 | Cashflow grid là full project set | `cashflow-service.ts:9-14`: scoped `findMany`, no limit, `date desc,id desc` | PASS |
| 21 | Project transaction grid là full project set | `transaction-service.ts:10-15`: scoped `findMany`, no limit, `date desc,id desc` | PASS |
| 22 | Project schedule grid là full project set | `schedule-service.ts:9-14`: no limit, `categoryId asc,planStart asc` | PASS |
| 23 | Acceptance grid là full project set | `acceptance-service.ts:9-17`: no limit, `categoryId asc,planEnd asc` | PASS |
| 24 | Contract grid là full project set | `contract-service.ts:8-13`: no limit, `signedDate desc` | PASS |
| 25 | Change-order grid là full project set | `change-order-service.ts:9-14`: no limit, `date desc,coCode asc` | PASS |
| 26 | All 24 column mappings cover declared IDs | Automated range extraction counts per row: `16,7,14,11,9,8,6,9,6,4,11,8,16,9,6,11,9,8,16,3,17,14,9,8`; every row reports `missing=0` | PASS |
| 27 | Closure math is internally consistent | 19 full/aggregate + 1 single/full-child + 3 limited + 1 dormant = 24 | PASS |
| 28 | Demo citation line is exact | Live render is `__demo/data-grid/page.tsx:97`; inventory/trace cite `:47` | **MINOR FAIL** |

### Re-audit conclusion

- Missing occurrence: none.
- Incorrect family/count: none.
- Unresolved/unknown: none.
- Fixed-limit risk is no longer hidden: rows 1, 5 and 15 are explicitly LIMITED-200/200/2000 and Phase 4 must not describe their client sort as global database sorting.
- Gate Phase 1: **PASS**. Minor demo line citation should be corrected opportunistically before final documentation audit.

**Status:** DONE_WITH_CONCERNS  
**Summary:** Re-audit 28 claim: 27 PASS, 1 Minor citation failure; all previous Major blockers are closed and Phase 1 gate passes.  
**Concerns/Blockers:** No blocker. Correct demo citation `:47` → `:97`; preserve limited-set semantics for three capped DataGrid callers.
