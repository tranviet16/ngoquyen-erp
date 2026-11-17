"use client";

/**
 * Thanh điều hướng con của tab "Đối chiếu DT-HĐ-TT". Danh sách đủ chín mục; mục nào chưa có trang
 * thì `ready: false` và bị ẩn (sổ nhập liệu và màn hình ánh xạ thêm ở bản phát hành 2).
 */

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

export const DT_HD_TT_SECTIONS = [
  { segment: "dt-hd", label: "DT-HĐ", ready: true },
  { segment: "dt-tt", label: "DT-TT", ready: true },
  { segment: "hd-tt", label: "HĐ-TT", ready: true },
  { segment: "hoa-don", label: "Hóa đơn", ready: false },
  { segment: "thuc-te-nhap", label: "Thực tế nhập", ready: false },
  { segment: "chi-thuc-te", label: "Chi thực tế", ready: false },
  { segment: "anh-xa", label: "Ánh xạ", ready: false },
  { segment: "dau-moi", label: "Đầu mối", ready: false },
  { segment: "ma-nhom", label: "Mã nhóm", ready: false },
] as const;

/** Nơi sửa dòng HĐ: sổ Hóa đơn khi đã có trang, trước đó là tab Đối chiếu DT-HĐ-TT. */
export function invoiceBookHref(projectId: number): string {
  const ready = DT_HD_TT_SECTIONS.some((s) => s.segment === "hoa-don" && s.ready);
  return `/du-an/${projectId}/dt-hd-tt${ready ? "/hoa-don" : ""}`;
}

export function DtHdTtSubNav({ basePath }: { basePath: string }) {
  const active = useSelectedLayoutSegment();
  return (
    <nav className="no-print flex flex-wrap gap-1">
      {DT_HD_TT_SECTIONS.filter((s) => s.ready).map((s) => (
        <Link
          key={s.segment}
          href={`${basePath}/${s.segment}`}
          aria-current={active === s.segment ? "page" : undefined}
          className={`rounded px-3 py-1 text-sm ${active === s.segment ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
