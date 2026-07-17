-- Canonical ACL business levels: read | comment | create | edit.
-- This migration is intentionally transactional: unexpected legacy data aborts
-- before a permission row can be rewritten or removed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "module_permissions"
    WHERE "level" NOT IN ('read', 'comment', 'edit', 'admin')
       OR "moduleKey" NOT IN (
         'dashboard', 'master-data', 'du-an', 'vat-tu-ncc', 'sl-dt',
         'cong-no-vt', 'cong-no-nc', 'tai-chinh', 'thanh-toan.ke-hoach',
         'thanh-toan.tong-hop', 'van-hanh.cong-viec',
         'van-hanh.phieu-phoi-hop', 'van-hanh.hieu-suat', 'thong-bao',
         'admin.import', 'admin.phong-ban', 'admin.nguoi-dung', 'admin.permissions'
       )
  ) THEN RAISE EXCEPTION 'Unexpected module_permissions ACL data'; END IF;

  IF EXISTS (
    SELECT 1 FROM "role_permissions"
    WHERE "level" NOT IN ('read', 'comment', 'edit', 'admin')
       OR "moduleKey" NOT IN (
         'dashboard', 'master-data', 'du-an', 'vat-tu-ncc', 'sl-dt',
         'cong-no-vt', 'cong-no-nc', 'tai-chinh', 'thanh-toan.ke-hoach',
         'thanh-toan.tong-hop', 'van-hanh.cong-viec',
         'van-hanh.phieu-phoi-hop', 'van-hanh.hieu-suat', 'thong-bao',
         'admin.import', 'admin.phong-ban', 'admin.nguoi-dung', 'admin.permissions'
       )
  ) THEN RAISE EXCEPTION 'Unexpected role_permissions ACL data'; END IF;

  IF EXISTS (SELECT 1 FROM "project_permissions" WHERE "level" NOT IN ('read', 'comment', 'edit', 'admin'))
  THEN RAISE EXCEPTION 'Unexpected project_permissions ACL level'; END IF;
  IF EXISTS (SELECT 1 FROM "project_grant_all" WHERE "level" NOT IN ('read', 'comment', 'edit', 'admin'))
  THEN RAISE EXCEPTION 'Unexpected project_grant_all ACL level'; END IF;
  IF EXISTS (SELECT 1 FROM "user_dept_access" WHERE "level" NOT IN ('read', 'comment', 'edit', 'admin'))
  THEN RAISE EXCEPTION 'Unexpected user_dept_access ACL level'; END IF;
END $$;

ALTER TABLE "module_permissions" DROP CONSTRAINT IF EXISTS "module_permissions_level_chk";
ALTER TABLE "project_permissions" DROP CONSTRAINT IF EXISTS "project_permissions_level_chk";
ALTER TABLE "project_grant_all" DROP CONSTRAINT IF EXISTS "project_grant_all_level_chk";

ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_level_transition_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit', 'admin'));
ALTER TABLE "project_permissions" ADD CONSTRAINT "project_permissions_level_transition_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit', 'admin'));
ALTER TABLE "project_grant_all" ADD CONSTRAINT "project_grant_all_level_transition_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit', 'admin'));
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_level_transition_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit', 'admin'));
ALTER TABLE "user_dept_access" ADD CONSTRAINT "user_dept_access_level_transition_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit', 'admin'));

UPDATE "module_permissions" SET "level" = 'edit' WHERE "level" = 'admin';
UPDATE "project_permissions" SET "level" = 'edit' WHERE "level" = 'admin';
UPDATE "project_grant_all" SET "level" = 'edit' WHERE "level" = 'admin';
UPDATE "role_permissions" SET "level" = 'edit' WHERE "level" = 'admin';
UPDATE "user_dept_access" SET "level" = 'edit' WHERE "level" = 'admin';

UPDATE "module_permissions" SET "level" = 'read' WHERE "moduleKey" = 'thanh-toan.tong-hop';
UPDATE "role_permissions" SET "level" = 'read' WHERE "moduleKey" = 'thanh-toan.tong-hop';

DELETE FROM "module_permissions" WHERE "moduleKey" IN (
  'master-data', 'sl-dt', 'tai-chinh', 'admin.import', 'admin.phong-ban',
  'admin.nguoi-dung', 'admin.permissions'
);
DELETE FROM "role_permissions" WHERE "moduleKey" IN (
  'master-data', 'sl-dt', 'tai-chinh', 'admin.import', 'admin.phong-ban',
  'admin.nguoi-dung', 'admin.permissions'
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "module_permissions" WHERE "level" = 'admin')
     OR EXISTS (SELECT 1 FROM "project_permissions" WHERE "level" = 'admin')
     OR EXISTS (SELECT 1 FROM "project_grant_all" WHERE "level" = 'admin')
     OR EXISTS (SELECT 1 FROM "role_permissions" WHERE "level" = 'admin')
     OR EXISTS (SELECT 1 FROM "user_dept_access" WHERE "level" = 'admin')
  THEN RAISE EXCEPTION 'ACL admin business level remained after backfill'; END IF;
END $$;

ALTER TABLE "module_permissions" DROP CONSTRAINT "module_permissions_level_transition_chk";
ALTER TABLE "project_permissions" DROP CONSTRAINT "project_permissions_level_transition_chk";
ALTER TABLE "project_grant_all" DROP CONSTRAINT "project_grant_all_level_transition_chk";
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_level_transition_chk";
ALTER TABLE "user_dept_access" DROP CONSTRAINT "user_dept_access_level_transition_chk";

ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_level_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit'));
ALTER TABLE "project_permissions" ADD CONSTRAINT "project_permissions_level_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit'));
ALTER TABLE "project_grant_all" ADD CONSTRAINT "project_grant_all_level_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit'));
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_level_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit'));
ALTER TABLE "user_dept_access" ADD CONSTRAINT "user_dept_access_level_chk" CHECK ("level" IN ('read', 'comment', 'create', 'edit'));
