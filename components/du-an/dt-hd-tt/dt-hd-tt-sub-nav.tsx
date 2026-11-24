"use client";

/**
 * Thanh mục con của tab "Đối chiếu DT-HĐ-TT" — đóng vai hàng 2 của khung dự án. Chín mục chia bốn nhóm:
 * Tổng quan · Báo cáo · Nhập sổ · Thiết lập. Mục nào chưa có trang thì `ready: false` và bị ẩn (Tổng quan
 * bật khi trang Tổng quan ra mắt). Mục Ánh xạ mang huy hiệu "chưa gán" do layout truyền vào (Suspense riêng).
 */

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

export type SectionGroup = "Tổng quan" | "Báo cáo" | "Nhập sổ" | "Thiết lập";

export interface DtHdTtSection {
  /** Segment sau /dt-hd-tt; `null` là trang index (Tổng quan). */
  segment: string | null;
  label: string;
  group: SectionGroup;
  ready: boolean;
}

export const DT_HD_TT_SECTIONS: readonly DtHdTtSection[] = [
  { segment: null, label: "Tổng quan", group: "Tổng quan", ready: false },
  { segment: "dt-hd", label: "DT-HĐ", group: "Báo cáo", ready: true },
  { segment: "dt-tt", label: "DT-TT", group: "Báo cáo", ready: true },
  { segment: "hd-tt", label: "HĐ-TT", group: "Báo cáo", ready: true },
  { segment: "hoa-don", label: "Hóa đơn", group: "Nhập sổ", ready: true },
  { segment: "thuc-te-nhap", label: "Thực tế nhập", group: "Nhập sổ", ready: true },
  { segment: "chi-thuc-te", label: "Chi thực tế", group: "Nhập sổ", ready: true },
  { segment: "anh-xa", label: "Ánh xạ", group: "Thiết lập", ready: true },
  { segment: "dau-moi", label: "Đầu mối", group: "Thiết lập", ready: true },
  { segment: "ma-nhom", label: "Mã nhóm", group: "Thiết lập", ready: true },
];

/** Mục mang huy hiệu "chưa gán". */
const BADGE_SEGMENT = "anh-xa";

/** Nơi sửa dòng HĐ: sổ Hóa đơn khi đã có trang, trước đó là tab Đối chiếu DT-HĐ-TT. */
export function invoiceBookHref(projectId: number): string {
  const ready = DT_HD_TT_SECTIONS.some((s) => s.segment === "hoa-don" && s.ready);
  return `/du-an/${projectId}/dt-hd-tt${ready ? "/hoa-don" : ""}`;
}

export const sectionHref = (basePath: string, s: DtHdTtSection) => (s.segment === null ? basePath : `${basePath}/${s.segment}`);

/** Các nhóm còn mục đã sẵn sàng, theo thứ tự khai báo; nhóm rỗng bị bỏ. */
export function subNavGroups(sections: readonly DtHdTtSection[] = DT_HD_TT_SECTIONS): { group: SectionGroup; sections: DtHdTtSection[] }[] {
  const out: { group: SectionGroup; sections: DtHdTtSection[] }[] = [];
  for (const s of sections.filter((x) => x.ready)) {
    const last = out[out.length - 1];
    if (last?.group === s.group) last.sections.push(s);
    else out.push({ group: s.group, sections: [s] });
  }
  return out;
}

const LINK = "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center";

/** Phần vẽ thuần (không hook) — test được bằng renderToStaticMarkup. */
export function DtHdTtSubNavView({ basePath, active, badge }: { basePath: string; active: string | null; badge?: ReactNode }) {
  return (
    <nav aria-label="Mục của Đối chiếu DT-HĐ-TT" data-nav-row="dt-hd-tt" className="no-print flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
      {subNavGroups().map(({ group, sections }, i) => (
        <div key={group} role="group" aria-label={group} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true" className="mr-2 h-4 w-px bg-border" />}
          {!(sections.length === 1 && sections[0].label === group) && (
            <span className="mr-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{group}</span>
          )}
          {sections.map((s) => {
            const current = active === s.segment;
            return (
              <Link
                key={s.segment ?? "index"}
                href={sectionHref(basePath, s)}
                aria-current={current ? "page" : undefined}
                className={`${LINK} ${current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {s.label}
                {s.segment === BADGE_SEGMENT && badge}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DtHdTtSubNav({ basePath, badge }: { basePath: string; badge?: ReactNode }) {
  return <DtHdTtSubNavView basePath={basePath} active={useSelectedLayoutSegment()} badge={badge} />;
}
