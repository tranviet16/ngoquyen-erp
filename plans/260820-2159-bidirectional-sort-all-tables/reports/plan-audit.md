# Audit đối kháng kế hoạch sort ba trạng thái

Ngày audit: 2026-08-20  
Phạm vi: `plan.md`, 8 phase, brainstorm và mã nguồn live. Không sửa plan/source.

## Kết luận

Kế hoạch có cấu trúc đầy đủ, dependency hợp lệ và phần lớn premise kỹ thuật khớp code. Tuy nhiên có **1 Major** về số lượng DataGrid production và **2 Minor** cần làm rõ trước khi duyệt. Không có Critical.

## Findings

### Major — Count DataGrid production sai 1 occurrence

- Plan claim: `phase-04-datagrid.md:20`, `:44`, `:59` ghi **25 production DataGrid instances** và đồng thời `:45` loại demo khỏi production acceptance.
- Live evidence: grep `<DataGrid\b` trong `app/**/*.tsx` + `components/**/*.tsx` cho **25 occurrence/25 file tổng cộng**, trong đó `app/(app)/__demo/data-grid/page.tsx:97` là một occurrence. Vì vậy tập production hiện chỉ có **24**, trừ khi manifest tìm ra một caller production bị grep bỏ sót.
- Tác động: gate `25/25` không thể vừa loại demo vừa reconcile với live tree; dễ che một missing/extra row trong manifest.
- Sửa chính xác: đổi Phase 4 thành `24 production + 1 demo excluded`, hoặc Phase 1 phải nêu pattern bổ sung và chỉ ra caller production thứ 25 bằng `file:line`; không giữ số 25 như hằng số trước gate live.

### Minor — Quality-gate command chưa gọi đúng script integration/E2E của project

- Plan claim: `plan.md:48` và `phase-08-final-coverage-a11y-v-docs.md:55` liệt kê unit/integration/UI/Playwright nhưng chỉ ghi chính xác `pnpm test`; phần integration/Playwright là mô tả chung.
- Live evidence: `package.json` định nghĩa `test = vitest run --project unit`, `test:integration = vitest run --project integration`, `test:e2e = playwright test`, cùng `lint` và `build`. Vì vậy `pnpm test` chỉ chạy unit.
- Sửa chính xác: Phase 8 ghi `pnpm test`, `pnpm test:integration`, `pnpm test:e2e -- <selected spec/options>`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`. Nếu integration cần service/DB, ghi prerequisite hoặc điều kiện “applicable” cụ thể.

### Minor — Contract trạng thái “default” chưa chốt semantics ARIA khi defaultSort có hướng

- Plan claim: `phase-02-shared-contract-v-characterization-tdd.md:31-35` tạo state `default | asc | desc` và header `aria-sort`; `phase-03-datatable-server-v-legacy.md:25`, `:31` yêu cầu header phản ánh effective default nhưng vẫn coi default là state riêng.
- Live evidence: `components/data-grid/use-grid-view.ts:25-33` hiện biểu diễn default bằng `null` và cycle `null → asc → desc → null`; `lib/table/derive-spec.ts:153-154` cho phép `defaultSort` có direction thực. Nếu defaultSort là `asc`/`desc`, “effective order” và “user state” không đồng nhất.
- Tác động: implementer có thể gán `aria-sort="ascending"` ở default, làm chu kỳ nhìn như asc hai lần, hoặc gán `none` nhưng indicator lại mô tả sai thứ tự thực.
- Sửa chính xác: ghi rõ contract: state default dùng `aria-sort="none"` và label/tooltip riêng “Thứ tự mặc định” (dù server order có direction), hay dùng effective direction; thêm fixture cho cả defaultSort asc và desc.

## Spot-check đã xác minh (20 claim)

1. `plan.md` có 53 dòng, đạt yêu cầu dưới 80 dòng.
2. Cả 8 phase đều có Context Links, Overview, Key Insights, Requirements, Architecture, Related Code Files, Implementation Steps, Todo, Success Criteria, Risk, Security và Next Steps; không thiếu section bắt buộc.
3. Dependency không có cycle: 1→2→{3,4}→5→6→7→8; câu `plan.md:40` được bảo đảm bắc cầu vì Phase 2 phụ thuộc Phase 1.
4. `plan.md:34` ghi Phase 8 phụ thuộc 3–7; frontmatter Phase 8 dòng 7 liệt kê đúng `[3,4,5,6,7]`.
5. DataTable count đúng: live grep có 8 occurrence trong 8 file.
6. Tám caller DataTable là loan, dự án list, contractor, entity, supplier, item, project list và project detail; khớp phân rã `7 enhanced + 1 legacy` ở `phase-03:20` ở mức count, nhưng ownership từng caller vẫn phải được manifest chứng minh.
7. Raw HTML count đúng sau loại primitive: live grep có 45 `<table>` trong 38 file; `components/ui/table.tsx:13` là primitive, còn 44 business occurrence trong 37 file, khớp brainstorm `:31`.
8. Primitive `<Table>` cần được grep riêng như Phase 1 `:50`; live tree hiện chỉ có một primitive wrapper, không xuất hiện thêm caller JSX ngoài inventory raw đã đếm.
9. `can-doi-vat-tu-client.tsx` thực có ba raw tables tại dòng 187, 641, 727, khớp Phase 1 `:51` và Phase 7 `:47`.
10. `kiem-tra-khop-client.tsx` thực có ba tables tại dòng 79, 107, 135; nested-state isolation là yêu cầu có căn cứ.
11. `department-client.tsx` thực có hai tables tại dòng 190 và 253; Phase 7 không được đánh dấu PASS theo file-level.
12. UI/spec mismatch là thật: `lib/table/derive-spec.ts:112` dùng `col.sortable ?? defaultOn`, trong khi `components/data-table/table-shell.tsx` chỉ render sort affordance theo truthiness của `column.sortable`; Phase 3 `:24` nêu đúng root mismatch.
13. Existing DataGrid cycle là thật: `components/data-grid/use-grid-view.ts:25-33` dùng `SortState | null` và cycle null/asc/desc/null; Phase 2 không bịa premise duplicate-cycle.
14. Null-last-desc bug là thật: `components/data-grid/apply-filter-sort.ts` xử lý null trong comparator rồi nhân kết quả với direction ở nhánh trả về; desc đảo null-last thành null-first. Phase 2 `:26` và Phase 4 `:25` đúng.
15. `buildOrderBy` hiện chỉ tạo primary Prisma order và không tự nối secondary tie-breaker; Phase 3 `:26`, `:33` đúng khi yêu cầu thêm stable order. Khi triển khai phải whole-repo grep caller trước nếu đổi signature.
16. `ExpenseFilterClient` là raw table ở `components/tai-chinh/expense-filter-client.tsx:181` và có page/pageSize/total contract; Phase 5 `:26`, `:44` đúng khi cấm client-sort page slice.
17. Coordination list là raw table ở `app/(app)/van-hanh/phieu-phoi-hop/list-client.tsx:127` và có pagination state/total; Phase 5 `:26`, `:44` đúng khi xếp server candidate.
18. Matrix representatives tồn tại đúng path: `components/ledger/debt-matrix.tsx:77` là HTML matrix; `components/tai-chinh/obligation-period-matrix-client.tsx:177` là DataGrid matrix. Phase 7 phân biệt DOM/canvas là hợp lý.
19. Các API/file mới ở Phase 2 (`sort-state.ts`, `semantic-compare.ts`, `sortable-header-button.tsx`) được ghi rõ **Create**, không bị trình bày như API hiện hữu. Các symbol hiện hữu `useGridView`, `applySort`, `deriveResourceSpec`, `buildOrderBy` đều có trong live source.
20. Không có load/stress/benchmark test được yêu cầu: `plan.md:49`, Phase 6 `:82`, Phase 8 `:35`, `:79` đều cấm; dù `package.json` có `test:perf` và `test:load`, plan không gọi chúng.

## Completeness/dependency verdict

- Phase 1 là coverage blocker thật, Phase 2 là characterization blocker; các phase family đều phụ thuộc trực tiếp hoặc bắc cầu đúng.
- Server-paginated raw tables, grouped/tree và matrix đều có representative path, invariant và test gate riêng.
- Không phát hiện fabricated existing API, schema migration ngoài scope, universal renderer rewrite hoặc prohibited load test.
- Sau khi sửa count DataGrid và làm rõ hai Minor trên, plan đủ điều kiện chuyển sang review/approval; Phase 1 vẫn phải tạo manifest live trước mọi migration như đã ghi.

**Status:** DONE_WITH_CONCERNS  
**Summary:** Audit 20 claim; 1 Major, 2 Minor, 0 Critical.  
**Concerns/Blockers:** Major DataGrid count phải được sửa hoặc chứng minh caller production thứ 25 trước khi dùng gate 25/25.
