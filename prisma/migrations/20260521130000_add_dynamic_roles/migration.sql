-- Dynamic RBAC: role definitions + per-role per-module permission matrix.
-- `users.role` is a soft reference to `roles.id` (slug) — no hard FK.

CREATE TABLE IF NOT EXISTS "roles" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
    "roleId"    TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "level"     TEXT NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "moduleKey")
);

CREATE INDEX IF NOT EXISTS "role_permissions_roleId_idx" ON "role_permissions"("roleId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'role_permissions_roleId_fkey'
    ) THEN
        ALTER TABLE "role_permissions"
            ADD CONSTRAINT "role_permissions_roleId_fkey"
            FOREIGN KEY ("roleId") REFERENCES "roles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
