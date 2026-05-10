import { formatDate } from "@/lib/utils/format";

const STATUS_LABEL: Record<string, string> = {
  todo: "Chờ làm",
  doing: "Đang làm",
  review: "Chờ duyệt",
  done: "Hoàn thành",
};

export function CompletedTaskRow({
  id,
  title,
  deptCode,
  deadline,
  completedAt,
  createdAt,
}: {
  id: number;
  title: string;
  deptCode: string;
  deadline: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}) {
  const onTime =
    deadline && completedAt ? completedAt.getTime() <= deadline.getTime() : null;
  const cycleDays = completedAt
    ? Math.round(((completedAt.getTime() - createdAt.getTime()) / 86_400_000) * 10) / 10
    : null;
  return (
    <a
      href={`/van-hanh/cong-viec?taskId=${id}`}
      className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 hover:border-primary/40 transition-colors"
    >
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
        {deptCode}
      </span>
      <span className="flex-1 text-sm font-medium truncate">{title}</span>
      {onTime !== null && (
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            onTime
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          }`}
        >
          {onTime ? "Đúng hạn" : "Trễ hạn"}
        </span>
      )}
      {cycleDays !== null && (
        <span className="text-xs text-muted-foreground tabular-nums">{cycleDays}d</span>
      )}
      {completedAt && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(completedAt)}
        </span>
      )}
    </a>
  );
}

export function ActiveTaskRow({
  id,
  title,
  status,
  deadline,
  deptCode,
}: {
  id: number;
  title: string;
  status: string;
  deadline: Date | null;
  deptCode: string;
}) {
  const overdue = deadline ? deadline.getTime() < Date.now() : false;
  return (
    <a
      href={`/van-hanh/cong-viec?taskId=${id}`}
      className={`flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 hover:border-primary/40 transition-colors ${
        overdue ? "border-red-400 dark:border-red-500/60 border-l-4 border-l-red-500" : ""
      }`}
    >
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
        {deptCode}
      </span>
      <span className="flex-1 text-sm font-medium truncate">{title}</span>
      <span className="text-xs text-muted-foreground">{STATUS_LABEL[status] ?? status}</span>
      {deadline && (
        <span className={`text-xs tabular-nums ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
          {formatDate(deadline)}
        </span>
      )}
    </a>
  );
}
