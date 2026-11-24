-- Hoàn tác migration 20261118120000_du_an_danh_muc_hop_dong.
--
-- TRƯỚC KHI CHẠY: rollback build trước; chỉ chạy tệp này khi thật cần. Ba phần dưới sẽ MẤT,
-- phải xuất CSV trước (psql, \copy chạy phía client):
--   \copy (SELECT id, "projectId", "docName", "partyKind", "supplierId", "contractorId", "valueTtVnd" FROM project_contracts WHERE "partyKind" IS NOT NULL OR "valueTtVnd" IS NOT NULL) TO 'hop-dong-doi-tac.csv' CSV HEADER
--   \copy (SELECT * FROM project_contract_attachments) TO 'hop-dong-ban-scan.csv' CSV HEADER
--   \copy (SELECT * FROM project_cdt_invoices) TO 'hoa-don-xuat-cdt.csv' CSV HEADER
-- Tệp scan trên đĩa (UPLOAD_DIR/contract-scans/) không bị xóa; giữ lại cùng CSV.

BEGIN;

DROP TABLE IF EXISTS "project_contract_attachments";
DROP TABLE IF EXISTS "project_cdt_invoices";

ALTER TABLE "project_contracts" DROP CONSTRAINT IF EXISTS "project_contracts_party_kind_check";
ALTER TABLE "project_contracts" DROP CONSTRAINT IF EXISTS "project_contracts_party_binding_check";
ALTER TABLE "project_contracts" DROP CONSTRAINT IF EXISTS "project_contracts_party_doc_type_check";
ALTER TABLE "project_contracts" DROP CONSTRAINT IF EXISTS "project_contracts_value_tt_nonneg";
ALTER TABLE "project_contracts" DROP CONSTRAINT IF EXISTS "project_contracts_supplierId_fkey";
ALTER TABLE "project_contracts" DROP CONSTRAINT IF EXISTS "project_contracts_contractorId_fkey";

DROP INDEX IF EXISTS "project_contracts_project_supplier_active_idx";
DROP INDEX IF EXISTS "project_contracts_project_contractor_active_idx";

ALTER TABLE "project_contracts"
  DROP COLUMN IF EXISTS "partyKind",
  DROP COLUMN IF EXISTS "supplierId",
  DROP COLUMN IF EXISTS "contractorId",
  DROP COLUMN IF EXISTS "valueTtVnd";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118120000_du_an_danh_muc_hop_dong';

COMMIT;
