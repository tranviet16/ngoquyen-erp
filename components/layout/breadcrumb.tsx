"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Bảng điều khiển",
  "master-data": "Dữ liệu nền tảng",
  projects: "Dự án",
  "du-an": "Dự án xây dựng",
  "vat-tu-ncc": "Vật tư – NCC",
  "cong-no-vt": "Công nợ vật tư",
  "cong-no-nc": "Công nợ nhân công",
  "sl-dt": "Sản lượng – Doanh thu",
  "tai-chinh": "Tài chính NQ",
  "phieu-phoi-hop": "Phiếu phối hợp",
  "cong-viec": "Bảng công việc",
  "thong-bao": "Thông báo",
  admin: "Quản trị",
  import: "Nhập dữ liệu",
  "phong-ban": "Phòng ban",
  "cong-no": "Công nợ",
  "chi-tiet": "Chi tiết",
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
