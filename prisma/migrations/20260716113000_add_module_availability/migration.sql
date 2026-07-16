CREATE TABLE "module_availability" (
    "moduleKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "module_availability_pkey" PRIMARY KEY ("moduleKey"),
    CONSTRAINT "module_availability_status_check"
        CHECK ("status" IN ('ready', 'development'))
);

INSERT INTO "module_availability" ("moduleKey", "status") VALUES
    ('dashboard', 'ready'),
    ('master-data', 'ready'),
    ('du-an', 'ready'),
    ('vat-tu-ncc', 'ready'),
    ('sl-dt', 'ready'),
    ('cong-no-vt', 'ready'),
    ('cong-no-nc', 'ready'),
    ('tai-chinh', 'ready'),
    ('thanh-toan.ke-hoach', 'ready'),
    ('thanh-toan.tong-hop', 'ready'),
    ('van-hanh.cong-viec', 'ready'),
    ('van-hanh.phieu-phoi-hop', 'ready'),
    ('van-hanh.hieu-suat', 'ready'),
    ('thong-bao', 'ready'),
    ('admin.import', 'ready'),
    ('admin.phong-ban', 'ready'),
    ('admin.nguoi-dung', 'ready'),
    ('admin.permissions', 'ready');
