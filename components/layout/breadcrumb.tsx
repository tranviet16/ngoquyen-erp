"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Bảng điều khiển",
  // Top-level modules
  "master-data": "Dữ liệu nền tảng",
  "du-an": "Dự án xây dựng",
  "vat-tu-ncc": "Vật tư – NCC",
  "cong-no-vt": "Công nợ vật tư",
  "cong-no-nc": "Công nợ nhân công",
  "sl-dt": "Sản lượng – Doanh thu",
  "tai-chinh": "Tài chính NQ",
  "thanh-toan": "Thanh toán",
  "van-hanh": "Vận hành",
  "thong-bao": "Thông báo",
  admin: "Quản trị",
  // Master data
  projects: "Dự án",
  entities: "Chủ thể",
  suppliers: "Nhà cung cấp",
  contractors: "Nhà thầu",
  items: "Vật tư",
  // Du an sub
  "hop-dong": "Hợp đồng",
  "dinh-muc": "Định mức",
  "du-toan": "Dự toán",
  "du-toan-dieu-chinh": "Dự toán điều chỉnh",
  "cai-dat": "Cài đặt",
  "phat-sinh": "Phát sinh",
  "tien-do": "Tiến độ",
  "dong-tien-3-ben": "Dòng tiền 3 bên",
  "nghiem-thu": "Nghiệm thu",
  "giao-dich": "Giao dịch",
  "cong-no": "Công nợ",
  // Vat tu NCC sub
  thang: "Theo tháng",
  ngay: "Theo ngày",
  "doi-chieu": "Đối chiếu",
  // SL-DT sub
  "tien-do-nop-tien": "Tiến độ nộp tiền",
  "tien-do-xd": "Tiến độ xây dựng",
  "cau-hinh": "Cấu hình",
  "bao-cao-sl": "Báo cáo sản lượng",
  "bao-cao-dt": "Báo cáo doanh thu",
  "nhap-thang-moi": "Nhập tháng mới",
  "chi-tieu": "Chỉ tiêu",
  // Cong no sub
  "chi-tiet": "Chi tiết",
  "bao-cao-thang": "Báo cáo tháng",
  // Thanh toan sub
  "ke-hoach": "Kế hoạch",
  "tong-hop": "Tổng hợp",
  "so-du-ban-dau": "Số dư ban đầu",
  "nhap-lieu": "Nhập liệu",
  // Tai chinh sub
  "nguon-tien": "Nguồn tiền",
  "phan-loai-chi-phi": "Phân loại chi phí",
  "phan-loai-giao-dich": "Phân loại giao dịch",
  "nhat-ky": "Nhật ký",
  "phai-thu-tra": "Phải thu – Phải trả",
  "bao-cao-thanh-khoan": "Báo cáo thanh khoản",
  vay: "Khoản vay",
  // Van hanh sub
  "phieu-phoi-hop": "Phiếu phối hợp",
  "cong-viec": "Bảng công việc",
  "hieu-suat": "Hiệu suất",
  "tao-moi": "Tạo mới",
  dept: "Phòng ban",
  user: "Nhân viên",
  // Admin sub
  import: "Nhập dữ liệu",
  "phong-ban": "Phòng ban",
  "nguoi-dung": "Người dùng",
  permissions: "Phân quyền",
  modules: "Phân hệ",
};

function labelFor(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // Numeric ID → keep as #id; UUID-like → "Chi tiết"
  if (/^\d+$/.test(segment)) return `#${segment}`;
  if (segment.length > 16 && /[0-9a-f-]{16,}/i.test(segment)) return "Chi tiết";
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) {
    return null;
  }

  const crumbs = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/");
    return { href, label: labelFor(seg), isLast: idx === segments.length - 1 };
  });

  return (
    <nav aria-label="Đường dẫn" className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
      <Link
        href="/dashboard"
        className="flex items-center hover:text-foreground transition-colors shrink-0"
        aria-label="Bảng điều khiển"
      >
        <Home className="size-3.5" aria-hidden="true" />
      </Link>
      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1 min-w-0">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
          {c.isLast ? (
            <span className="font-medium text-foreground truncate" aria-current="page">
              {c.label}
            </span>
          ) : (
            <Link href={c.href} className="hover:text-foreground transition-colors truncate">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
