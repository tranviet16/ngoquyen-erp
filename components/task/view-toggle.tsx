"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";

export type ViewMode = "kanban" | "swimlane";

export function ViewToggle({ value }: { value: ViewMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setView(next: ViewMode) {
    if (next === value) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "kanban") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    const qs = params.toString();
    router.push(`/van-hanh/cong-viec${qs ? `?${qs}` : ""}`);
  }

  const baseClass =
    "inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium transition-colors";
  const activeClass = "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900";
  const inactiveClass = "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

  return (
    <div className="inline-flex rounded-md border bg-card overflow-hidden">
      <button
        type="button"
        className={`${baseClass} ${value === "kanban" ? activeClass : inactiveClass}`}
        onClick={() => setView("kanban")}
        aria-pressed={value === "kanban"}
      >
        <LayoutGrid className="size-3.5" aria-hidden="true" />
        Kanban
      </button>
      <button
        type="button"
        className={`${baseClass} border-l ${value === "swimlane" ? activeClass : inactiveClass}`}
        onClick={() => setView("swimlane")}
        aria-pressed={value === "swimlane"}
      >
        <Rows3 className="size-3.5" aria-hidden="true" />
        Swimlane
      </button>
    </div>
  );
}
