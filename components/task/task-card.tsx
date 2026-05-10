"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { Calendar, User as UserIcon, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import { OverdueBadge } from "@/components/task/overdue-badge";
import { getOverdueLabel } from "@/lib/task/overdue";
import type { TaskWithRelations } from "@/lib/task/task-service";

const PRIORITY_COLORS: Record<string, string> = {
  cao: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  trung_binh: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  thap: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
};

const PRIORITY_LABEL: Record<string, string> = {
  cao: "Cao",
  trung_binh: "Trung bình",
  thap: "Thấp",
};

export function TaskCard({
  task,
  draggable,
  onClick,
  dragId,
}: {
  task: TaskWithRelations;
  draggable: boolean;
  onClick: () => void;
  dragId?: string | number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId ?? task.id,
    disabled: !draggable || !mounted,
  });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : {};
  return (
    <div
      ref={mounted ? setNodeRef : undefined}
      style={style}
      {...(mounted ? listeners : {})}
      {...(mounted ? attributes : {})}
      suppressHydrationWarning
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      className={`rounded-md border bg-card p-2.5 shadow-sm hover:border-primary/40 transition-colors ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2 flex-1">{task.title}</p>
        {task.childCounts && task.childCounts.total > 0 && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap tabular-nums">
            {task.childCounts.done}/{task.childCounts.total}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 items-center text-xs">
        <span className={`rounded px-1.5 py-0.5 font-medium ${PRIORITY_COLORS[task.priority] ?? ""}`}>
          {PRIORITY_LABEL[task.priority] ?? task.priority}
        </span>
        <OverdueBadge
          label={getOverdueLabel({
            deadline: task.deadline ? new Date(task.deadline) : null,
            completedAt: task.completedAt ? new Date(task.completedAt) : null,
          })}
        />
        {task.deadline && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Calendar className="size-3" aria-hidden="true" />
            {formatDate(task.deadline)}
          </span>
        )}
        {task.assignee && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <UserIcon className="size-3" aria-hidden="true" />
            {task.assignee.name}
          </span>
        )}
        {task.sourceForm && (
          <Link
            href={`/van-hanh/phieu-phoi-hop/${task.sourceForm.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <FileText className="size-3" aria-hidden="true" />
            {task.sourceForm.code}
          </Link>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">{task.dept.code}</p>
    </div>
  );
}
