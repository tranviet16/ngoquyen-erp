-- Drop old plain unique indexes (replaced by partial unique indexes below)
DROP INDEX "contractors_name_key";
DROP INDEX "entities_name_key";
DROP INDEX "items_code_key";
DROP INDEX "project_categories_projectId_code_key";
DROP INDEX "projects_code_key";
DROP INDEX "suppliers_name_key";

-- Add createdAt / updatedAt to project_categories (M5 fix)
-- Keep DEFAULT on updatedAt: Prisma 7 driver adapter doesn't auto-populate @updatedAt on create
ALTER TABLE "project_categories"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add query-support plain indexes (non-unique, for Prisma @@index)
CREATE INDEX "entities_name_idx" ON "entities"("name");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE INDEX "contractors_name_idx" ON "contractors"("name");
CREATE INDEX "projects_code_idx" ON "projects"("code");
CREATE INDEX "project_categories_projectId_code_idx" ON "project_categories"("projectId", "code");
CREATE INDEX "items_code_idx" ON "items"("code");

-- Partial unique indexes: only enforce uniqueness on active (non-deleted) rows (H1 fix)
CREATE UNIQUE INDEX "entities_name_active_unique"
  ON "entities"("name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "suppliers_name_active_unique"
  ON "suppliers"("name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "contractors_name_active_unique"
  ON "contractors"("name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "projects_code_active_unique"
  ON "projects"("code") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "project_categories_projectid_code_active_unique"
  ON "project_categories"("projectId", "code") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "items_code_active_unique"
  ON "items"("code") WHERE "deletedAt" IS NULL;
