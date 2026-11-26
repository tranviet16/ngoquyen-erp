-- Loại NCC: vật tư (mặc định) hoặc nhân công. Chỉ thêm cột có mặc định: mọi NCC hiện có thành "vat_tu",
-- không dời dòng sổ nào; build cũ không đọc cột này nên vẫn chạy được.
-- Rollback: ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_kind_check"; ALTER TABLE "suppliers" DROP COLUMN "kind";

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'vat_tu';
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_kind_check" CHECK ("kind" IN ('vat_tu', 'nhan_cong'));
