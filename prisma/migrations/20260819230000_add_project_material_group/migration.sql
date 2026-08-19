-- Nhóm vật liệu thay thế cho nhau (per-project); định mức đánh giá theo nhóm
CREATE TABLE "project_material_groups" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_material_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_material_groups_projectId_idx" ON "project_material_groups"("projectId");

-- Một dự án không có 2 nhóm cùng tên còn hiệu lực
CREATE UNIQUE INDEX "project_material_groups_projectid_name_active_unique"
  ON "project_material_groups"("projectId", "name") WHERE "deletedAt" IS NULL;

ALTER TABLE "project_estimates" ADD COLUMN "materialGroupId" INTEGER;

ALTER TABLE "project_estimates" ADD CONSTRAINT "project_estimates_materialGroupId_fkey"
  FOREIGN KEY ("materialGroupId") REFERENCES "project_material_groups"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "project_estimates_materialGroupId_idx" ON "project_estimates"("materialGroupId");
