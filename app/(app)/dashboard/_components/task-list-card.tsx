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
    <div className="nq-card flex flex-col overflow-hidden">
      <div className="nq-card-head">
        <div>
          <h3 className="nq-card-title">{title}</h3>
          <p className="nq-card-sub">{tasks.length} mục cần theo dõi</p>
        </div>
        <Link
          href={viewAllHref}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Tất cả <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="flex-1 bg-card">
        {tasks.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">{emptyText}</p>
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
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-secondary/45"
              >
                <span className="min-w-0 truncate font-medium">{t.title}</span>
                <span
                  className={
                    mode === "overdue"
                      ? "shrink-0 rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
                      : "shrink-0 rounded border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  }
                >
                  {diffLabel}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
