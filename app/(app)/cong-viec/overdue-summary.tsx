import { prisma } from "@/lib/prisma";
import { countByLabel } from "@/lib/task/overdue";
import { AlertTriangle, Clock } from "lucide-react";

interface Props {
  userId: string;
  isLeader: boolean;
  deptId: number | null;
}

export async function OverdueSummary({ userId, isLeader, deptId }: Props) {
  const personalPromise = prisma.task.findMany({
    where: { assigneeId: userId },
    select: { deadline: true, completedAt: true },
  });
  const deptPromise =
    isLeader && deptId !== null
      ? prisma.task.findMany({
          where: { deptId },
          select: { deadline: true, completedAt: true },
        })
      : Promise.resolve(null);

  const [personal, dept] = await Promise.all([personalPromise, deptPromise]);
  const personalCounts = countByLabel(personal);
  const deptCounts = dept ? countByLabel(dept) : null;

  const showPersonal = personalCounts.overdue + personalCounts.due_soon > 0;
  const showDept = deptCounts && deptCounts.overdue + deptCounts.due_soon > 0;
  if (!showPersonal && !showDept) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      {showPersonal && (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-muted-foreground">Của tôi:</span>
          {personalCounts.overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {personalCounts.overdue} quá hạn
            </span>
          )}
          {personalCounts.due_soon > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              <Clock className="size-3" aria-hidden="true" />
              {personalCounts.due_soon} sắp hạn
            </span>
          )}
        </span>
      )}
      {showDept && deptCounts && (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-muted-foreground">Phòng:</span>
          {deptCounts.overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {deptCounts.overdue} quá hạn
            </span>
          )}
          {deptCounts.due_soon > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              <Clock className="size-3" aria-hidden="true" />
              {deptCounts.due_soon} sắp hạn
            </span>
          )}
        </span>
      )}
    </div>
  );
}
