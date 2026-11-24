# Kiểm toán độ phủ test — Dự án xây dựng UI/UX redesign (PR #25–#33)

**Ngày:** 2026-11-24. **Mã kiểm:** `origin/main` df346fa, so với 420047c (main trước stack). Chỉ tư vấn, không sửa mã.

## Kết luận ngắn

- **Unit test: CÓ thiết kế, CÓ chạy.** 30 file unit (29 mới, 1 sửa), khoảng 240 ca; chạy trên máy (1689 passed / 19 skipped) và trong CI job `baseline` ở cả 9 PR.
- **Integration: CÓ, nhưng mỏng và chỉ chạy trong CI.** Thêm 1 ca vào 1 file có sẵn. Chưa chạy được trên máy này (không có test DB).
- **E2E (Playwright spec trong CI): CHƯA.** Redesign không thêm, không sửa spec nào trong `e2e/`. Job e2e của CI không chạy ở bất kỳ PR nào trong 9 PR.
- Phần "kiểm trên trình duyệt" đã làm là **script đo chạy tay** và **một phiên thủ công**; đó là bằng chứng nghiệm thu một lần, không phải lưới chống hồi quy.

## 1. Kiểm kê theo phase

| Phase | Unit test (file → hành vi được ghim) | Integration | E2E spec | Chạy trong CI? |
|---|---|---|---|---|
| 1 | `test/unit/dt-hd-tt-print-views.test.ts` (7) + snapshot 4802 dòng → bản in và sheet Excel của 3 báo cáo; `test/unit/dt-hd-tt-baseline-guards.test.ts` (4) → script từ chối host không phải loopback | – | – | Unit: có |
| 2 | `book-presence.test.ts` (3), `test/unit/legacy-import-guard.test.ts` (5) → một định nghĩa "công trình dùng sổ"; `test/unit/project-nav.test.ts` (7) → 7 nhóm, trạng thái active; `alias-status.test.ts` (6), `test/unit/dt-hd-tt-sub-nav.test.ts` (5) → "chưa gán" và sub-nav | – | – | Unit: có |
| 3 | `screen-links.test.ts` (28, mở rộng ở phase 6, 7) → link lọc; `register-ui-misses-factor.test.ts` (6); `test/unit/data-grid-filters.test.ts` (11) → `filterAccessor`, filter điều khiển; `test/unit/url-state-reconcile.test.ts` (8) → refresh cũ không đè filter mới, tín hiệu xóa selection | – | – | Unit: có |
| 4 | `overview.test.ts` (9), `overview-todos.test.ts` (11) → số Tổng quan bằng đúng trường báo cáo, to-do đếm bằng predicate của màn đích; `test/unit/tong-quan-view.test.ts` (12), `dt-hd-tt-overview-cells.test.ts` (2); `module-release-entrypoints.test.ts` (sửa 4 dòng) | – | – | Unit: có |
| 5 | `book-actual-card.test.ts` (8) → tone danger/warning/success; `test/unit/load-book-headline.test.ts` (6) → kiểm quyền đọc trước, lỗi thì trả thẻ cũ | – | – | Unit: có |
| 6 | `dt-hd-screen-model.test.ts` (14), `dt-hd-outside-reason.test.ts` (4), `test/unit/dt-hd-screen.test.ts` (12) → dòng tổng hợp, mở/lọc, Phần B, bản in là con cuối | – | – | Unit: có |
| 7 | `hd-tt-screen-model.test.ts` (14) → `canTypeSplit`, parse tiền, `mergeDrafts`, `canEditFrom`; `hd-tt-split-rules.test.ts` (6); `hd-tt-link-id.test.ts` (4); `test/unit/hd-tt-screen-table.test.ts` (14) → user đọc không có input, 13 cột, sticky class; `test/unit/dt-tt-screen.test.ts` (8) | – (dùng lại ca quyền H/S/X/Z có sẵn) | – | Unit: có |
| 8 | `test/unit/searchable-select-filter.test.ts` (7) → tìm không dấu, NFC/NFD; `test/unit/collapsible-add-form-storage.test.ts` (4); `register-ui-next-key.test.ts` (6) → khóa kế tiếp; `alias-source-lines.test.ts` (7) | `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts` +1 ca → dòng nguồn ≤ 20, đúng công trình, không quyền đọc bị từ chối | – | Unit + integration: có |
| 9 | – (docs) | – | – | – |

File không ghi thư mục nằm ở `lib/du-an/dt-hd-tt/__tests__/`. Số trong ngoặc là số `it`/`test` đếm bằng regex (`it.each` tính 1).

Commit sửa lỗi `e21a6c8` (HĐ-TT, ô lưu lỗi nhốt con trỏ) **không kèm test nào**.

## 2. Phán quyết

**Unit test.** Thiết kế có chủ đích theo từng phase, bám vào seam thuần (model, predicate, codec, link builder) và render tĩnh (`renderToStaticMarkup`). Chạy thật ở hai nơi: máy dev và CI `baseline`. Chất lượng tốt ở phần logic thuần. Giới hạn cố hữu: môi trường node không có DOM nên **không ca nào chạm sự kiện** (bàn phím, blur, focus, `replaceState`, popup combobox).

**E2E.**
- `.github/workflows/test.yml`: job `e2e` (tên hiển thị `e2e-security`) chỉ chạy khi `classify.strict == 'true'`. Khi chạy, nó gọi `npm run test:e2e` = **toàn bộ** spec Playwright, kể cả spec không thuộc security.
- `scripts/risk-change-classifier.ts`: strict chỉ bật với đường dẫn P0 (`app/api/`, `lib/acl/`, `lib/auth`, `prisma/`, `.github/workflows/`, `test/security/`, `e2e/security/`, …) hoặc file tên `*action(s).ts(x)`.
- Đã kiểm diff từng merge của 9 PR: **0 đường dẫn strict ở cả 9** → job e2e và `security-contract` bị bỏ qua ở cả 9 PR. "CI xanh" của stack này nghĩa là unit + integration xanh, không hơn.
- Spec có sẵn chạm `du-an`: chỉ `e2e/module-release-status.spec.ts` (điều hướng `/du-an` theo trạng thái module). Không spec nào mở màn DT-HĐ-TT.
- `scripts/dt-hd-tt-ui-measure.ts` (6 lệnh con, khoảng 1000 dòng) và `scripts/dt-hd-tt-ui-baseline.ts compare`: chạy tay, cần bản sao dữ liệu thật và phiên đăng nhập lưu sẵn, không nằm trong `e2e/`, không trong CI. Script của phiên thủ công 24/11 đã xóa, không chạy lại được.

## 3. Lỗ hổng, xếp theo rủi ro

| # | Hành vi | Bằng chứng hiện có | Rủi ro |
|---|---|---|---|
| 1 | HĐ-TT `commit()` trong `components/du-an/dt-hd-tt/hd-tt-screen.tsx` (dòng 90–135): Enter/Tab/blur lưu, chống lưu trùng khi đang gửi, giữ nháp lỗi, chuyển focus; gồm bản sửa `e21a6c8` (`fail()` chỉ kéo focus khi `move === "down"`) | Chỉ phiên thủ công, script đã xóa | **Cao.** Ghi dữ liệu tiền, đã từng lỗi thật, logic nằm trong closure không có seam thuần |
| 2 | Sổ nhập: filter giữ sau "Thêm dòng" và Back, đổi filter khi đang lưu, xóa selection khi đổi filter (tránh xóa nhầm dòng) | Unit ghim quyết định thuần (`reconcileUrlState`); phần nối với `replaceState`/`router.refresh` chỉ có `measure filters` và phiên thủ công | **Cao vừa.** Hậu quả là xóa nhầm dòng |
| 3 | `SearchableSelect` trong 6 picker: Enter trên mục đang sáng không submit form, gõ kiểu Unikey; "Lưu và sang dòng kế" + Ctrl+Enter và focus ở khóa kế | Unit chỉ ghim hàm lọc và `nextOpenKey`; tương tác chỉ thủ công | **Vừa.** Dễ vỡ khi nâng `@base-ui/react` |
| 4 | Nhập S ở dòng **được phép** | Unit (`canTypeSplit`, split rules, render input mở). Trên trình duyệt: "không áp dụng" vì dữ liệu thử không có dòng nào cho phép. Server cố ý không chặn S | **Vừa.** Đường đi chưa từng được bấm thật |
| 5 | User chỉ đọc không thấy input (nối `canEditFrom` ở trang server) | Unit render theo prop; integration ghim quyền của action; nối trang ↔ quyền chỉ đo tay | **Thấp vừa.** Server action vẫn chặn ghi |
| 6 | Link Tổng quan hạ cánh đúng chỗ đã lọc | Unit ghim predicate và link builder dùng chung; hạ cánh thật chỉ `measure todos` | **Thấp vừa** |
| 7 | In/PDF/Excel không đổi trên dữ liệu thật; nav một dòng ở 1366/1440; sticky; chiều cao DT-HĐ; thời gian server | Snapshot fixture trong CI + `compare`/`measure` chạy tay | **Thấp.** Snapshot CI đã bắt phần lớn; phần còn lại không thể vào CI vì cần dữ liệu riêng |
| 8 | Integration chưa chạy trên máy dev | Chỉ CI | **Thấp**, nhưng làm vòng phản hồi chậm |

## 4. Khuyến nghị

**Điều kiện tiên quyết (quyết định của người dùng):** spec mới đặt ở `e2e/` (ngoài `e2e/security/`) **không tự kích hoạt** job e2e, kể cả trong chính PR thêm nó. Phải mở rộng lane trước: thêm vào classifier một cờ riêng cho e2e (không bật `securityContract`) với các tiền tố `e2e/`, `app/(app)/du-an/`, `components/du-an/`, `lib/du-an/dt-hd-tt/`, `components/ui/searchable-select*`, `components/data-grid/`. Sửa classifier/workflow là đường dẫn P0 nên PR đó tự chạy đủ lane. Công: khoảng 0,25 ngày. **Nếu không đổi lane thì đừng thêm spec** — spec không chạy sẽ mục.

**Seed chung:** thêm vào `e2e/fixtures/db.ts` một hàm `seedDtHdTtBook(prefix)` + hàm dọn, theo mẫu `seedLot`/`deleteLot`: 1 công trình mã duy nhất, hạng mục, vài dòng dự toán, 2 NCC, 1 đầu mối, 2 liên kết đầu mối–NCC, vài dòng hóa đơn, 2 alias chưa gán. Lấy hình dạng dữ liệu từ `seed()` trong `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts` (chép hình dạng, không import: fixture e2e dùng PrismaClient không có extension audit). `global-setup.ts` đã đặt mọi module `ready` và cấp `du-an: read` cho `e2e-project`; dùng `asAdmin` để ghi, `asProjectUser` + 1 dòng `projectPermission` mức read cho ca chỉ đọc. Dùng tên giả, không dùng mã/tên công trình thật. Công: 0,5–0,75 ngày, là chi phí lớn nhất và dùng chung cho mọi spec.

| # | Spec | Hành vi ghim | Công (sau khi có seed) |
|---|---|---|---|
| 1 | `e2e/du-an-hd-tt-edit.spec.ts` | "1.500" + Enter lưu và focus xuống dòng dưới; reload còn giá trị; chữ sai + Enter giữ focus; chữ sai + Tab/bấm ô khác thì focus **đi được**, ô vẫn đỏ và giữ chữ (`e21a6c8`); Esc bỏ nháp; nháp lỗi sống qua lần lưu ô khác; S gõ được ở dòng cho phép (seed đầu mối đã chốt, 2 NCC); `asProjectUser` không có nút sửa, 0 input | 0,5 ngày |
| 2 | `e2e/du-an-book-filter.spec.ts` | Mở sổ Hóa đơn với `?filter.<cột>=…` thấy đúng dòng; "Thêm dòng" giữ filter; Back khôi phục; đổi filter xóa selection | 0,5 ngày |
| 3 | `e2e/du-an-anh-xa-save-next.spec.ts` | Gõ không dấu trong picker Dòng DT, Enter chọn mục mà không submit form; Ctrl+Enter lưu Xác nhận, mở khóa kế, focus vào Dòng DT | 0,5 ngày |

Tổng: khoảng 2–2,5 ngày, thêm chừng vài phút cho mỗi lần CI chạy lane e2e.

**Không nên làm:**
- Không chuyển `measure nav/dt-hd/dashboard/todos` và `compare` vào CI: chúng đo pixel, thời gian và số liệu trên dữ liệu riêng; giá trị nằm ở nghiệm thu, và repo công khai không được chứa dữ liệu đó. Giữ làm bước runbook trước mỗi lần phát hành chạm `dt-hd-tt/**`.
- Không tách `fail()` thành hàm thuần chỉ để có unit test: quyết định một dòng, test đó không tái hiện được vòng lặp blur → lưu lỗi → kéo focus. Spec 1 mới ghim đúng lỗi.
- Không thêm jsdom/Testing Library chỉ cho ba hành vi này: thêm một môi trường test thứ hai, mà vẫn không chứng minh được focus thật và server action.

**Nếu chỉ làm một việc:** mở lane + seed + spec 1 (khoảng 1,25–1,5 ngày).

## Giả định

- Cả 9 PR nhắm `main` hoặc được CI phân loại theo diff tương đương diff merge đã kiểm (độ tin cậy: cao vừa). Nếu một PR stack có base khác, kết quả phân loại vẫn là 0 đường dẫn strict vì toàn stack không chạm đường dẫn nào như vậy.
- Số ca đếm bằng regex, sai số vài ca (cao).
- Máy dev chưa có test DB nên e2e cũng chưa chạy được tại chỗ; spec mới sẽ chỉ kiểm được qua CI cho tới khi dựng xong test DB (vừa; không được phép đọc file env để xác nhận).

## Câu hỏi còn mở

1. Có chấp nhận mở rộng lane e2e (sửa classifier — đường dẫn P0) không? Mặc định khuyến nghị: có, chỉ bật e2e, không bật `security-contract`.
2. Fixture `seed()` của integration test và `plan.md` dùng một mã/tên công trình trông như thật trong repo công khai. Cần người dùng xác nhận đó là tên giả hay cần đổi.
