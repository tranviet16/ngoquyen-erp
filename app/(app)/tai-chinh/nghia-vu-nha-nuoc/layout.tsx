import Link from "next/link";
import type { ReactNode } from "react";

const subNav = [
  { href: "/tai-chinh/nghia-vu-nha-nuoc/bao-cao", label: "Báo cáo" },
  { href: "/tai-chinh/nghia-vu-nha-nuoc/so-theo-doi", label: "Sổ theo dõi" },
  { href: "/tai-chinh/nghia-vu-nha-nuoc/danh-muc", label: "Danh mục" },
];

export default function NghiaVuNhaNuocLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5" aria-label="Nghĩa vụ với Nhà nước">
        {subNav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="inline-flex items-center rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted hover:border-primary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {n.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
