-- =============================================================================
-- DỌN VÀ BÙ CÔNG TRÌNH CHO DỮ LIỆU VẬT TƯ CŨ — chạy TRƯỚC migration
-- 20261106090000_vat_tu_pair_scope_and_import_review (DB vẫn ở schema CŨ, module đã đóng).
--
-- Runbook: plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md (bước 6).
-- Đây là dọn / sửa dữ liệu cũ theo danh sách người dùng duyệt (ngoại lệ đã chấp nhận của D7),
-- KHÔNG phải nạp dữ liệu. Dữ liệu tiền tới 26/10/2026 sau đó chỉ đến từ lần import chuyển đổi.
--
-- Việc script làm, tất cả trong MỘT transaction:
--   1. Kiểm DB còn ở schema cũ và tài khoản người chạy (runner_email) tồn tại.
--   2. Khoá các bảng liên quan (chặn ghi đồng thời; đọc vẫn được).
--   3. (Tuỳ chọn) Nạp danh sách NCC GIỮ lịch sử ≤ 26/10 /tmp/cutover/keep-suppliers.csv vào bảng
--      tạm vt_keep_suppliers (chỉ khi chạy với  -v giu_ncc=on ). Sổ, số dư và phiếu ≤ 26/10 của các
--      NCC này KHÔNG bị xoá (NCC không có trong gói Excel — import không bù lại); dòng nào của
--      chúng thiếu công trình thì phải nằm trong danh sách gán (assign), nếu không → RAISE.
--   4. Nạp danh sách đã duyệt /tmp/cutover/approved.csv vào bảng tạm vt_approved.
--   5. Kiểm danh sách duyệt TRÙNG KHÍT tập dòng thỏa ĐIỀU KIỆN ĐỘC LẬP (định nghĩa một lần ở
--      các view vt_pred_*; không phụ thuộc danh sách id). Lệch → RAISE, liệt kê id thiếu / thừa.
--      Event đã xoá mềm trỏ tới phiếu sắp xoá thuộc điều kiện xoá sổ (đi cùng phiếu).
--   6. Kiểm dòng mồ côi: event (deliveryId) trỏ tới phiếu sắp xoá mà event không bị xoá; dòng sổ
--      sinh từ đợt thanh toán chưa được duyệt riêng (delete_payment_linked); đợt vat_tu còn mở;
--      Chủ thể của dòng khác Chủ thể của công trình được gán. Có → RAISE.
--   7. DELETE … RETURNING (mỗi lệnh lọc theo danh sách duyệt VÀ điều kiện độc lập), rồi
--      UPDATE "projectId" cho dòng thiếu công trình (> 26/10, hoặc của NCC giữ) theo danh sách gán.
--      Mọi dòng bị đổi được ghi vào bảng tạm vt_result (toàn bộ nội dung dòng dạng JSON).
--   8. So số dòng đã xử lý với số id đã duyệt VÀ số dòng thỏa điều kiện → lệch thì RAISE.
--   9. Kiểm lại điều kiện migrate (không còn kỳ đối chiếu, không còn dòng vật tư thiếu công trình
--      hay ≤ 26/10 ngoài NCC giữ) và bất biến Chủ thể = Chủ thể công trình cho MỌI dòng sổ / số dư
--      vật tư còn lại có công trình (kể cả dòng giữ nguyên, không chỉ dòng được gán). Chưa đạt → RAISE.
--  10. Ghi một dòng audit_logs (người chạy, số dòng từng bảng).
--  11. Xuất /tmp/cutover/cleanup-result.csv (target, action, id, row_data JSON) — lưu cùng bản
--      sao lưu; đủ để khôi phục từng dòng bằng jsonb_populate_record nếu cần.
--  12. MẶC ĐỊNH ROLLBACK. Chỉ COMMIT khi chạy với  -v xac_nhan_commit=on  (xem cuối tệp).
--
-- Định dạng /tmp/cutover/approved.csv (UTF-8, có dòng tiêu đề, phân cách dấu phẩy):
--   target,action,id,project_id,note
--   target ∈ reconciliation | ledger | opening | delivery | quote
--   action ∈ delete | delete_payment_linked (chỉ ledger) | assign (ledger/opening/delivery)
--   project_id: bắt buộc với assign, để trống với delete. note: tuỳ ý (không dùng).
--   Lấy từ /tmp/cutover/candidates.csv do scripts/vat-tu-cutover-inventory.sql sinh ra (chạy kiểm
--   kê với CÙNG tuỳ chọn -v giu_ncc=on và cùng keep-suppliers.csv thì danh sách mới khớp).
--
-- Định dạng /tmp/cutover/keep-suppliers.csv (tuỳ chọn, UTF-8, có dòng tiêu đề):
--   supplier_id,note
--   supplier_id: id NCC (bảng suppliers) giữ nguyên lịch sử ≤ 26/10. note: tuỳ ý (tên NCC, lý do).
--
-- Chạy (PowerShell; psql chạy TRONG container nên không cần mật khẩu):
--   docker cp approved.csv docker-postgres-1:/tmp/cutover/approved.csv
--   docker cp scripts/vat-tu-cutover-cleanup.sql docker-postgres-1:/tmp/cutover/
--   # Lần 1 — chạy thử, kết thúc ROLLBACK:
--   docker exec docker-postgres-1 sh -c "psql -U nqerp -d <tên DB> -v ON_ERROR_STOP=1 -v runner_email=<email admin ERP> -f /tmp/cutover/vat-tu-cutover-cleanup.sql > /tmp/cutover/cleanup-thu.txt 2>&1"
--   # Lần 2 — sau khi người dùng đồng ý kết quả lần 1, thêm  -v xac_nhan_commit=on
--   # Có NCC giữ lịch sử: docker cp keep-suppliers.csv vào /tmp/cutover/ và thêm  -v giu_ncc=on  ở MỌI lần chạy.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
\pset null '(null)'

\if :{?runner_email}
\else
  \echo 'THIẾU -v runner_email=<email tài khoản admin ERP của người chạy>. Dừng, chưa làm gì.'
  DO $$ BEGIN RAISE EXCEPTION 'Thiếu biến psql runner_email'; END $$;
\endif

BEGIN;
-- Không chờ khoá vô hạn sau transaction của app; chạy lại nếu hết giờ.
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '10min';
SELECT set_config('vt_cutover.runner_email', :'runner_email', true) AS runner_email;

-- ─── 1. Điều kiện chạy ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'supplier_reconciliations'
      AND column_name = 'projectId'
  ) THEN
    RAISE EXCEPTION 'DB đã ở schema mới (supplier_reconciliations có cột projectId). Script này chỉ chạy TRƯỚC migration 20261106090000.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = current_setting('vt_cutover.runner_email')) THEN
    RAISE EXCEPTION 'Không có tài khoản ERP với email "%" (biến runner_email).', current_setting('vt_cutover.runner_email');
  END IF;
END $$;

-- ─── 2. Khoá bảng ────────────────────────────────────────────────────────────
-- SHARE ROW EXCLUSIVE: chặn mọi ghi khác (kể cả sổ nhân công trong vài giây chạy), vẫn cho đọc.
LOCK TABLE supplier_reconciliations, supplier_delivery_daily, supplier_price_quotes,
           ledger_transactions, ledger_opening_balances
  IN SHARE ROW EXCLUSIVE MODE;
-- Đợt thanh toán chỉ đọc để kiểm đợt còn mở: SHARE đủ chặn đóng/duyệt đợt đồng thời.
LOCK TABLE payment_rounds, payment_round_items IN SHARE MODE;

-- ─── 3. NCC GIỮ LỊCH SỬ ≤ 26/10 (tuỳ chọn: -v giu_ncc=on + /tmp/cutover/keep-suppliers.csv) ──
-- Không ON COMMIT DROP: các view vt_pred_* bên dưới phụ thuộc bảng này (bảng tạm mất khi hết phiên).
CREATE TEMP TABLE vt_keep_suppliers (
  supplier_id integer NOT NULL,
  note        text
);
\if :{?giu_ncc}
  \if :giu_ncc
    \copy vt_keep_suppliers (supplier_id, note) FROM '/tmp/cutover/keep-suppliers.csv' WITH (FORMAT csv, HEADER true)
  \endif
\endif

DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(supplier_id::text, ', ') INTO v_bad
  FROM (SELECT supplier_id FROM vt_keep_suppliers GROUP BY supplier_id HAVING count(*) > 1) d;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'keep-suppliers.csv có NCC lặp: %', v_bad;
  END IF;
  SELECT string_agg(k.supplier_id::text, ', ') INTO v_bad
  FROM vt_keep_suppliers k LEFT JOIN suppliers s ON s.id = k.supplier_id
  WHERE s.id IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'keep-suppliers.csv có NCC không tồn tại: %', v_bad;
  END IF;
END $$;

-- ─── 3b. ĐIỀU KIỆN ĐỘC LẬP (định nghĩa MỘT lần; giống hệt các view của script kiểm kê) ────────
-- Ngày nghiệp vụ lưu tại 00:00 nên "≤ 26/10/2026" là  < TIMESTAMP '2026-10-27'.
-- NCC giữ (vt_keep_suppliers): dòng ≤ 26/10 không bị xoá; dòng thiếu công trình của họ phải gán.
CREATE TEMP VIEW vt_pred_recon_delete AS
  -- Mọi kỳ, kể cả đã xoá mềm: migration dừng nếu bảng còn bất kỳ dòng nào.
  SELECT id FROM supplier_reconciliations;

CREATE TEMP VIEW vt_pred_delivery_delete AS
  -- Phiếu tới mốc của NCC không giữ: 23 file theo dõi đưa vào toàn bộ lịch sử khối lượng (D6), giữ
  -- sẽ thành trùng. Cộng phiếu đã xoá mềm mà thiếu công trình (CHECK kiểm cả dòng xoá mềm).
  SELECT id FROM supplier_delivery_daily
  WHERE ("date" < TIMESTAMP '2026-10-27' AND "supplierId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers))
     OR ("projectId" IS NULL AND "deletedAt" IS NOT NULL);

CREATE TEMP VIEW vt_pred_delivery_assign AS
  SELECT id FROM supplier_delivery_daily
  WHERE "projectId" IS NULL AND "deletedAt" IS NULL
    AND ("date" >= TIMESTAMP '2026-10-27' OR "supplierId" IN (SELECT supplier_id FROM vt_keep_suppliers));

CREATE TEMP VIEW vt_pred_ledger_delete AS
  -- Sổ vật tư tới mốc của NCC không giữ (Nhập Liệu thay thế) + dòng đã xoá mềm mà thiếu công trình
  -- (CHECK kiểm cả dòng xoá mềm) + event đã xoá mềm trỏ tới phiếu sắp xoá (đi cùng phiếu; giữ lại
  -- thì kiểm mồ côi ở mục 6 luôn dừng mà danh sách duyệt không có cách nào thêm được).
  SELECT id FROM ledger_transactions
  WHERE "ledgerType" = 'material'
    AND (("date" < TIMESTAMP '2026-10-27' AND "partyId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers))
         OR ("projectId" IS NULL AND "deletedAt" IS NOT NULL)
         OR ("deletedAt" IS NOT NULL AND "deliveryId" IN (SELECT id FROM vt_pred_delivery_delete)));

CREATE TEMP VIEW vt_pred_ledger_payment AS
  -- Phần của tập trên sinh từ đợt thanh toán: phải duyệt riêng bằng action delete_payment_linked.
  SELECT id FROM ledger_transactions
  WHERE id IN (SELECT id FROM vt_pred_ledger_delete) AND "paymentRoundItemId" IS NOT NULL;

CREATE TEMP VIEW vt_pred_ledger_assign AS
  SELECT id FROM ledger_transactions
  WHERE "ledgerType" = 'material' AND "projectId" IS NULL AND "deletedAt" IS NULL
    AND ("date" >= TIMESTAMP '2026-10-27' OR "partyId" IN (SELECT supplier_id FROM vt_keep_suppliers));

CREATE TEMP VIEW vt_pred_opening_delete AS
  -- Số Dư Ban Đầu của file tổng (asOf 31/12/2025) thay thế mọi số dư vật tư tới mốc của NCC không giữ.
  SELECT id FROM ledger_opening_balances
  WHERE "ledgerType" = 'material' AND "asOfDate" < TIMESTAMP '2026-10-27'
    AND "partyId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers);

CREATE TEMP VIEW vt_pred_opening_assign AS
  SELECT id FROM ledger_opening_balances
  WHERE "ledgerType" = 'material' AND "projectId" IS NULL
    AND ("asOfDate" >= TIMESTAMP '2026-10-27' OR "partyId" IN (SELECT supplier_id FROM vt_keep_suppliers));

CREATE TEMP VIEW vt_pred_quote_delete AS
  -- Chỉ báo giá pilot 07/10 (note PILOT BG1..3); báo giá thật được giữ.
  SELECT id FROM supplier_price_quotes WHERE "note" LIKE 'PILOT%';

-- Bất biến Chủ thể = Chủ thể công trình (I2) trên dòng sổ (còn hiệu lực) / số dư vật tư KHÔNG bị xoá
-- và có công trình — gồm dòng giữ nguyên lẫn dòng vừa được gán (view tính lại mỗi lần đọc).
--   lech            : công trình đã có Chủ thể, khác Chủ thể của dòng → script dừng.
--   nhieu_chu_the   : công trình chưa có Chủ thể, dòng của nó mang ≥ 2 Chủ thể → script dừng.
--   chua_co_chu_the : công trình chưa có Chủ thể, dòng mang đúng một Chủ thể → bước 8 gán đúng Chủ
--                     thể đó (app từ chối gán lần đầu khác Chủ thể của dòng).
CREATE TEMP VIEW vt_entity_check AS
  WITH kept AS (
    SELECT 'ledger'::text AS target, t.id, t."partyId" AS supplier_id, t."projectId" AS project_id, t."entityId" AS entity_id
      FROM ledger_transactions t
     WHERE t."ledgerType" = 'material' AND t."deletedAt" IS NULL AND t."projectId" IS NOT NULL
       AND t.id NOT IN (SELECT id FROM vt_pred_ledger_delete)
    UNION ALL
    SELECT 'opening', o.id, o."partyId", o."projectId", o."entityId"
      FROM ledger_opening_balances o
     WHERE o."ledgerType" = 'material' AND o."projectId" IS NOT NULL
       AND o.id NOT IN (SELECT id FROM vt_pred_opening_delete)
  ),
  per_project AS (
    SELECT project_id, count(DISTINCT entity_id) AS n_entities FROM kept GROUP BY project_id
  )
  SELECT k.target, k.id, k.supplier_id, k.project_id, k.entity_id, p."entityId" AS project_entity_id,
         CASE
           WHEN p."entityId" IS NOT NULL THEN 'lech'
           WHEN pp.n_entities > 1 THEN 'nhieu_chu_the'
           ELSE 'chua_co_chu_the'
         END AS kind
    FROM kept k
    JOIN projects p ON p.id = k.project_id
    JOIN per_project pp ON pp.project_id = k.project_id
   WHERE p."entityId" IS NULL OR p."entityId" <> k.entity_id;

-- ─── 4. Nạp danh sách đã duyệt ──────────────────────────────────────────────
CREATE TEMP TABLE vt_approved (
  target     text    NOT NULL,
  action     text    NOT NULL,
  id         integer NOT NULL,
  project_id integer,
  note       text
) ON COMMIT DROP;

\copy vt_approved (target, action, id, project_id, note) FROM '/tmp/cutover/approved.csv' WITH (FORMAT csv, HEADER true)

DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(format('%s/%s#%s', target, action, id), ', ') INTO v_bad
  FROM vt_approved
  WHERE (target, action) NOT IN (
    SELECT * FROM (VALUES
      ('reconciliation', 'delete'),
      ('ledger', 'delete'), ('ledger', 'delete_payment_linked'), ('ledger', 'assign'),
      ('opening', 'delete'), ('opening', 'assign'),
      ('delivery', 'delete'), ('delivery', 'assign'),
      ('quote', 'delete')
    ) AS ok(target, action)
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'approved.csv có target/action không hợp lệ: %', v_bad;
  END IF;

  SELECT string_agg(format('%s#%s', target, id), ', ') INTO v_bad
  FROM (SELECT target, id FROM vt_approved GROUP BY target, id HAVING count(*) > 1) d;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'approved.csv có id lặp (mỗi dòng chỉ được một action): %', v_bad;
  END IF;

  SELECT string_agg(format('%s/%s#%s', target, action, id), ', ') INTO v_bad
  FROM vt_approved
  WHERE (action = 'assign' AND project_id IS NULL) OR (action <> 'assign' AND project_id IS NOT NULL);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'project_id bắt buộc với assign và phải để trống với delete: %', v_bad;
  END IF;

  SELECT string_agg(format('%s#%s → công trình #%s', a.target, a.id, a.project_id), ', ') INTO v_bad
  FROM vt_approved a
  LEFT JOIN projects p ON p.id = a.project_id
  WHERE a.action = 'assign' AND (p.id IS NULL OR p."deletedAt" IS NOT NULL);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Công trình được gán không tồn tại hoặc đã xoá: %', v_bad;
  END IF;
END $$;

-- ─── 5. So danh sách duyệt với điều kiện độc lập (trước khi đổi bất kỳ dòng nào) ───────
CREATE TEMP TABLE vt_counts (
  label        text      PRIMARY KEY,
  target       text      NOT NULL,
  actions      text[]    NOT NULL,
  approved_ids integer[] NOT NULL,
  pred_ids     integer[] NOT NULL
) ON COMMIT DROP;

INSERT INTO vt_counts (label, target, actions, approved_ids, pred_ids)
SELECT v.target || '/' || array_to_string(v.actions, '+'),
       v.target,
       v.actions,
       ARRAY(SELECT a.id FROM vt_approved a
              WHERE a.target = v.target AND a.action = ANY (v.actions) ORDER BY a.id),
       v.pred_ids
FROM (VALUES
  ('reconciliation', ARRAY['delete'],                         ARRAY(SELECT id FROM vt_pred_recon_delete ORDER BY id)),
  ('ledger',         ARRAY['delete', 'delete_payment_linked'], ARRAY(SELECT id FROM vt_pred_ledger_delete ORDER BY id)),
  ('ledger',         ARRAY['delete_payment_linked'],          ARRAY(SELECT id FROM vt_pred_ledger_payment ORDER BY id)),
  ('ledger',         ARRAY['assign'],                         ARRAY(SELECT id FROM vt_pred_ledger_assign ORDER BY id)),
  ('opening',        ARRAY['delete'],                         ARRAY(SELECT id FROM vt_pred_opening_delete ORDER BY id)),
  ('opening',        ARRAY['assign'],                         ARRAY(SELECT id FROM vt_pred_opening_assign ORDER BY id)),
  ('delivery',       ARRAY['delete'],                         ARRAY(SELECT id FROM vt_pred_delivery_delete ORDER BY id)),
  ('delivery',       ARRAY['assign'],                         ARRAY(SELECT id FROM vt_pred_delivery_assign ORDER BY id)),
  ('quote',          ARRAY['delete'],                         ARRAY(SELECT id FROM vt_pred_quote_delete ORDER BY id))
) AS v(target, actions, pred_ids);

DO $$
DECLARE
  c         record;
  v_missing integer[];
  v_extra   integer[];
  v_err     text := '';
BEGIN
  FOR c IN SELECT * FROM vt_counts ORDER BY label LOOP
    v_missing := ARRAY(SELECT unnest(c.pred_ids) EXCEPT SELECT unnest(c.approved_ids) ORDER BY 1);
    v_extra   := ARRAY(SELECT unnest(c.approved_ids) EXCEPT SELECT unnest(c.pred_ids) ORDER BY 1);
    IF cardinality(v_missing) > 0 OR cardinality(v_extra) > 0 THEN
      v_err := v_err || format(
        E'\n- [%s] duyệt %s id, điều kiện độc lập %s dòng. Thỏa điều kiện nhưng CHƯA duyệt (tối đa 50): %s. Đã duyệt nhưng KHÔNG thỏa điều kiện (tối đa 50): %s.%s',
        c.label, cardinality(c.approved_ids), cardinality(c.pred_ids), v_missing[1:50], v_extra[1:50],
        CASE WHEN c.label = 'ledger/delete_payment_linked'
             THEN ' Dòng sổ sinh từ đợt thanh toán phải duyệt riêng: đổi action thành delete_payment_linked sau khi đối chiếu với "Trả Nợ" của Nhập Liệu.'
             ELSE '' END);
    END IF;
  END LOOP;
  IF v_err <> '' THEN
    RAISE EXCEPTION 'Danh sách duyệt không trùng khít điều kiện độc lập — chạy lại kiểm kê và duyệt lại:%', v_err;
  END IF;
END $$;

-- ─── 6. Kiểm dòng mồ côi và nhất quán (trước khi đổi bất kỳ dòng nào) ───────────────────
DO $$
DECLARE
  v_ids integer[];
  v_bad text;
BEGIN
  -- Event trỏ tới phiếu sắp xoá mà event không nằm trong danh sách xoá: FK SET NULL sẽ biến
  -- event thành dòng lay_hang "nhập tay" còn tiền nhưng mất phiếu. Event đã xoá mềm của phiếu sắp
  -- xoá đã thuộc điều kiện xoá sổ, nên chỉ event CÒN HIỆU LỰC (hai phía mốc) mới dừng ở đây.
  v_ids := ARRAY(
    SELECT t.id FROM ledger_transactions t
    WHERE t."deliveryId" IN (SELECT id FROM vt_approved WHERE target = 'delivery' AND action = 'delete')
      AND t.id NOT IN (SELECT id FROM vt_approved WHERE target = 'ledger' AND action IN ('delete', 'delete_payment_linked'))
    ORDER BY t.id);
  IF cardinality(v_ids) > 0 THEN
    RAISE EXCEPTION 'Dòng sổ (event) trỏ tới phiếu sắp xoá nhưng không bị xoá (tối đa 50): %', v_ids[1:50];
  END IF;

  -- Đợt vat_tu còn mở: đóng sau go-live sẽ ghi thanh_toan theo ngày đóng, trừ lần nữa khoản đã có
  -- trong Nhập Liệu. Phải đóng / từ chối / xoá qua UI trước bước này rồi kiểm kê lại.
  v_ids := ARRAY(
    SELECT DISTINCT r.id FROM payment_rounds r
    JOIN payment_round_items i ON i."roundId" = r.id
    WHERE r."deletedAt" IS NULL AND r.status IN ('draft', 'submitted', 'approved') AND i.category = 'vat_tu'
    ORDER BY r.id);
  IF cardinality(v_ids) > 0 THEN
    RAISE EXCEPTION 'Còn đợt thanh toán mở có dòng vat_tu: %. Xử lý qua UI rồi kiểm kê lại.', v_ids;
  END IF;

  -- Chủ thể của dòng phải bằng Chủ thể của công trình được gán (bất biến Chủ thể = Project.entityId).
  SELECT string_agg(x, '; ') INTO v_bad FROM (
    SELECT format('ledger #%s: Chủ thể dòng #%s ≠ Chủ thể công trình #%s (#%s)', t.id, t."entityId", p.id, p."entityId") AS x
    FROM vt_approved a
    JOIN ledger_transactions t ON t.id = a.id
    JOIN projects p ON p.id = a.project_id
    WHERE a.target = 'ledger' AND a.action = 'assign'
      AND p."entityId" IS NOT NULL AND p."entityId" <> t."entityId"
    UNION ALL
    SELECT format('opening #%s: Chủ thể dòng #%s ≠ Chủ thể công trình #%s (#%s)', o.id, o."entityId", p.id, p."entityId")
    FROM vt_approved a
    JOIN ledger_opening_balances o ON o.id = a.id
    JOIN projects p ON p.id = a.project_id
    WHERE a.target = 'opening' AND a.action = 'assign'
      AND p."entityId" IS NOT NULL AND p."entityId" <> o."entityId"
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Gán công trình lệch Chủ thể: %', v_bad;
  END IF;

  -- Một công trình được gán cho dòng của hai Chủ thể khác nhau thì không gán Chủ thể đúng được.
  SELECT string_agg(format('công trình #%s nhận dòng của Chủ thể %s', project_id, entity_ids), '; ') INTO v_bad
  FROM (
    SELECT a.project_id, array_agg(DISTINCT coalesce(t."entityId", o."entityId")) AS entity_ids
    FROM vt_approved a
    LEFT JOIN ledger_transactions t ON a.target = 'ledger' AND t.id = a.id
    LEFT JOIN ledger_opening_balances o ON a.target = 'opening' AND o.id = a.id
    WHERE a.action = 'assign' AND a.target IN ('ledger', 'opening')
    GROUP BY a.project_id
    HAVING count(DISTINCT coalesce(t."entityId", o."entityId")) > 1
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Gán công trình lệch Chủ thể: %', v_bad;
  END IF;
END $$;

-- ─── 7. Xoá và gán — mỗi lệnh lọc theo danh sách duyệt VÀ điều kiện độc lập ───────────────
CREATE TEMP TABLE vt_result (
  target   text    NOT NULL,
  action   text    NOT NULL,
  id       integer NOT NULL,
  row_data jsonb   NOT NULL
) ON COMMIT DROP;

WITH d AS (
  DELETE FROM supplier_reconciliations t
  USING vt_approved a
  WHERE a.target = 'reconciliation' AND a.action = 'delete' AND a.id = t.id
    AND t.id IN (SELECT id FROM vt_pred_recon_delete)
  RETURNING t.*
)
INSERT INTO vt_result (target, action, id, row_data)
SELECT 'reconciliation', 'delete', d.id, to_jsonb(d) FROM d;

-- Xoá sổ TRƯỚC phiếu: event của phiếu bị xoá đi cùng, FK deliveryId không phải SET NULL dòng nào.
WITH d AS (
  DELETE FROM ledger_transactions t
  USING vt_approved a
  WHERE a.target = 'ledger' AND a.action IN ('delete', 'delete_payment_linked') AND a.id = t.id
    AND t.id IN (SELECT id FROM vt_pred_ledger_delete)
  RETURNING t.*
)
INSERT INTO vt_result (target, action, id, row_data)
SELECT 'ledger', a.action, d.id, to_jsonb(d)
FROM d
JOIN vt_approved a ON a.target = 'ledger' AND a.id = d.id;

WITH d AS (
  DELETE FROM supplier_delivery_daily t
  USING vt_approved a
  WHERE a.target = 'delivery' AND a.action = 'delete' AND a.id = t.id
    AND t.id IN (SELECT id FROM vt_pred_delivery_delete)
  RETURNING t.*
)
INSERT INTO vt_result (target, action, id, row_data)
SELECT 'delivery', 'delete', d.id, to_jsonb(d) FROM d;

WITH d AS (
  DELETE FROM ledger_opening_balances t
  USING vt_approved a
  WHERE a.target = 'opening' AND a.action = 'delete' AND a.id = t.id
    AND t.id IN (SELECT id FROM vt_pred_opening_delete)
  RETURNING t.*
)
INSERT INTO vt_result (target, action, id, row_data)
SELECT 'opening', 'delete', d.id, to_jsonb(d) FROM d;

WITH d AS (
  DELETE FROM supplier_price_quotes t
  USING vt_approved a
  WHERE a.target = 'quote' AND a.action = 'delete' AND a.id = t.id
    AND t.id IN (SELECT id FROM vt_pred_quote_delete)
  RETURNING t.*
)
INSERT INTO vt_result (target, action, id, row_data)
SELECT 'quote', 'delete', d.id, to_jsonb(d) FROM d;

-- Gán công trình cho dòng thiếu công trình: > 26/10, hoặc của NCC giữ (projectId trước đó là NULL theo điều kiện độc lập).
WITH u AS (
  UPDATE ledger_transactions t
  SET "projectId" = a.project_id, "updatedAt" = (now() AT TIME ZONE 'UTC')
  FROM vt_approved a
  WHERE a.target = 'ledger' AND a.action = 'assign' AND a.id = t.id
    AND t.id IN (SELECT id FROM vt_pred_ledger_assign)
  RETURNING t.*
)
INSERT INTO vt_result (target, action, id, row_data)
SELECT 'ledger', 'assign', u.id, to_jsonb(u) FROM u;

WITH u AS (
  UPDATE ledger_opening_balances t
  SET "projectId" = a.project_id, "updatedAt" = (now() AT TIME ZONE 'UTC')
  FROM vt_approved a
  WHERE a.target = 'opening' AND a.action = 'assign' AND a.id = t.id
    AND t.id IN (SELECT id FROM vt_pred_opening_assign)
  RETURNING t.*
)
INSERT INTO vt_result (target, action, id, row_data)
SELECT 'opening', 'assign', u.id, to_jsonb(u) FROM u;

WITH u AS (
  UPDATE supplier_delivery_daily t
  SET "projectId" = a.project_id, "updatedAt" = (now() AT TIME ZONE 'UTC')
  FROM vt_approved a
  WHERE a.target = 'delivery' AND a.action = 'assign' AND a.id = t.id
    AND t.id IN (SELECT id FROM vt_pred_delivery_assign)
  RETURNING t.*
)
INSERT INTO vt_result (target, action, id, row_data)
SELECT 'delivery', 'assign', u.id, to_jsonb(u) FROM u;

-- ─── 8. So số dòng đã xử lý với số id đã duyệt VÀ số dòng thỏa điều kiện ─────────────────
DO $$
DECLARE
  c      record;
  v_done bigint;
  v_err  text := '';
BEGIN
  FOR c IN SELECT * FROM vt_counts ORDER BY label LOOP
    SELECT count(*) INTO v_done FROM vt_result r WHERE r.target = c.target AND r.action = ANY (c.actions);
    IF v_done <> cardinality(c.approved_ids) OR v_done <> cardinality(c.pred_ids) THEN
      v_err := v_err || format(E'\n- [%s] đã xử lý %s dòng; duyệt %s; điều kiện độc lập %s.',
                               c.label, v_done, cardinality(c.approved_ids), cardinality(c.pred_ids));
    END IF;
  END LOOP;
  IF v_err <> '' THEN
    RAISE EXCEPTION 'Số dòng xử lý lệch — toàn bộ bị huỷ:%', v_err;
  END IF;
END $$;

-- ─── 9. Kiểm lại sau khi đổi ─────────────────────────────────────────────────
DO $$
DECLARE
  v_ids integer[];
  v_err text := '';
BEGIN
  -- Event và phiếu (đều còn hiệu lực) phải cùng công trình sau khi gán.
  v_ids := ARRAY(
    SELECT t.id FROM ledger_transactions t
    JOIN supplier_delivery_daily d ON d.id = t."deliveryId"
    WHERE t."ledgerType" = 'material' AND t."deletedAt" IS NULL AND d."deletedAt" IS NULL
      AND t."projectId" IS DISTINCT FROM d."projectId"
      AND (t.id IN (SELECT id FROM vt_result WHERE target = 'ledger' AND action = 'assign')
           OR d.id IN (SELECT id FROM vt_result WHERE target = 'delivery' AND action = 'assign'))
    ORDER BY t.id);
  IF cardinality(v_ids) > 0 THEN
    RAISE EXCEPTION 'Event và phiếu của nó khác công trình sau khi gán (event, tối đa 50): %', v_ids[1:50];
  END IF;

  -- Điều kiện của migration 20261106090000 (CHECK kiểm cả dòng xoá mềm) và chính sách dọn.
  IF EXISTS (SELECT 1 FROM supplier_reconciliations) THEN
    v_err := v_err || E'\n- còn kỳ đối chiếu';
  END IF;
  IF EXISTS (SELECT 1 FROM ledger_transactions WHERE "ledgerType" = 'material' AND "projectId" IS NULL) THEN
    v_err := v_err || E'\n- còn dòng sổ vật tư thiếu công trình';
  END IF;
  IF EXISTS (SELECT 1 FROM ledger_transactions WHERE "ledgerType" = 'material' AND "date" < TIMESTAMP '2026-10-27'
               AND "partyId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers)) THEN
    v_err := v_err || E'\n- còn dòng sổ vật tư ngày ≤ 26/10/2026 của NCC không giữ';
  END IF;
  IF EXISTS (SELECT 1 FROM ledger_opening_balances WHERE "ledgerType" = 'material' AND "projectId" IS NULL) THEN
    v_err := v_err || E'\n- còn số dư vật tư thiếu công trình';
  END IF;
  IF EXISTS (SELECT 1 FROM ledger_opening_balances WHERE "ledgerType" = 'material' AND "asOfDate" < TIMESTAMP '2026-10-27'
               AND "partyId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers)) THEN
    v_err := v_err || E'\n- còn số dư vật tư asOf ≤ 26/10/2026 của NCC không giữ';
  END IF;
  IF EXISTS (SELECT 1 FROM supplier_delivery_daily WHERE "projectId" IS NULL) THEN
    v_err := v_err || E'\n- còn phiếu ngày thiếu công trình';
  END IF;
  IF EXISTS (SELECT 1 FROM supplier_delivery_daily WHERE "date" < TIMESTAMP '2026-10-27'
               AND "supplierId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers)) THEN
    v_err := v_err || E'\n- còn phiếu ngày ≤ 26/10/2026 của NCC không giữ';
  END IF;
  IF EXISTS (SELECT 1 FROM supplier_price_quotes WHERE "note" LIKE 'PILOT%') THEN
    v_err := v_err || E'\n- còn báo giá pilot';
  END IF;
  IF v_err <> '' THEN
    RAISE EXCEPTION 'Sau khi dọn vẫn chưa đủ điều kiện migrate:%', v_err;
  END IF;

  -- Bất biến Chủ thể = Chủ thể công trình cho MỌI dòng sổ / số dư vật tư còn lại có công trình
  -- (dòng giữ nguyên lẫn dòng vừa gán). Xử lý: gán đúng Chủ thể cho công trình chưa có, sửa Chủ thể
  -- của dòng, hoặc đưa dòng vào danh sách xoá — rồi kiểm kê lại (mục 11f).
  SELECT string_agg(x, '; ') INTO v_err FROM (
    SELECT format('%s #%s (NCC #%s): Chủ thể dòng #%s, công trình #%s %s', target, id, supplier_id, entity_id, project_id,
                  CASE kind WHEN 'lech' THEN format('thuộc Chủ thể #%s', project_entity_id)
                            ELSE 'chưa có Chủ thể và nhận dòng của nhiều Chủ thể' END) AS x
      FROM vt_entity_check
     WHERE kind IN ('lech', 'nhieu_chu_the')
     ORDER BY project_id, target, id
     LIMIT 50
  ) s;
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'Dòng vật tư còn lại lệch Chủ thể của công trình (tối đa 50): %', v_err;
  END IF;
END $$;

-- ─── 10. Audit ──────────────────────────────────────────────────────────────
INSERT INTO audit_logs (id, "userId", "tableName", "recordId", action, "beforeJson", "afterJson", "createdAt")
SELECT gen_random_uuid()::text,
       u.id,
       'vat_tu_cutover_cleanup',
       current_database() || '@' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS'),
       'cleanup',
       (SELECT jsonb_object_agg(c.label, jsonb_build_object(
                 'approved', cardinality(c.approved_ids), 'predicate', cardinality(c.pred_ids)))
          FROM vt_counts c),
       jsonb_build_object(
         'runnerEmail', u.email,
         'dbUser', session_user,
         'database', current_database(),
         'cutoverDate', '2026-10-26',
         'keptSuppliers', coalesce((SELECT jsonb_agg(supplier_id ORDER BY supplier_id) FROM vt_keep_suppliers), '[]'::jsonb),
         'script', 'scripts/vat-tu-cutover-cleanup.sql',
         'resultFile', '/tmp/cutover/cleanup-result.csv',
         'rows', coalesce((SELECT jsonb_object_agg(k, n)
                             FROM (SELECT target || '/' || action AS k, count(*) AS n
                                     FROM vt_result GROUP BY 1) s), '{}'::jsonb)),
       (now() AT TIME ZONE 'UTC')
FROM users u
WHERE u.email = current_setting('vt_cutover.runner_email');

-- ─── 11. Kết quả ────────────────────────────────────────────────────────────
\echo
\echo '== TÓM TẮT: đã duyệt / điều kiện độc lập / đã xử lý (ba cột phải bằng nhau) =='
SELECT c.label AS muc,
       cardinality(c.approved_ids) AS da_duyet,
       cardinality(c.pred_ids) AS dieu_kien_doc_lap,
       (SELECT count(*) FROM vt_result r WHERE r.target = c.target AND r.action = ANY (c.actions)) AS da_xu_ly
FROM vt_counts c
ORDER BY c.label;

\echo
\echo '== DÒNG ĐƯỢC GÁN CÔNG TRÌNH =='
SELECT r.target, r.id, (r.row_data ->> 'projectId')::integer AS project_id, p.name AS cong_trinh,
       (r.row_data ->> 'entityId')::integer AS chu_the_cua_dong, p."entityId" AS chu_the_cong_trinh
FROM vt_result r
LEFT JOIN projects p ON p.id = (r.row_data ->> 'projectId')::integer
WHERE r.action = 'assign'
ORDER BY r.target, r.id;

\echo
\echo '== NCC GIỮ LỊCH SỬ ≤ 26/10 (keep-suppliers.csv) — số dòng ≤ 26/10 được giữ =='
SELECT k.supplier_id, s.name AS ncc, k.note,
       (SELECT count(*) FROM ledger_transactions t
         WHERE t."ledgerType" = 'material' AND t."partyId" = k.supplier_id AND t."date" < TIMESTAMP '2026-10-27') AS so_giu,
       (SELECT count(*) FROM ledger_opening_balances o
         WHERE o."ledgerType" = 'material' AND o."partyId" = k.supplier_id AND o."asOfDate" < TIMESTAMP '2026-10-27') AS so_du_giu,
       (SELECT count(*) FROM supplier_delivery_daily d
         WHERE d."supplierId" = k.supplier_id AND d."date" < TIMESTAMP '2026-10-27') AS phieu_giu
FROM vt_keep_suppliers k
LEFT JOIN suppliers s ON s.id = k.supplier_id
ORDER BY s.name, k.supplier_id;

\echo
\echo '== CÔNG TRÌNH CHƯA CÓ CHỦ THỂ có dòng sổ / số dư vật tư (gán hoặc giữ) — runbook bước 8 phải gán đúng Chủ thể dưới đây =='
SELECT p.id AS project_id, p.code, p.name,
       array_agg(DISTINCT c.entity_id) AS chu_the_can_gan,
       count(*) AS so_dong
FROM vt_entity_check c
JOIN projects p ON p.id = c.project_id
WHERE c.kind = 'chua_co_chu_the'
GROUP BY p.id, p.code, p.name
ORDER BY p.id;

\echo
\echo '== Đang ghi toàn bộ dòng bị xoá / gán vào /tmp/cutover/cleanup-result.csv =='
\pset format csv
\pset null ''
\pset footer off
\o /tmp/cutover/cleanup-result.csv
SELECT target, action, id, row_data FROM vt_result ORDER BY target, action, id;
\o
\pset footer on
\pset null '(null)'
\pset format aligned

-- =============================================================================
-- KẾT THÚC TRANSACTION
-- MẶC ĐỊNH: ROLLBACK — chạy thử, KHÔNG ghi gì (tệp kết quả vẫn được ghi để xem).
-- Để ghi thật: sau khi người dùng đồng ý kết quả lần chạy thử, chạy lại NGUYÊN lệnh với thêm
--     -v xac_nhan_commit=on
-- Không sửa tệp này để đổi sang COMMIT.
-- =============================================================================
\if :{?xac_nhan_commit}
  \if :xac_nhan_commit
    COMMIT;
    \echo 'ĐÃ COMMIT. Lưu /tmp/cutover/cleanup-result.csv cùng bản sao lưu, rồi chạy lại kiểm kê (mục 1 phải toàn 0).'
  \else
    ROLLBACK;
    \echo 'ĐÃ ROLLBACK (xac_nhan_commit không bật). Không có thay đổi nào được ghi.'
  \endif
\else
  ROLLBACK;
  \echo 'ĐÃ ROLLBACK (mặc định, chạy thử). Không có thay đổi nào được ghi. Thêm -v xac_nhan_commit=on để ghi thật.'
\endif
