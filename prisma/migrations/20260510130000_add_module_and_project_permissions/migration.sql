-- ACL: Module and Project Permission tables
-- Phase 1 of van-hanh-acl-refactor plan

-- ModulePermission: composite PK (userId, moduleKey)
CREATE TABLE "module_permissions" (
  "userId"    TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "level"     TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grantedBy" TEXT,

  CONSTRAINT "module_permissions_pkey" PRIMARY KEY ("userId", "moduleKey"),
  CONSTRAINT "module_permissions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "module_permissions_grantedBy_fkey"
    FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "module_permissions_level_chk"
    CHECK (level IN ('read', 'comment', 'edit', 'admin'))
);

CREATE INDEX "module_permissions_userId_idx" ON "module_permissions"("userId");

-- ProjectPermission: composite PK (userId, projectId)
CREATE TABLE "project_permissions" (
  "userId"    TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "level"     TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grantedBy" TEXT,

  CONSTRAINT "project_permissions_pkey" PRIMARY KEY ("userId", "projectId"),
  CONSTRAINT "project_permissions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_permissions_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_permissions_grantedBy_fkey"
    FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "project_permissions_level_chk"
    CHECK (level IN ('read', 'comment', 'edit', 'admin'))
);

CREATE INDEX "project_permissions_userId_idx"    ON "project_permissions"("userId");
CREATE INDEX "project_permissions_projectId_idx" ON "project_permissions"("projectId");

-- ProjectGrantAll: PK userId (one row max per user)
CREATE TABLE "project_grant_all" (
  "userId"    TEXT NOT NULL,
  "level"     TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grantedBy" TEXT,

  CONSTRAINT "project_grant_all_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "project_grant_all_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_grant_all_grantedBy_fkey"
    FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "project_grant_all_level_chk"
    CHECK (level IN ('read', 'comment', 'edit', 'admin'))
);
