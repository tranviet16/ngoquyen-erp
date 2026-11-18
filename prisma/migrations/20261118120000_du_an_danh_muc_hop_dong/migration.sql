-- Danh mục hợp đồng dự án: gắn đối tác có mã, giá trị theo TT, bản scan, sổ hóa đơn xuất CĐT.
-- Chỉ thêm (additive): build cũ vẫn đọc / tạo / sửa hợp đồng chưa gắn đối tác được.
-- Rollback: plans/261118-1016-danh-muc-hop-dong-du-an/rollback-danh-muc-hop-dong.sql

-- AlterTable
ALTER TABLE "project_contracts" ADD COLUMN     "contractorId" INTEGER,
ADD COLUMN     "partyKind" TEXT,
ADD COLUMN     "supplierId" INTEGER,
ADD COLUMN     "valueTtVnd" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "project_contract_attachments" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_contract_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_cdt_invoices" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "invoiceSymbol" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "amountVnd" DECIMAL(18,2) NOT NULL,
    "vatVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "acceptanceBatch" TEXT,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_cdt_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_contract_attachments_storedPath_key" ON "project_contract_attachments"("storedPath");

-- CreateIndex
CREATE INDEX "project_contract_attachments_contractId_createdAt_idx" ON "project_contract_attachments"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "project_contract_attachments_uploaderId_idx" ON "project_contract_attachments"("uploaderId");

-- CreateIndex
CREATE INDEX "project_cdt_invoices_projectId_invoiceDate_idx" ON "project_cdt_invoices"("projectId", "invoiceDate");

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contract_attachments" ADD CONSTRAINT "project_contract_attachments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contract_attachments" ADD CONSTRAINT "project_contract_attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cdt_invoices" ADD CONSTRAINT "project_cdt_invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Ràng buộc viết tay (Prisma không biểu diễn được) ──

-- Đối tác của hợp đồng: đúng bốn tổ hợp, chỉ hợp đồng kinh tế mới gắn được.
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_party_kind_check"
  CHECK ("partyKind" IS NULL OR "partyKind" IN ('ncc','doi_thi_cong','cdt'));
-- Viết bằng CASE để mọi nhánh ra true/false: dạng OR với "partyKind" = '…' cho ra NULL khi
-- "partyKind" NULL, và CHECK coi NULL là qua (sẽ lọt dòng không loại mà có supplierId).
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_party_binding_check" CHECK (
  CASE "partyKind"
    WHEN 'ncc'          THEN "supplierId" IS NOT NULL AND "contractorId" IS NULL
    WHEN 'doi_thi_cong' THEN "contractorId" IS NOT NULL AND "supplierId" IS NULL
    WHEN 'cdt'          THEN "supplierId" IS NULL AND "contractorId" IS NULL
    ELSE "partyKind" IS NULL AND "supplierId" IS NULL AND "contractorId" IS NULL
  END
);
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_party_doc_type_check"
  CHECK ("partyKind" IS NULL OR "docType" = 'contract');
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_value_tt_nonneg"
  CHECK ("valueTtVnd" IS NULL OR "valueTtVnd" >= 0);

-- Tra nhóm gộp (cùng đối tác, cùng công trình).
CREATE INDEX "project_contracts_project_supplier_active_idx"
  ON "project_contracts" ("projectId", "supplierId") WHERE "deletedAt" IS NULL AND "supplierId" IS NOT NULL;
CREATE INDEX "project_contracts_project_contractor_active_idx"
  ON "project_contracts" ("projectId", "contractorId") WHERE "deletedAt" IS NULL AND "contractorId" IS NOT NULL;

-- Bản scan: chỉ PDF / JPG / PNG, tối đa 25 MB.
ALTER TABLE "project_contract_attachments" ADD CONSTRAINT "project_contract_attachments_mime_check"
  CHECK ("mimeType" IN ('application/pdf','image/jpeg','image/png'));
ALTER TABLE "project_contract_attachments" ADD CONSTRAINT "project_contract_attachments_size_check"
  CHECK ("sizeBytes" BETWEEN 1 AND 26214400);

-- Hóa đơn xuất CĐT: có số, khác 0 (âm = điều chỉnh giảm), không trùng (ký hiệu, số) trong công trình.
ALTER TABLE "project_cdt_invoices" ADD CONSTRAINT "project_cdt_invoices_invoice_no_check"
  CHECK (length(btrim("invoiceNo")) > 0);
ALTER TABLE "project_cdt_invoices" ADD CONSTRAINT "project_cdt_invoices_amount_nonzero"
  CHECK ("amountVnd" <> 0);
CREATE UNIQUE INDEX "project_cdt_invoices_symbol_no_active_unique"
  ON "project_cdt_invoices" ("projectId", "invoiceSymbol", "invoiceNo") NULLS NOT DISTINCT
  WHERE "deletedAt" IS NULL;
