-- Công nợ vật tư theo cặp NCC × công trình + bước review của import.
--
-- CHỈ SỬA TIẾN. Chạy sau khi dữ liệu cũ đã được dọn và bù công trình
-- (scripts/vat-tu-cutover-cleanup.sql, runbook go-live bước 6). Dữ liệu còn sai thì
-- migration dừng ngay: pre-check bên dưới hoặc các CHECK (được kiểm trên toàn bộ dòng
-- hiện có, kể cả dòng đã xoá mềm) sẽ ném lỗi và cả migration rollback.

-- Dừng sớm nếu còn kỳ đối chiếu cũ (chưa có công trình) — cột projectId NOT NULL
-- không có giá trị mặc định hợp lệ cho các kỳ đó.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "supplier_reconciliations") THEN
    RAISE EXCEPTION 'Còn kỳ đối chiếu cũ (không có công trình). Chạy scripts/vat-tu-cutover-cleanup.sql trước khi migrate.';
  END IF;
END $$;

-- ─── Kỳ đối chiếu theo cặp ───────────────────────────────────────────────────

ALTER TABLE "supplier_reconciliations" ADD COLUMN "projectId" INTEGER NOT NULL;

ALTER TABLE "supplier_reconciliations"
  ADD CONSTRAINT "supplier_reconciliations_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Một kỳ đang hoạt động cho mỗi (NCC, công trình, biên kỳ).
DROP INDEX "supplier_recon_period_unique";
CREATE UNIQUE INDEX "supplier_recon_pair_period_unique"
  ON "supplier_reconciliations"("supplierId", "projectId", "periodFrom", "periodTo")
  WHERE "deletedAt" IS NULL;

DROP INDEX "supplier_reconciliations_supplierId_periodFrom_idx";
CREATE INDEX "supplier_reconciliations_supplierId_projectId_periodFrom_idx"
  ON "supplier_reconciliations"("supplierId", "projectId", "periodFrom");

-- Phiếu ngày lọc theo công trình (trang công trình, vật tư tháng theo cặp).
CREATE INDEX "supplier_delivery_daily_projectId_date_idx"
  ON "supplier_delivery_daily"("projectId", "date");

-- ─── Bắt buộc công trình (kiểm ngay trên mọi dòng hiện có) ───────────────────
-- Không có CHECK trên payment_round_items: dòng vat_tu cũ đã đóng giữ nguyên; quy tắc
-- "dòng vat_tu mới hoặc sửa phải có công trình" nằm ở service.

ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_material_project_required"
  CHECK ("ledgerType" <> 'material' OR "projectId" IS NOT NULL);

ALTER TABLE "ledger_opening_balances" ADD CONSTRAINT "ledger_opening_material_project_required"
  CHECK ("ledgerType" <> 'material' OR "projectId" IS NOT NULL);

ALTER TABLE "supplier_delivery_daily" ADD CONSTRAINT "supplier_delivery_project_required"
  CHECK ("projectId" IS NOT NULL);

-- ─── Import có review ────────────────────────────────────────────────────────
-- status thêm giá trị 'rolled_back' (cột TEXT, không cần đổi kiểu).

ALTER TABLE "import_runs"
  ADD COLUMN "sourceFile" BYTEA,
  ADD COLUMN "reviewJson" JSONB,
  ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rolledBackAt" TIMESTAMP(3);
