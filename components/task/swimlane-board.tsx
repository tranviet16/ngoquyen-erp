"use client";

import { useDroppable } from "@dnd-kit/core";
import { TaskCard } from "@/components/task/task-card";
import { TASK_STATUSES, taskStatusLabel, type TaskStatus } from "@/lib/task/state-machine";
import type { SwimlaneGroup } from "@/lib/task/regroup-swimlane";
import type { TaskWithRelations } from "@/lib/task/task-service";

const STATUS_BG: Record<TaskStatus, string> = {
  todo: "bg-slate-50/60 dark:bg-slate-900/30",
  doing: "bg-sky-50/60 dark:bg-sky-500/5",
  review: "bg-amber-50/60 dark:bg-amber-500/5",
  done: "bg-emerald-50/60 dark:bg-emerald-500/5",
};

export function SwimlaneBoard({
  groups,
  canDragTask,
  onClickTask,
}: {
  groups: SwimlaneGroup[];
  canDragTask: (t: TaskWithRelations) => boolean;
  onClickTask: (t: TaskWithRelations) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Không có công việc nào khớp bộ lọc hiện tại.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div
        className="grid min-w-[900px]"
        style={{ gridTemplateColumns: "200px repeat(4, minmax(220px, 1fr))" }}
      >
        {/* Header row */}
        <div className="sticky left-0 z-20 border-b border-r bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
          Người được giao
        </div>
        {TASK_STATUSES.map((status) => (
          <div
            key={status}
            className={`border-b border-r last:border-r-0 px-3 py-2 text-xs font-semibold ${STATUS_BG[status]}`}
          >
            {taskStatusLabel(status)}
          </div>
        ))}

        {/* Body rows */}
        {groups.map((g, idx) => (
          <SwimlaneRow
            key={g.assigneeId ?? "_unassigned"}
            group={g}
            canDragTask={canDragTask}
            onClickTask={onClickTask}
            isLast={idx === groups.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function SwimlaneRow({
  group,
  canDragTask,
  onClickTask,
  isLast,
}: {
  group: SwimlaneGroup;
  canDragTask: (t: TaskWithRelations) => boolean;
  onClickTask: (t: TaskWithRelations) => void;
  isLast: boolean;
}) {
  const borderClass = isLast ? "" : "border-b";
  return (
    <>
      <div
        className={`sticky left-0 z-10 ${borderClass} border-r bg-card px-3 py-3 flex flex-col justify-center`}
      >
        <p className="text-sm font-medium truncate">{group.assigneeName}</p>
        {group.deptCode && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{group.deptCode}</p>
        )}
      </div>
      {TASK_STATUSES.map((status) => (
        <SwimlaneCell
          key={status}
          assigneeId={group.assigneeId}
          status={status}
          tasks={group.byStatus[status]}
          canDragTask={canDragTask}
          onClickTask={onClickTask}
          borderClass={borderClass}
        />
      ))}
    </>
  );
}

function SwimlaneCell({
  assigneeId,
  status,
  tasks,
  canDragTask,
  onClickTask,
  borderClass,
}: {
  assigneeId: string | null;
  status: TaskStatus;
  tasks: TaskWithRelations[];
  canDragTask: (t: TaskWithRelations) => boolean;
  onClickTask: (t: TaskWithRelations) => void;
  borderClass: string;
}) {
  const cellId = `swimlane:${assigneeId ?? "_unassigned"}:${status}`;
  const { setNodeRef, isOver } = useDroppable({ id: cellId });

  return (
    <div
      ref={setNodeRef}
      className={`${borderClass} border-r last:border-r-0 px-2 py-2 ${STATUS_BG[status]} ${isOver ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            draggable={canDragTask(t)}
            onClick={() => onClickTask(t)}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-slate-300 dark:text-slate-700 text-center py-2">—</p>
        )}
      </div>
    </div>
  );
}
