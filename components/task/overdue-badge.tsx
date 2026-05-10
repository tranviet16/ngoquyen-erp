import { AlertTriangle, Clock } from "lucide-react";
import type { OverdueLabel } from "@/lib/task/overdue";

const STYLE: Record<OverdueLabel, string> = {
  overdue: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  due_soon: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  on_track: "",
  no_deadline: "",
};

const TEXT: Record<OverdueLabel, string> = {
  overdue: "Quá hạn",
  due_soon: "Sắp hạn",
  on_track: "",
  no_deadline: "",
};

export function OverdueBadge({ label }: { label: OverdueLabel }) {
  if (label === "on_track" || label === "no_deadline") return null;
  const Icon = label === "overdue" ? AlertTriangle : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STYLE[label]}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {TEXT[label]}
    </span>
  );
}
