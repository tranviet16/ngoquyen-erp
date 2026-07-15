-- User org-position title (chức danh) — display layer, distinct from functional `role`.
-- Better Auth username plugin fields: username (login id) + displayUsername (as-entered).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "displayUsername" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");
