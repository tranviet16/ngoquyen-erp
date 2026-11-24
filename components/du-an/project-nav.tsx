"use client";

/**
 * Thanh điều hướng hai hàng của một công trình: hàng 1 là 7 nhóm, hàng 2 là tab của nhóm đang mở (nhóm
 * "Đối chiếu DT-HĐ-TT" để layout con vẽ hàng 2). Không cuộn ngang; nhóm / tab đang mở được tô sáng và có
 * aria-current. `nav` bị ẩn khi in (globals.css), nên bản in không đổi.
 */

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { BOOK_NOTE_GROUP_ID, PROJECT_NAV_GROUPS, groupHref, resolveProjectNav, tabHref } from "@/lib/du-an/project-nav";

interface ViewProps {
  basePath: string;
  segment: string | null;
  /** Ghi chú cho nhóm Vật tư & công nợ trên công trình dùng sổ đội (server component, có thể rỗng). */
  bookNote?: ReactNode;
}

const GROUP_LINK = "border-b-2 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap";
const TAB_LINK = "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap";

/** Phần vẽ thuần (không hook) — test được bằng renderToStaticMarkup. */
export function ProjectNavView({ basePath, segment, bookNote }: ViewProps) {
  const { group: active, tab: activeTab } = resolveProjectNav(segment);
  return (
    <>
      <nav aria-label="Nhóm chức năng công trình" data-nav-row="groups" className="flex flex-wrap gap-0">
        {PROJECT_NAV_GROUPS.map((g) => {
          const current = g.id === active?.id;
          return (
            <Link
              key={g.id}
              href={groupHref(basePath, g)}
              aria-current={current ? "true" : undefined}
              className={`${GROUP_LINK} ${current ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
            >
              {g.label}
            </Link>
          );
        })}
      </nav>
      {active?.row2 !== "subnav" && (
        <nav aria-label="Tab trong nhóm" data-nav-row="tabs" className="flex min-h-9 flex-wrap items-center gap-1 py-1.5">
          {active?.row2 === "tabs" &&
            active.tabs.map((t) => {
              const current = t.segment === activeTab?.segment;
              return (
                <Link
                  key={t.segment ?? "index"}
                  href={tabHref(basePath, t)}
                  aria-current={current ? "page" : undefined}
                  className={`${TAB_LINK} ${current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {t.label}
                </Link>
              );
            })}
          {active?.id === BOOK_NOTE_GROUP_ID && bookNote}
        </nav>
      )}
    </>
  );
}

export function ProjectNav({ basePath, bookNote }: { basePath: string; bookNote?: ReactNode }) {
  return <ProjectNavView basePath={basePath} segment={useSelectedLayoutSegment()} bookNote={bookNote} />;
}
