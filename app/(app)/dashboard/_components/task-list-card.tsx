import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TaskWithRelations } from "@/lib/task/task-service";

function daysDiff(deadline: Date, now: Date): number {
  const ms = deadline.getTime() - now.getTime();
  return Math.ceil(ms / 86400000);
}

export function TaskListCard({
  title,
  tasks,
  mode,
  emptyText,
  viewAllHref,
  now,
}: {
  title: string;
  tasks: TaskWithRelations[];
  mode: "overdue" | "upcoming";
  emptyText: string;
  viewAllHref: string;
  now: Date;
}) {
  return (
    <div className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="px-4 pt-3 pb-2 border-b">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="flex-1 p-3 space-y-1.5">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{emptyText}</p>
        ) : (
          tasks.map((t) => {
            const d = t.deadline ? daysDiff(t.deadline, now) : null;
            const diffLabel =
              d === null
                ? ""
                : mode === "overdue"
                  ? `Quá ${Math.abs(d)} ngày`
                  : d === 0
                    ? "Hôm nay"
                    : `Còn ${d} ngày`;
            return (
              <Link
                key={t.id}
                href={`/van-hanh/cong-viec?taskId=${t.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent text-sm"
              >
                <span className="truncate flex-1">{t.title}</span>
                <span
                  className={
                    mode === "overdue"
                      ? "shrink-0 text-xs text-destructive font-medium"
                      : "shrink-0 text-xs text-muted-foreground"
                  }
                >
                  {diffLabel}
                </span>
              </Link>
            );
          })
        )}
      </div>
      <Link
        href={viewAllHref}
        className="flex items-center justify-end gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-t"
      >
        Xem tất cả <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
