import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { FormWithRelations } from "@/lib/coordination-form/coordination-form-service";
import type { TaskWithRelations } from "@/lib/task/task-service";

type QueueItem = {
  id: string;
  title: string;
  sub: string;
  badge: string;
  href: string;
  tone: "danger" | "warning" | "primary";
};

function taskToItem(task: TaskWithRelations, badge: string, tone: QueueItem["tone"]): QueueItem {
  return {
    id: `task-${task.id}`,
    title: task.title,
    sub: `${task.dept.code} / ${task.assignee?.name ?? "Chưa giao"}`,
    badge,
    href: `/van-hanh/cong-viec?taskId=${task.id}`,
    tone,
  };
}

function formToItem(form: FormWithRelations): QueueItem {
  return {
    id: `form-${form.id}`,
    title: form.content,
    sub: `${form.code} / ${form.creatorDept.code} → ${form.executorDept.code}`,
    badge: "Chờ duyệt",
    href: `/van-hanh/phieu-phoi-hop/${form.id}`,
    tone: "primary",
  };
}

const TONE_CLASS: Record<QueueItem["tone"], string> = {
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  warning: "border-accent/30 bg-accent/10 text-accent",
  primary: "border-primary/20 bg-primary/10 text-primary",
};

export function PriorityQueueCard({
  overdueTasks,
  upcomingTasks,
  pendingForms,
}: {
  overdueTasks: TaskWithRelations[];
  upcomingTasks: TaskWithRelations[];
  pendingForms: FormWithRelations[];
}) {
  const items = [
    ...overdueTasks.slice(0, 2).map((task) => taskToItem(task, "Quá hạn", "danger")),
    ...upcomingTasks.slice(0, 1).map((task) => taskToItem(task, "Sắp hạn", "warning")),
    ...pendingForms.slice(0, 2).map(formToItem),
  ].slice(0, 5);

  return (
    <div className="nq-card flex flex-col overflow-hidden">
      <div className="nq-card-head">
        <div>
          <h2 className="nq-card-title">Việc ưu tiên</h2>
          <p className="nq-card-sub">Queue ngắn cho admin xử lý hoặc drill-down</p>
        </div>
        <Link
          href="/van-hanh/cong-viec"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Tất cả <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="flex-1 bg-card">
        {items.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">Không có việc ưu tiên.</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-secondary/45"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.sub}</span>
              </span>
              <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[item.tone]}`}>
                {item.badge}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
