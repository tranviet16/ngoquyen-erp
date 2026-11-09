-- =============================================================================
-- KIỂM KÊ DỮ LIỆU VẬT TƯ TRƯỚC CHUYỂN ĐỔI — CHỈ ĐỌC
--
-- Dùng ở runbook go-live bước 4 (kiểm kê), 5 (duyệt) và 6 (kiểm kê lại sau dọn):
--   plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md
--
-- Mốc chuyển đổi: hết 26/10/2026. Ngày sổ cái / phiếu là ngày nghiệp vụ lưu tại 00:00
-- (TIMESTAMP không múi giờ) nên "≤ 26/10" viết là  < '2026-10-27'.
--
-- Chạy được trên schema cũ (trước migration 20261106090000) lẫn schema mới: chỉ đọc các cột
-- có ở cả hai. Gồm cả dòng đã xoá mềm (các CHECK của migration kiểm cả dòng xoá mềm).
--
-- Không ghi bảng thật nào. Trước transaction chỉ đọc, script tạo bảng / view TẠM của phiên
-- (READ ONLY không cho CREATE): danh sách NCC giữ lịch sử và các view điều kiện độc lập chép
-- nguyên văn từ script dọn — mất khi phiên psql kết thúc.
--
-- NCC GIỮ lịch sử ≤ 26/10 (tuỳ chọn): NCC có công nợ trong ERP nhưng KHÔNG có trong gói Excel
-- (import không bù lại). Chép /tmp/cutover/keep-suppliers.csv (tiêu đề supplier_id,note) vào
-- container và chạy với  -v giu_ncc=on  — ở kiểm kê lẫn script dọn, mọi lần chạy. Mục 14 liệt kê
-- theo NCC số dòng ≤ 26/10 sẽ bị xoá để đối chiếu với danh sách NCC trong gói Excel.
--
-- Chạy (PowerShell, psql chạy TRONG container Postgres, không cần mật khẩu):
--   docker exec docker-postgres-1 mkdir -p /tmp/cutover
--   docker cp scripts/vat-tu-cutover-inventory.sql docker-postgres-1:/tmp/cutover/
--   docker exec docker-postgres-1 sh -c "psql -U nqerp -d <tên DB> -v ON_ERROR_STOP=1 -f /tmp/cutover/vat-tu-cutover-inventory.sql > /tmp/cutover/inventory.txt 2>&1"
--   (có NCC giữ: docker cp keep-suppliers.csv vào /tmp/cutover/ và thêm  -v giu_ncc=on )
--   docker cp docker-postgres-1:/tmp/cutover/inventory.txt .
--   docker cp docker-postgres-1:/tmp/cutover/candidates.csv .
--
-- Đầu ra:
--   * Báo cáo (stdout): mục 1 là ĐIỀU KIỆN MIGRATE — sau bước dọn mọi dòng phải = 0.
--   * /tmp/cutover/candidates.csv: danh sách ĐỀ XUẤT theo đúng khuôn approved.csv mà
--     scripts/vat-tu-cutover-cleanup.sql đọc (target,action,id,project_id,note). Người dùng
--     duyệt, điền project_id cho dòng assign, đổi action của dòng sinh từ đợt thanh toán thành
--     delete_payment_linked, rồi lưu thành approved.csv. Điều kiện độc lập ở đây PHẢI giống
--     hệt script dọn; script dọn tự kiểm lại và dừng nếu lệch.
--
-- Nguồn dòng: import = có importRunId; dot_thanh_toan = có paymentRoundItemId;
-- phieu = event sinh từ phiếu (có deliveryId); tay = nhập tay / không có liên kết nào.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
\pset null '(null)'
\pset format wrapped
\pset columns 200
-- Ngày đầu tiên SAU mốc chuyển đổi (dòng có ngày < giá trị này là "≤ 26/10").
\set ngay_sau_moc '2026-10-27'

-- NCC giữ + điều kiện độc lập: bảng / view TẠM của phiên, tạo trước transaction chỉ đọc.
CREATE TEMP TABLE vt_keep_suppliers (
  supplier_id integer NOT NULL,
  note        text
);
\if :{?giu_ncc}
  \if :giu_ncc
    \copy vt_keep_suppliers (supplier_id, note) FROM '/tmp/cutover/keep-suppliers.csv' WITH (FORMAT csv, HEADER true)
  \endif
\endif

-- ĐIỀU KIỆN ĐỘC LẬP — chép NGUYÊN VĂN từ scripts/vat-tu-cutover-cleanup.sql (mục 3b).
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

-- Một snapshot cho mọi truy vấn; READ ONLY: không lệnh nào ghi được vào DB.
BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;

\echo
\echo '== 0. THÔNG TIN CHUNG =='
SELECT current_database() AS db,
       to_char(now() AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI') AS gio_bangkok,
       '26/10/2026' AS moc_chuyen_doi,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'supplier_reconciliations'
           AND column_name = 'projectId'
       ) AS da_o_schema_moi,
       (SELECT count(*) FROM vt_keep_suppliers) AS so_ncc_giu_lich_su;

\echo
\echo '== 0b. NCC GIỮ LỊCH SỬ ≤ 26/10 (keep-suppliers.csv; rỗng nếu không chạy với -v giu_ncc=on) =='
SELECT k.supplier_id, s.name AS ncc, k.note,
       CASE WHEN s.id IS NULL THEN 'KHÔNG TỒN TẠI — script dọn sẽ dừng'
            WHEN count(*) OVER (PARTITION BY k.supplier_id) > 1 THEN 'LẶP — script dọn sẽ dừng' END AS canh_bao
FROM vt_keep_suppliers k
LEFT JOIN suppliers s ON s.id = k.supplier_id
ORDER BY s.name, k.supplier_id;

\echo
\echo '== 1. ĐIỀU KIỆN MIGRATE — sau bước dọn (runbook bước 6) mọi dòng phải = 0 =='
SELECT muc, so_dong FROM (VALUES
  (1, 'Kỳ đối chiếu (mọi dòng, kể cả xoá mềm)',
      (SELECT count(*) FROM supplier_reconciliations)),
  (2, 'Sổ vật tư ngày ≤ 26/10 của NCC không giữ (kể cả xoá mềm)',
      (SELECT count(*) FROM ledger_transactions
        WHERE "ledgerType" = 'material' AND "date" < :'ngay_sau_moc'
          AND "partyId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers))),
  (3, 'Sổ vật tư thiếu công trình (kể cả xoá mềm)',
      (SELECT count(*) FROM ledger_transactions
        WHERE "ledgerType" = 'material' AND "projectId" IS NULL)),
  (4, 'Số dư vật tư asOf ≤ 26/10 của NCC không giữ',
      (SELECT count(*) FROM ledger_opening_balances
        WHERE "ledgerType" = 'material' AND "asOfDate" < :'ngay_sau_moc'
          AND "partyId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers))),
  (5, 'Số dư vật tư thiếu công trình',
      (SELECT count(*) FROM ledger_opening_balances
        WHERE "ledgerType" = 'material' AND "projectId" IS NULL)),
  (6, 'Phiếu ngày ≤ 26/10 của NCC không giữ (kể cả xoá mềm)',
      (SELECT count(*) FROM supplier_delivery_daily WHERE "date" < :'ngay_sau_moc'
          AND "supplierId" NOT IN (SELECT supplier_id FROM vt_keep_suppliers))),
  (7, 'Phiếu ngày thiếu công trình (kể cả xoá mềm)',
      (SELECT count(*) FROM supplier_delivery_daily WHERE "projectId" IS NULL)),
  (8, 'Báo giá pilot (note bắt đầu bằng PILOT)',
      (SELECT count(*) FROM supplier_price_quotes WHERE "note" LIKE 'PILOT%')),
  (9, 'Đợt thanh toán còn mở (draft/submitted/approved) có dòng vat_tu',
      (SELECT count(DISTINCT r.id) FROM payment_rounds r
         JOIN payment_round_items i ON i."roundId" = r.id
        WHERE r."deletedAt" IS NULL
          AND r.status IN ('draft', 'submitted', 'approved')
          AND i.category = 'vat_tu')),
  (10, 'Dòng sổ / số dư vật tư còn lại có công trình mà lệch Chủ thể công trình (xem 11f — script dọn sẽ dừng)',
      (SELECT count(*) FROM vt_entity_check WHERE kind IN ('lech', 'nhieu_chu_the')))
) AS t(stt, muc, so_dong)
ORDER BY stt;

\echo
\echo '== 2. SỔ VẬT TƯ (ledger_transactions, material) theo nguồn × khoảng × công trình × xoá mềm =='
SELECT nguon, khoang,
       thieu_cong_trinh, da_xoa_mem,
       count(*) AS so_dong,
       sum("totalTt") AS tong_tt,
       sum("totalHd") AS tong_hd,
       string_agg(id::text, ',' ORDER BY id) AS ds_id
FROM (
  SELECT id, "totalTt", "totalHd",
         CASE
           WHEN "importRunId" IS NOT NULL THEN 'import'
           WHEN "paymentRoundItemId" IS NOT NULL THEN 'dot_thanh_toan'
           WHEN "deliveryId" IS NOT NULL THEN 'phieu'
           ELSE 'tay'
         END AS nguon,
         CASE WHEN "date" < :'ngay_sau_moc' THEN '≤ 26/10' ELSE '> 26/10' END AS khoang,
         ("projectId" IS NULL) AS thieu_cong_trinh,
         ("deletedAt" IS NOT NULL) AS da_xoa_mem
  FROM ledger_transactions
  WHERE "ledgerType" = 'material'
) s
GROUP BY nguon, khoang, thieu_cong_trinh, da_xoa_mem
ORDER BY khoang, nguon, thieu_cong_trinh, da_xoa_mem;

\echo
\echo '== 3. SỐ DƯ BAN ĐẦU VẬT TƯ (ledger_opening_balances, material) =='
\echo '-- 3a. Theo nguồn × khoảng asOf × công trình'
SELECT CASE WHEN "importRunId" IS NOT NULL THEN 'import' ELSE 'tay' END AS nguon,
       CASE WHEN "asOfDate" < :'ngay_sau_moc' THEN '≤ 26/10' ELSE '> 26/10' END AS khoang,
       ("projectId" IS NULL) AS thieu_cong_trinh,
       count(*) AS so_dong,
       sum("balanceTt") AS tong_tt,
       sum("balanceHd") AS tong_hd,
       string_agg(id::text, ',' ORDER BY id) AS ds_id
FROM ledger_opening_balances
WHERE "ledgerType" = 'material'
GROUP BY 1, 2, 3
ORDER BY 2, 1, 3;

\echo '-- 3b. Chi tiết từng dòng'
SELECT o.id, e.name AS chu_the, s.name AS ncc, p.name AS cong_trinh,
       o."balanceTt" AS so_du_tt, o."balanceHd" AS so_du_hd,
       to_char(o."asOfDate", 'DD/MM/YYYY') AS as_of, o."importRunId" AS import_run, o.note
FROM ledger_opening_balances o
LEFT JOIN entities e ON e.id = o."entityId"
LEFT JOIN suppliers s ON s.id = o."partyId"
LEFT JOIN projects p ON p.id = o."projectId"
WHERE o."ledgerType" = 'material'
ORDER BY o.id;

\echo
\echo '== 4. PHIẾU NGÀY (supplier_delivery_daily) theo nguồn × khoảng × công trình × xoá mềm × có event =='
SELECT nguon, khoang, thieu_cong_trinh, da_xoa_mem, co_event,
       count(*) AS so_dong,
       sum("totalAmount") AS tong_thanh_tien,
       string_agg(id::text, ',' ORDER BY id) AS ds_id
FROM (
  SELECT d.id, d."totalAmount",
         CASE WHEN d."importRunId" IS NOT NULL THEN 'import' ELSE 'tay' END AS nguon,
         CASE WHEN d."date" < :'ngay_sau_moc' THEN '≤ 26/10' ELSE '> 26/10' END AS khoang,
         (d."projectId" IS NULL) AS thieu_cong_trinh,
         (d."deletedAt" IS NOT NULL) AS da_xoa_mem,
         EXISTS (SELECT 1 FROM ledger_transactions t WHERE t."deliveryId" = d.id) AS co_event
  FROM supplier_delivery_daily d
) s
GROUP BY nguon, khoang, thieu_cong_trinh, da_xoa_mem, co_event
ORDER BY khoang, nguon, thieu_cong_trinh, da_xoa_mem, co_event;

\echo
\echo '== 5. BÁO GIÁ (supplier_price_quotes) — chỉ dòng note "PILOT…" bị xoá =='
SELECT q.id, s.name AS ncc, i.name AS vat_tu, q."unitPrice" AS don_gia,
       to_char(q."effectiveFrom", 'DD/MM/YYYY') AS hieu_luc_tu,
       q.note, (q."deletedAt" IS NOT NULL) AS da_xoa_mem,
       (q."note" LIKE 'PILOT%') AS se_xoa
FROM supplier_price_quotes q
LEFT JOIN suppliers s ON s.id = q."supplierId"
LEFT JOIN items i ON i.id = q."itemId"
ORDER BY q.id;

\echo
\echo '== 6. KỲ ĐỐI CHIẾU (supplier_reconciliations) — mọi kỳ hiện có đều thiếu công trình, đều bị xoá =='
SELECT r.id, s.name AS ncc,
       to_char(r."periodFrom", 'DD/MM/YYYY') AS tu, to_char(r."periodTo", 'DD/MM/YYYY') AS den,
       r."signedBySupplier" AS da_ky, r."closingBalance" AS no_cuoi_da_ky,
       (r."deletedAt" IS NOT NULL) AS da_xoa_mem, r."importRunId" AS import_run,
       (r."periodTo" >= :'ngay_sau_moc') AS vuot_moc, r.note
FROM supplier_reconciliations r
LEFT JOIN suppliers s ON s.id = r."supplierId"
ORDER BY r."supplierId", r."periodFrom", r.id;

\echo
\echo '== 7. DÒNG ĐỢT THANH TOÁN vat_tu THIẾU CÔNG TRÌNH, theo trạng thái đợt =='
\echo '-- (dòng ở đợt đã đóng được giữ nguyên; dòng ở đợt còn mở phải sửa/từ chối trước khi đóng)'
SELECT r.status AS trang_thai_dot, (r."deletedAt" IS NOT NULL) AS dot_da_xoa,
       count(*) AS so_dong, sum(i."soDuyet") AS tong_so_duyet,
       string_agg(i.id::text, ',' ORDER BY i.id) AS ds_id_dong
FROM payment_round_items i
JOIN payment_rounds r ON r.id = i."roundId"
WHERE i.category = 'vat_tu' AND i."projectId" IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;

\echo
\echo '== 8. ĐỢT THANH TOÁN CÒN MỞ có dòng vat_tu — phải đóng / từ chối / xoá qua UI TRƯỚC bước 6 =='
SELECT r.id AS dot, r.month || '-' || r.sequence AS ky_hieu, r.status AS trang_thai,
       count(*) AS so_dong_vat_tu,
       count(*) FILTER (WHERE i."projectId" IS NULL) AS dong_thieu_cong_trinh,
       sum(i."soDeNghi") AS tong_de_nghi, sum(i."soDuyet") AS tong_duyet,
       string_agg(DISTINCT s.name, ', ') AS ncc
FROM payment_rounds r
JOIN payment_round_items i ON i."roundId" = r.id AND i.category = 'vat_tu'
LEFT JOIN suppliers s ON s.id = i."supplierId"
WHERE r."deletedAt" IS NULL AND r.status IN ('draft', 'submitted', 'approved')
GROUP BY r.id, r.month, r.sequence, r.status
ORDER BY r.id;

\echo
\echo '== 9. thanh_toan TỪ ĐỢT ĐÃ ĐÓNG có ngày > 26/10 (được giữ; dùng để ghép "Trả Nợ" sau mốc) =='
SELECT t.id, to_char(t."date", 'DD/MM/YYYY') AS ngay, s.name AS ncc, p.name AS cong_trinh,
       t."totalTt" AS so_tien_tt, r.month || '-' || r.sequence AS dot, i.id AS dong_dot,
       (t."projectId" IS NULL) AS thieu_cong_trinh, (t."deletedAt" IS NOT NULL) AS da_xoa_mem
FROM ledger_transactions t
JOIN payment_round_items i ON i.id = t."paymentRoundItemId"
JOIN payment_rounds r ON r.id = i."roundId"
LEFT JOIN suppliers s ON s.id = t."partyId"
LEFT JOIN projects p ON p.id = t."projectId"
WHERE t."ledgerType" = 'material' AND t."date" >= :'ngay_sau_moc'
ORDER BY t."date", t.id;

\echo
\echo '== 10. SỔ VẬT TƯ ≤ 26/10 CÒN HIỆU LỰC của NCC không giữ (sẽ xoá; Nhập Liệu của file tổng thay thế) =='
SELECT s.name AS ncc, e.name AS chu_the, coalesce(p.name, '(thiếu công trình)') AS cong_trinh,
       count(*) AS so_dong,
       sum(t."totalTt") FILTER (WHERE t."transactionType" = 'lay_hang') AS lay_hang_tt,
       sum(t."totalTt") FILTER (WHERE t."transactionType" = 'thue_hd') AS thue_hd_tt,
       sum(t."totalTt") FILTER (WHERE t."transactionType" = 'thanh_toan') AS thanh_toan_tt,
       sum(t."totalTt") FILTER (WHERE t."transactionType" = 'dieu_chinh') AS dieu_chinh_tt,
       sum(t."totalHd") FILTER (WHERE t."transactionType" = 'lay_hang') AS lay_hang_hd,
       sum(t."totalHd") FILTER (WHERE t."transactionType" = 'thanh_toan') AS thanh_toan_hd
FROM ledger_transactions t
LEFT JOIN suppliers s ON s.id = t."partyId"
LEFT JOIN entities e ON e.id = t."entityId"
LEFT JOIN projects p ON p.id = t."projectId"
WHERE t.id IN (SELECT id FROM vt_pred_ledger_delete) AND t."deletedAt" IS NULL
GROUP BY s.name, e.name, p.name
ORDER BY s.name, e.name, p.name;

\echo
\echo '== 11. CẢNH BÁO — xem trước khi duyệt =='
\echo '-- 11a. Run import cũ có dữ liệu vật tư (dòng của run sẽ bị xoá cùng điều kiện ngày)'
SELECT ir.id, ir.adapter, ir.status, ir."fileName",
       to_char(ir."committedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI') AS ghi_luc,
       (SELECT count(*) FROM ledger_transactions t WHERE t."importRunId" = ir.id AND t."ledgerType" = 'material') AS so_vat_tu,
       (SELECT count(*) FROM ledger_opening_balances o WHERE o."importRunId" = ir.id AND o."ledgerType" = 'material') AS so_du_vat_tu,
       (SELECT count(*) FROM supplier_delivery_daily d WHERE d."importRunId" = ir.id) AS phieu,
       (SELECT count(*) FROM supplier_reconciliations r WHERE r."importRunId" = ir.id) AS ky
FROM import_runs ir
WHERE EXISTS (SELECT 1 FROM ledger_transactions t WHERE t."importRunId" = ir.id AND t."ledgerType" = 'material')
   OR EXISTS (SELECT 1 FROM ledger_opening_balances o WHERE o."importRunId" = ir.id AND o."ledgerType" = 'material')
   OR EXISTS (SELECT 1 FROM supplier_delivery_daily d WHERE d."importRunId" = ir.id)
   OR EXISTS (SELECT 1 FROM supplier_reconciliations r WHERE r."importRunId" = ir.id)
ORDER BY ir.id;

\echo '-- 11b. Dòng sổ ≤ 26/10 sinh từ ĐỢT THANH TOÁN — phải duyệt riêng (action delete_payment_linked)'
SELECT t.id, to_char(t."date", 'DD/MM/YYYY') AS ngay, s.name AS ncc, t."totalTt" AS so_tien_tt,
       r.month || '-' || r.sequence AS dot, t."paymentRoundItemId" AS dong_dot,
       (t."deletedAt" IS NOT NULL) AS da_xoa_mem
FROM ledger_transactions t
LEFT JOIN payment_round_items i ON i.id = t."paymentRoundItemId"
LEFT JOIN payment_rounds r ON r.id = i."roundId"
LEFT JOIN suppliers s ON s.id = t."partyId"
WHERE t.id IN (SELECT id FROM vt_pred_ledger_payment)
ORDER BY t."date", t.id;

\echo '-- 11c. Event phiếu ngày > 26/10 (mọi kỳ đối chiếu bị xoá: phiếu sau mốc đã chốt sẽ không còn kỳ)'
SELECT t.id, to_char(t."date", 'DD/MM/YYYY') AS ngay, s.name AS ncc, t."deliveryId" AS phieu,
       t."totalTt" AS so_tien_tt, (t."deletedAt" IS NOT NULL) AS da_xoa_mem
FROM ledger_transactions t
LEFT JOIN suppliers s ON s.id = t."partyId"
WHERE t."ledgerType" = 'material' AND t."deliveryId" IS NOT NULL AND t."date" >= :'ngay_sau_moc'
ORDER BY t."date", t.id;

\echo '-- 11d. Event trỏ tới phiếu sẽ xoá mà event không thuộc điều kiện xoá (script dọn sẽ DỪNG). Event đã xoá mềm của phiếu sẽ xoá thì bị xoá cùng phiếu, không nằm ở đây.'
SELECT t.id AS event, to_char(t."date", 'DD/MM/YYYY') AS ngay_event,
       d.id AS phieu, to_char(d."date", 'DD/MM/YYYY') AS ngay_phieu,
       (t."deletedAt" IS NOT NULL) AS event_xoa_mem, (d."deletedAt" IS NOT NULL) AS phieu_xoa_mem
FROM ledger_transactions t
JOIN supplier_delivery_daily d ON d.id = t."deliveryId"
WHERE d.id IN (SELECT id FROM vt_pred_delivery_delete)
  AND t.id NOT IN (SELECT id FROM vt_pred_ledger_delete)
ORDER BY t.id;

\echo '-- 11e. Ngày không nằm ở 00:00 (phân loại ≤/> mốc có thể sai — báo kỹ thuật nếu khác 0)'
SELECT 'ledger_transactions' AS bang, count(*) AS so_dong
  FROM ledger_transactions WHERE "ledgerType" = 'material' AND "date" <> date_trunc('day', "date")
UNION ALL
SELECT 'ledger_opening_balances', count(*)
  FROM ledger_opening_balances WHERE "ledgerType" = 'material' AND "asOfDate" <> date_trunc('day', "asOfDate")
UNION ALL
SELECT 'supplier_delivery_daily', count(*)
  FROM supplier_delivery_daily WHERE "date" <> date_trunc('day', "date");

\echo '-- 11f. Dòng sổ (còn hiệu lực) / số dư vật tư KHÔNG bị xoá, đã có công trình, mà Chủ thể của dòng ≠ Chủ thể công trình'
\echo '--      lech / nhieu_chu_the: script dọn sẽ DỪNG — gán / sửa Chủ thể (công trình hoặc dòng) rồi kiểm kê lại.'
\echo '--      chua_co_chu_the: công trình chưa có Chủ thể, dòng cùng một Chủ thể — bước 8 gán đúng Chủ thể đó.'
SELECT c.kind, c.project_id, p.name AS cong_trinh, c.project_entity_id AS chu_the_cong_trinh,
       c.target, c.entity_id AS chu_the_dong, count(*) AS so_dong,
       string_agg(DISTINCT coalesce(s.name, '#' || c.supplier_id), ', ') AS ncc,
       string_agg(c.id::text, ',' ORDER BY c.id) AS ds_id
FROM vt_entity_check c
JOIN projects p ON p.id = c.project_id
LEFT JOIN suppliers s ON s.id = c.supplier_id
GROUP BY c.kind, c.project_id, p.name, c.project_entity_id, c.target, c.entity_id
ORDER BY c.kind, c.project_id, c.target, c.entity_id;

\echo
\echo '== 12. DỮ LIỆU PILOT 07/10 (theo plans/261006-0307-…/reports/pilot-result.md) =='
\echo '-- con_trong_db = còn dòng; trong_dieu_kien_xoa = sẽ bị script dọn xoá theo điều kiện độc lập'
WITH pilot(bang, id, mo_ta) AS (
  SELECT 'supplier_delivery_daily', g, CASE WHEN g <= 6 THEN 'Nam Hương, có sẵn từ 04/08' WHEN g = 7 THEN 'PILOT BTHP kỳ 5' ELSE 'PILOT LT ca' END
    FROM generate_series(1, 9) g
  UNION ALL SELECT 'supplier_price_quotes', g, 'PILOT BG Lộc Tài' FROM generate_series(1, 3) g
  UNION ALL SELECT 'supplier_reconciliations', g, CASE WHEN g <= 2 THEN 'Nam Hương, đã ký' WHEN g = 3 THEN 'BTHP' ELSE 'Lộc Tài' END
    FROM generate_series(1, 4) g
  UNION ALL SELECT 'ledger_transactions', g, CASE WHEN g = 1 THEN 'Nam Hương trả 100.000.000, có sẵn từ 04/08' ELSE 'sổ cái pilot' END
    FROM generate_series(1, 12) g
  UNION ALL SELECT 'ledger_opening_balances', g, CASE g WHEN 1 THEN 'Nam Hương 310.605.120' WHEN 3 THEN 'BTHP 0' ELSE 'Lộc Tài 0' END
    FROM unnest(ARRAY[1, 3, 5]) g
)
SELECT p.bang, p.id, p.mo_ta,
       CASE p.bang
         WHEN 'supplier_delivery_daily' THEN EXISTS (SELECT 1 FROM supplier_delivery_daily x WHERE x.id = p.id)
         WHEN 'supplier_price_quotes' THEN EXISTS (SELECT 1 FROM supplier_price_quotes x WHERE x.id = p.id)
         WHEN 'supplier_reconciliations' THEN EXISTS (SELECT 1 FROM supplier_reconciliations x WHERE x.id = p.id)
         WHEN 'ledger_transactions' THEN EXISTS (SELECT 1 FROM ledger_transactions x WHERE x.id = p.id)
         WHEN 'ledger_opening_balances' THEN EXISTS (SELECT 1 FROM ledger_opening_balances x WHERE x.id = p.id)
       END AS con_trong_db,
       CASE p.bang
         WHEN 'supplier_delivery_daily' THEN p.id IN (SELECT id FROM vt_pred_delivery_delete)
         WHEN 'supplier_price_quotes' THEN p.id IN (SELECT id FROM vt_pred_quote_delete)
         WHEN 'supplier_reconciliations' THEN p.id IN (SELECT id FROM vt_pred_recon_delete)
         WHEN 'ledger_transactions' THEN p.id IN (SELECT id FROM vt_pred_ledger_delete)
         WHEN 'ledger_opening_balances' THEN p.id IN (SELECT id FROM vt_pred_opening_delete)
       END AS trong_dieu_kien_xoa
FROM pilot p
ORDER BY p.bang, p.id;

-- -----------------------------------------------------------------------------
-- 13. DANH SÁCH ĐỀ XUẤT → /tmp/cutover/candidates.csv (khuôn approved.csv)
--
-- ĐIỀU KIỆN ĐỘC LẬP = các view vt_pred_* ở đầu tệp (chép nguyên văn từ script dọn). "NCC giữ" =
-- NCC trong keep-suppliers.csv (chỉ khi chạy với -v giu_ncc=on).
--   reconciliation/delete : mọi kỳ đối chiếu (kể cả xoá mềm) — migration đòi bảng rỗng.
--   ledger/delete         : material AND ((date ≤ 26/10 AND NCC không giữ) OR (thiếu công trình AND đã
--                           xoá mềm) OR (đã xoá mềm AND trỏ tới phiếu sẽ xoá)).
--                           Dòng có paymentRoundItemId phải đổi action thành delete_payment_linked.
--   ledger/assign         : material AND thiếu công trình AND chưa xoá mềm AND (date > 26/10 OR NCC giữ).
--   opening/delete        : material AND asOf ≤ 26/10 AND NCC không giữ (Số Dư Ban Đầu của file tổng thay thế).
--   opening/assign        : material AND thiếu công trình AND (asOf > 26/10 OR NCC giữ).
--   delivery/delete       : (date ≤ 26/10 AND NCC không giữ) OR (thiếu công trình AND đã xoá mềm).
--   delivery/assign       : thiếu công trình AND chưa xoá mềm AND (date > 26/10 OR NCC giữ).
--   quote/delete          : note bắt đầu bằng 'PILOT'.
-- project_id của dòng assign: gợi ý từ phiếu / dòng đợt nếu có, còn lại để trống — PHẢI điền.
-- -----------------------------------------------------------------------------
\echo
\echo '== 13. Đang ghi danh sách đề xuất vào /tmp/cutover/candidates.csv =='
\pset format csv
\pset null ''
\pset footer off
\o /tmp/cutover/candidates.csv
SELECT target, action, id, project_id, note
FROM (
  SELECT 1 AS ord, 'reconciliation' AS target, 'delete' AS action, r.id, NULL::integer AS project_id,
         concat_ws(' | ', 'NCC ' || coalesce(s.name, '#' || r."supplierId"),
                   to_char(r."periodFrom", 'DD/MM/YYYY') || '→' || to_char(r."periodTo", 'DD/MM/YYYY'),
                   CASE WHEN r."signedBySupplier" THEN 'ĐÃ KÝ' ELSE 'chưa ký' END,
                   CASE WHEN r."deletedAt" IS NOT NULL THEN 'đã xoá mềm' END,
                   CASE WHEN r."importRunId" IS NOT NULL THEN 'import #' || r."importRunId" END) AS note
  FROM supplier_reconciliations r
  LEFT JOIN suppliers s ON s.id = r."supplierId"

  UNION ALL
  SELECT 2, 'ledger', 'delete', t.id, NULL::integer,
         concat_ws(' | ', 'NCC ' || coalesce(s.name, '#' || t."partyId"), to_char(t."date", 'DD/MM/YYYY'),
                   t."transactionType", 'TT ' || t."totalTt", 'HĐ ' || t."totalHd",
                   'công trình ' || coalesce(p.name, '(trống)'),
                   CASE
                     WHEN t."importRunId" IS NOT NULL THEN 'import #' || t."importRunId"
                     WHEN t."deliveryId" IS NOT NULL THEN 'event phiếu #' || t."deliveryId"
                     WHEN t."paymentRoundItemId" IS NULL THEN 'nhập tay'
                   END,
                   CASE WHEN t."deletedAt" IS NOT NULL THEN 'đã xoá mềm' END,
                   CASE WHEN t."deletedAt" IS NOT NULL AND t."deliveryId" IN (SELECT id FROM vt_pred_delivery_delete)
                        THEN 'event của phiếu sẽ xoá — xoá cùng phiếu' END,
                   CASE WHEN t."paymentRoundItemId" IS NOT NULL THEN
                     'DÒNG ĐỢT THANH TOÁN #' || t."paymentRoundItemId"
                     || ' — đối chiếu với "Trả Nợ" trong Nhập Liệu rồi đổi action thành delete_payment_linked' END)
  FROM ledger_transactions t
  LEFT JOIN suppliers s ON s.id = t."partyId"
  LEFT JOIN projects p ON p.id = t."projectId"
  WHERE t.id IN (SELECT id FROM vt_pred_ledger_delete)

  UNION ALL
  SELECT 3, 'ledger', 'assign', t.id, coalesce(d."projectId", i."projectId"),
         concat_ws(' | ', 'NCC ' || coalesce(s.name, '#' || t."partyId"), to_char(t."date", 'DD/MM/YYYY'),
                   t."transactionType", 'TT ' || t."totalTt", 'Chủ thể #' || t."entityId",
                   CASE WHEN coalesce(d."projectId", i."projectId") IS NOT NULL
                        THEN 'project_id gợi ý từ ' || CASE WHEN d."projectId" IS NOT NULL THEN 'phiếu' ELSE 'dòng đợt' END
                        ELSE 'ĐIỀN project_id' END)
  FROM ledger_transactions t
  LEFT JOIN suppliers s ON s.id = t."partyId"
  LEFT JOIN supplier_delivery_daily d ON d.id = t."deliveryId"
  LEFT JOIN payment_round_items i ON i.id = t."paymentRoundItemId"
  WHERE t.id IN (SELECT id FROM vt_pred_ledger_assign)

  UNION ALL
  SELECT 4, 'opening', 'delete', o.id, NULL::integer,
         concat_ws(' | ', 'NCC ' || coalesce(s.name, '#' || o."partyId"), 'asOf ' || to_char(o."asOfDate", 'DD/MM/YYYY'),
                   'TT ' || o."balanceTt", 'HĐ ' || o."balanceHd", 'công trình ' || coalesce(p.name, '(trống)'),
                   CASE WHEN o."importRunId" IS NOT NULL THEN 'import #' || o."importRunId" END)
  FROM ledger_opening_balances o
  LEFT JOIN suppliers s ON s.id = o."partyId"
  LEFT JOIN projects p ON p.id = o."projectId"
  WHERE o.id IN (SELECT id FROM vt_pred_opening_delete)

  UNION ALL
  SELECT 5, 'opening', 'assign', o.id, NULL::integer,
         concat_ws(' | ', 'NCC ' || coalesce(s.name, '#' || o."partyId"), 'asOf ' || to_char(o."asOfDate", 'DD/MM/YYYY'),
                   'TT ' || o."balanceTt", 'Chủ thể #' || o."entityId", 'ĐIỀN project_id')
  FROM ledger_opening_balances o
  LEFT JOIN suppliers s ON s.id = o."partyId"
  WHERE o.id IN (SELECT id FROM vt_pred_opening_assign)

  UNION ALL
  SELECT 6, 'delivery', 'delete', d.id, NULL::integer,
         concat_ws(' | ', 'NCC ' || coalesce(s.name, '#' || d."supplierId"), to_char(d."date", 'DD/MM/YYYY'),
                   coalesce(i.name, 'vật tư #' || d."itemId") || ' ' || d.qty || ' ' || d.unit,
                   'công trình ' || coalesce(p.name, '(trống)'),
                   CASE WHEN d."importRunId" IS NOT NULL THEN 'import #' || d."importRunId" END,
                   CASE WHEN d."deletedAt" IS NOT NULL THEN 'đã xoá mềm' END, d.note)
  FROM supplier_delivery_daily d
  LEFT JOIN suppliers s ON s.id = d."supplierId"
  LEFT JOIN items i ON i.id = d."itemId"
  LEFT JOIN projects p ON p.id = d."projectId"
  WHERE d.id IN (SELECT id FROM vt_pred_delivery_delete)

  UNION ALL
  SELECT 7, 'delivery', 'assign', d.id, NULL::integer,
         concat_ws(' | ', 'NCC ' || coalesce(s.name, '#' || d."supplierId"), to_char(d."date", 'DD/MM/YYYY'),
                   coalesce(i.name, 'vật tư #' || d."itemId") || ' ' || d.qty || ' ' || d.unit, 'ĐIỀN project_id', d.note)
  FROM supplier_delivery_daily d
  LEFT JOIN suppliers s ON s.id = d."supplierId"
  LEFT JOIN items i ON i.id = d."itemId"
  WHERE d.id IN (SELECT id FROM vt_pred_delivery_assign)

  UNION ALL
  SELECT 8, 'quote', 'delete', q.id, NULL::integer,
         concat_ws(' | ', 'NCC ' || coalesce(s.name, '#' || q."supplierId"), coalesce(i.name, 'vật tư #' || q."itemId"),
                   'giá ' || q."unitPrice", 'từ ' || to_char(q."effectiveFrom", 'DD/MM/YYYY'), q.note)
  FROM supplier_price_quotes q
  LEFT JOIN suppliers s ON s.id = q."supplierId"
  LEFT JOIN items i ON i.id = q."itemId"
  WHERE q.id IN (SELECT id FROM vt_pred_quote_delete)
) c
ORDER BY ord, id;
\o
\pset footer on
\pset null '(null)'
\pset format wrapped

\echo
\echo '-- Số dòng đề xuất theo target/action (phải khớp candidates.csv)'
SELECT target, action, count(*) AS so_dong
FROM (
  SELECT 'reconciliation' AS target, 'delete' AS action FROM vt_pred_recon_delete
  UNION ALL
  SELECT 'ledger', CASE WHEN "paymentRoundItemId" IS NOT NULL THEN 'delete (đợt TT: đổi thành delete_payment_linked)' ELSE 'delete' END
    FROM ledger_transactions WHERE id IN (SELECT id FROM vt_pred_ledger_delete)
  UNION ALL
  SELECT 'ledger', 'assign' FROM vt_pred_ledger_assign
  UNION ALL
  SELECT 'opening', 'delete' FROM vt_pred_opening_delete
  UNION ALL
  SELECT 'opening', 'assign' FROM vt_pred_opening_assign
  UNION ALL
  SELECT 'delivery', 'delete' FROM vt_pred_delivery_delete
  UNION ALL
  SELECT 'delivery', 'assign' FROM vt_pred_delivery_assign
  UNION ALL
  SELECT 'quote', 'delete' FROM vt_pred_quote_delete
) s
GROUP BY target, action
ORDER BY target, action;

\echo
\echo '== 14. THEO NCC — dòng ≤ 26/10 sẽ bị XOÁ (đối chiếu với danh sách NCC trong gói Excel: Nhập Liệu / Số Dư / CSV / file theo dõi) =='
\echo '-- NCC có dòng sẽ xoá mà KHÔNG có trong gói Excel sẽ mất lịch sử tới 26/10 (import không bù lại):'
\echo '-- thêm NCC đó vào keep-suppliers.csv, chạy lại kiểm kê với -v giu_ncc=on rồi duyệt lại.'
\echo '-- giu = NCC đang trong keep-suppliers.csv (dòng ≤ 26/10 được giữ, cột *_giu).'
SELECT x.supplier_id, s.name AS ncc,
       (x.supplier_id IN (SELECT supplier_id FROM vt_keep_suppliers)) AS giu,
       count(*) FILTER (WHERE x.bang = 'ledger' AND x.xoa) AS so_xoa,
       count(*) FILTER (WHERE x.bang = 'ledger' AND x.xoa AND x.con_hieu_luc) AS so_xoa_con_hieu_luc,
       sum(x.tien_tt) FILTER (WHERE x.bang = 'ledger' AND x.xoa AND x.con_hieu_luc) AS so_xoa_tong_tt,
       count(*) FILTER (WHERE x.bang = 'opening' AND x.xoa) AS so_du_xoa,
       sum(x.tien_tt) FILTER (WHERE x.bang = 'opening' AND x.xoa) AS so_du_xoa_tt,
       count(*) FILTER (WHERE x.bang = 'delivery' AND x.xoa) AS phieu_xoa,
       count(*) FILTER (WHERE x.bang = 'ledger' AND NOT x.xoa) AS so_giu,
       count(*) FILTER (WHERE x.bang = 'opening' AND NOT x.xoa) AS so_du_giu,
       count(*) FILTER (WHERE x.bang = 'delivery' AND NOT x.xoa) AS phieu_giu
FROM (
  SELECT 'ledger' AS bang, t."partyId" AS supplier_id, t."totalTt" AS tien_tt, (t."deletedAt" IS NULL) AS con_hieu_luc,
         t.id IN (SELECT id FROM vt_pred_ledger_delete) AS xoa
    FROM ledger_transactions t
   WHERE t."ledgerType" = 'material' AND t."date" < :'ngay_sau_moc'
  UNION ALL
  SELECT 'opening', o."partyId", o."balanceTt", true, o.id IN (SELECT id FROM vt_pred_opening_delete)
    FROM ledger_opening_balances o
   WHERE o."ledgerType" = 'material' AND o."asOfDate" < :'ngay_sau_moc'
  UNION ALL
  SELECT 'delivery', d."supplierId", d."totalAmount", (d."deletedAt" IS NULL), d.id IN (SELECT id FROM vt_pred_delivery_delete)
    FROM supplier_delivery_daily d
   WHERE d."date" < :'ngay_sau_moc'
) x
LEFT JOIN suppliers s ON s.id = x.supplier_id
GROUP BY x.supplier_id, s.name
ORDER BY s.name, x.supplier_id;

ROLLBACK;
\echo
\echo 'Xong kiểm kê (chỉ đọc, đã ROLLBACK). Danh sách đề xuất: /tmp/cutover/candidates.csv'
