-- Đối chiếu DT-HĐ-TT (dự án xây dựng): sổ của đội — hóa đơn, thực tế nhập, chi thực tế — cùng mã nhóm,
-- ánh xạ, đầu mối; đánh dấu dòng dự toán / giao dịch bị thay khi import và giao dịch sinh từ hóa đơn;
-- tỷ lệ Phần III trên cài đặt dự án. Chỉ thêm bảng / cột (nullable hoặc có mặc định): không đổi dữ liệu cũ.
-- AlterTable
ALTER TABLE "project_estimates" ADD COLUMN     "supersededByRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_transactions" ADD COLUMN     "sourceInvoiceLineId" INTEGER,
ADD COLUMN     "supersededByRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_settings" ADD COLUMN     "generalCostPct" DECIMAL(5,4) NOT NULL DEFAULT 0.07,
ADD COLUMN     "presumptiveIncomePct" DECIMAL(5,4) NOT NULL DEFAULT 0.06,
ADD COLUMN     "tempHousingPct" DECIMAL(5,4) NOT NULL DEFAULT 0.01,
ADD COLUMN     "unmeasuredPct" DECIMAL(5,4) NOT NULL DEFAULT 0.03;

-- CreateTable
CREATE TABLE "project_group_codes" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "counterpartyId" INTEGER,
    "isMainMaterial" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_group_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_item_aliases" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "groupCodeId" INTEGER,
    "kind" TEXT,
    "dtKey" TEXT,
    "factor" DECIMAL(18,6),
    "status" TEXT NOT NULL DEFAULT 'de_xuat',
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_item_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_counterparties" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortGroup" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "actualBasis" TEXT NOT NULL DEFAULT 'manual',
    "actualManualVnd" DECIMAL(18,2),
    "paymentSection" TEXT,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_counterparty_suppliers" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "counterpartyId" INTEGER,
    "supplierId" INTEGER NOT NULL,
    "splitActualVnd" DECIMAL(18,2),
    "paidOverrideVnd" DECIMAL(18,2),
    "recoveredVnd" DECIMAL(18,2),
    "todoNote" TEXT,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_counterparty_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_invoice_lines" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "invoiceDateText" TEXT,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "qty" DECIMAL(18,4),
    "unitPrice" DECIMAL(18,2),
    "amountVnd" DECIMAL(18,2) NOT NULL,
    "vatPct" DECIMAL(5,4),
    "vatVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_actual_receipts" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "dateText" TEXT,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "qty" DECIMAL(18,4),
    "unitPrice" DECIMAL(18,2),
    "amountVnd" DECIMAL(18,2) NOT NULL,
    "counterpartyId" INTEGER,
    "blockNo" INTEGER,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_actual_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_cash_payments" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "dateText" TEXT,
    "content" TEXT NOT NULL,
    "bankVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cashVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "section" TEXT NOT NULL,
    "counterpartyId" INTEGER,
    "supplierId" INTEGER,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_cash_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_group_codes_projectId_idx" ON "project_group_codes"("projectId");

-- CreateIndex
CREATE INDEX "project_group_codes_importRunId_idx" ON "project_group_codes"("importRunId");

-- CreateIndex
CREATE INDEX "project_group_codes_counterpartyId_idx" ON "project_group_codes"("counterpartyId");

-- CreateIndex
CREATE INDEX "project_item_aliases_projectId_idx" ON "project_item_aliases"("projectId");

-- CreateIndex
CREATE INDEX "project_item_aliases_importRunId_idx" ON "project_item_aliases"("importRunId");

-- CreateIndex
CREATE INDEX "project_item_aliases_groupCodeId_idx" ON "project_item_aliases"("groupCodeId");

-- CreateIndex
CREATE INDEX "project_counterparties_projectId_idx" ON "project_counterparties"("projectId");

-- CreateIndex
CREATE INDEX "project_counterparties_importRunId_idx" ON "project_counterparties"("importRunId");

-- CreateIndex
CREATE INDEX "project_counterparty_suppliers_projectId_idx" ON "project_counterparty_suppliers"("projectId");

-- CreateIndex
CREATE INDEX "project_counterparty_suppliers_importRunId_idx" ON "project_counterparty_suppliers"("importRunId");

-- CreateIndex
CREATE INDEX "project_counterparty_suppliers_counterpartyId_idx" ON "project_counterparty_suppliers"("counterpartyId");

-- CreateIndex
CREATE INDEX "project_invoice_lines_projectId_supplierId_idx" ON "project_invoice_lines"("projectId", "supplierId");

-- CreateIndex
CREATE INDEX "project_invoice_lines_projectId_invoiceDate_idx" ON "project_invoice_lines"("projectId", "invoiceDate");

-- CreateIndex
CREATE INDEX "project_invoice_lines_projectId_itemKey_idx" ON "project_invoice_lines"("projectId", "itemKey");

-- CreateIndex
CREATE INDEX "project_invoice_lines_importRunId_idx" ON "project_invoice_lines"("importRunId");

-- CreateIndex
CREATE INDEX "project_actual_receipts_projectId_counterpartyId_idx" ON "project_actual_receipts"("projectId", "counterpartyId");

-- CreateIndex
CREATE INDEX "project_actual_receipts_projectId_itemKey_idx" ON "project_actual_receipts"("projectId", "itemKey");

-- CreateIndex
CREATE INDEX "project_actual_receipts_importRunId_idx" ON "project_actual_receipts"("importRunId");

-- CreateIndex
CREATE INDEX "project_cash_payments_projectId_counterpartyId_idx" ON "project_cash_payments"("projectId", "counterpartyId");

-- CreateIndex
CREATE INDEX "project_cash_payments_projectId_supplierId_idx" ON "project_cash_payments"("projectId", "supplierId");

-- CreateIndex
CREATE INDEX "project_cash_payments_importRunId_idx" ON "project_cash_payments"("importRunId");

-- CreateIndex
CREATE INDEX "project_estimates_supersededByRunId_idx" ON "project_estimates"("supersededByRunId");

-- CreateIndex
CREATE INDEX "project_transactions_supersededByRunId_idx" ON "project_transactions"("supersededByRunId");

-- CreateIndex
CREATE INDEX "project_transactions_sourceInvoiceLineId_idx" ON "project_transactions"("sourceInvoiceLineId");

-- AddForeignKey
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_sourceInvoiceLineId_fkey" FOREIGN KEY ("sourceInvoiceLineId") REFERENCES "project_invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_group_codes" ADD CONSTRAINT "project_group_codes_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_group_codes" ADD CONSTRAINT "project_group_codes_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "project_counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_item_aliases" ADD CONSTRAINT "project_item_aliases_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_item_aliases" ADD CONSTRAINT "project_item_aliases_groupCodeId_fkey" FOREIGN KEY ("groupCodeId") REFERENCES "project_group_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_counterparties" ADD CONSTRAINT "project_counterparties_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_counterparty_suppliers" ADD CONSTRAINT "project_counterparty_suppliers_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_counterparty_suppliers" ADD CONSTRAINT "project_counterparty_suppliers_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "project_counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_counterparty_suppliers" ADD CONSTRAINT "project_counterparty_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invoice_lines" ADD CONSTRAINT "project_invoice_lines_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invoice_lines" ADD CONSTRAINT "project_invoice_lines_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_actual_receipts" ADD CONSTRAINT "project_actual_receipts_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_actual_receipts" ADD CONSTRAINT "project_actual_receipts_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "project_counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cash_payments" ADD CONSTRAINT "project_cash_payments_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cash_payments" ADD CONSTRAINT "project_cash_payments_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "project_counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cash_payments" ADD CONSTRAINT "project_cash_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique (chỉ dòng chưa xóa mềm) — quy ước của repo, Prisma không mô tả được.
CREATE UNIQUE INDEX "project_group_codes_project_code_active_unique"
  ON "project_group_codes" ("projectId", "code") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "project_item_aliases_project_source_key_active_unique"
  ON "project_item_aliases" ("projectId", "source", "itemKey") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "project_counterparties_project_name_active_unique"
  ON "project_counterparties" ("projectId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "project_counterparty_suppliers_project_supplier_active_unique"
  ON "project_counterparty_suppliers" ("projectId", "supplierId") WHERE "deletedAt" IS NULL;
-- Mỗi dòng hóa đơn sinh tối đa một giao dịch còn sống cho các tab cũ.
CREATE UNIQUE INDEX "project_transactions_source_invoice_line_active_unique"
  ON "project_transactions" ("sourceInvoiceLineId") WHERE "sourceInvoiceLineId" IS NOT NULL AND "deletedAt" IS NULL;

-- Giá trị miền (chuỗi) — chặn dữ liệu sai từ SQL thô của import.
ALTER TABLE "project_item_aliases" ADD CONSTRAINT "project_item_aliases_source_check" CHECK ("source" IN ('dt','hd','tt'));
ALTER TABLE "project_item_aliases" ADD CONSTRAINT "project_item_aliases_status_check" CHECK ("status" IN ('xac_nhan','de_xuat','ngoai_dt'));
ALTER TABLE "project_item_aliases" ADD CONSTRAINT "project_item_aliases_kind_check" CHECK ("kind" IS NULL OR "kind" IN ('VL','NC','MTC'));
ALTER TABLE "project_counterparties" ADD CONSTRAINT "project_counterparties_kind_check" CHECK ("kind" IN ('ncc','to_nhan_cong','khac'));
ALTER TABLE "project_counterparties" ADD CONSTRAINT "project_counterparties_basis_check" CHECK ("actualBasis" IN ('receipts','invoices','payments','manual'));
ALTER TABLE "project_cash_payments" ADD CONSTRAINT "project_cash_payments_section_check" CHECK ("section" IN ('I','II','III','IV'));