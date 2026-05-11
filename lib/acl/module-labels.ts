import type { AccessLevel, ModuleKey } from "./modules";

/**
 * Vietnamese display labels for all module keys.
 * Used in admin UI grids, breadcrumbs, and tooltips.
 */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  "dashboard": "Bảng điều khiển",
  "master-data": "Dữ liệu nền tảng",
  "du-an": "Dự án xây dựng",
  "vat-tu-ncc": "Vật tư / NCC",
  "sl-dt": "SL-DT",
  "cong-no-vt": "Công nợ vật tư",
  "cong-no-nc": "Công nợ nhân công",
  "tai-chinh": "Tài chính",
  "van-hanh.cong-viec": "Vận hành – Công việc",
  "van-hanh.phieu-phoi-hop": "Vận hành – Phiếu phối hợp",
  "van-hanh.hieu-suat": "Vận hành – Hiệu suất",
  "thong-bao": "Thông báo",
  "admin.import": "Quản trị – Import",
  "admin.phong-ban": "Quản trị – Phòng ban",
  "admin.nguoi-dung": "Quản trị – Người dùng",
  "admin.permissions": "Quản trị – Phân quyền",
};

export const LEVEL_LABELS: Record<AccessLevel, string> = {
  read: "Xem",
  comment: "Bình luận",
  edit: "Chỉnh sửa",
  admin: "Quản trị",
};
