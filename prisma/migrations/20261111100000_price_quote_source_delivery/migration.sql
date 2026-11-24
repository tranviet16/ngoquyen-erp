-- Báo giá tự tạo từ đơn giá của phiếu ngày: liên kết tới phiếu nguồn để báo giá đi theo phiếu
-- (sửa giá / đổi ngày, vật tư / xoá phiếu). NULL = báo giá nhập tay ở trang Báo giá.
ALTER TABLE "supplier_price_quotes" ADD COLUMN "sourceDeliveryId" INTEGER;

CREATE INDEX "supplier_price_quotes_sourceDeliveryId_idx" ON "supplier_price_quotes"("sourceDeliveryId");
