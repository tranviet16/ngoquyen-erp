-- Chuẩn hoá ngày sổ cái về ngày nghiệp vụ Asia/Bangkok tại UTC 00:00.
-- DỮ LIỆU THUẦN, không đổi schema. BẮT BUỘC sao lưu DB (pg_dump / scripts/backup-db.sh) trước khi chạy.
--
-- Cột "date" là TIMESTAMP(3) KHÔNG múi giờ; Prisma ghi giá trị theo UTC. Biểu thức:
--   ("date" AT TIME ZONE 'UTC')            -> timestamptz (hiểu giá trị lưu là UTC)
--   ... AT TIME ZONE 'Asia/Bangkok'        -> timestamp giờ Bangkok
--   ::date::timestamp                      -> nửa đêm của ngày Bangkok, lưu như UTC 00:00
-- Ví dụ: 2026-05-26 19:00 (02:00 27/5 Bangkok, đợt thanh toán) -> 2026-05-27 00:00
--        2026-05-31 17:00 (import Excel, nửa đêm giờ máy chủ)   -> 2026-06-01 00:00
-- Chỉ động vào dòng còn lệch (date <> date_trunc('day', date)) nên chạy lại an toàn (idempotent).
-- Không đụng invoiceDate / asOfDate (không tham gia cửa sổ truy vấn).

UPDATE "ledger_transactions"
SET "date" = (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date::timestamp
WHERE "date" <> date_trunc('day', "date");

UPDATE "supplier_delivery_daily"
SET "date" = (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date::timestamp
WHERE "date" <> date_trunc('day', "date");
