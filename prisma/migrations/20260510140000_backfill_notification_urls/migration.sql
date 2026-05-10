-- Notification URL backfill: update old route paths to new /van-hanh/* paths.
-- The Notification model maps to "notifications" table; URL column is "link" (nullable).
-- Run AFTER 307 redirects are active (Stage 2 of rolling deploy).
-- Idempotent: rows already updated will not match the WHERE clause.

UPDATE "notifications"
SET "link" = REPLACE("link", '/cong-viec/', '/van-hanh/cong-viec/')
WHERE "link" LIKE '/cong-viec/%';

UPDATE "notifications"
SET "link" = REPLACE("link", '/phieu-phoi-hop/', '/van-hanh/phieu-phoi-hop/')
WHERE "link" LIKE '/phieu-phoi-hop/%';
