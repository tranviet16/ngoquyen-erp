import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  listTasksForBoard,
  listDeptMembers,
  listViewableMembers,
} from "@/lib/task/task-service";
import { listDepartments } from "@/lib/department-service";
import { getUserContext } from "@/lib/department-rbac";
import { listViewableDeptIds } from "@/lib/dept-access";
import { KanbanClient } from "./kanban-client";
import { OverdueSummary } from "./overdue-summary";
import { serializeDecimals } from "@/lib/serialize";

export const dynamic = "force-dynamic";

function parseIsoDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(s);
  if (!m) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    deptId?: string;
    assigneeId?: string;
    assigneeIds?: string;
    priority?: string;
    fromForm?: string;
    view?: string;
    deadlineFrom?: string;
    deadlineTo?: string;
    includeUndated?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const deptIdNum = sp.deptId ? Number(sp.deptId) : undefined;
  const fromForm =
    sp.fromForm === "true" ? true : sp.fromForm === "false" ? false : undefined;

  const ctx = await getUserContext(session.user.id);
  const queryDeptId = deptIdNum;
  const memberDeptId = deptIdNum ?? ctx?.departmentId ?? undefined;

  const assigneeIdsCsv = sp.assigneeIds?.trim();
  const assigneeIds = assigneeIdsCsv
    ? assigneeIdsCsv.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const deadlineFromDate = parseIsoDate(sp.deadlineFrom);
  // Inclusive end-of-day for `to` so a single-day filter "from=X to=X" matches.
  const deadlineToRaw = parseIsoDate(sp.deadlineTo);
  const deadlineToDate = deadlineToRaw
    ? new Date(deadlineToRaw.getTime() + 86_400_000 - 1)
    : undefined;
  // Default include undated; explicit "0" excludes them.
  const includeUndated = sp.includeUndated === "0" ? false : true;

  const [{ byStatus }, allDepartments, members, viewableMembers, viewableIds] =
    await Promise.all([
      listTasksForBoard({
        deptId: queryDeptId,
        assigneeId: sp.assigneeId,
        assigneeIds,
        priority: sp.priority,
        fromForm,
        deadlineFrom: deadlineFromDate,
        deadlineTo: deadlineToDate,
        includeUndated,
      }),
      listDepartments({ activeOnly: true }),
      memberDeptId ? listDeptMembers(memberDeptId) : Promise.resolve([]),
      listViewableMembers(),
      listViewableDeptIds(session.user.id),
    ]);
  const departments =
    viewableIds === "all"
      ? allDepartments
      : allDepartments.filter((d) => viewableIds.includes(d.id));

  return (
    <div className="space-y-3">
      <OverdueSummary
        userId={session.user.id}
        isLeader={ctx?.isLeader ?? false}
        deptId={ctx?.departmentId ?? null}
      />
    <KanbanClient
      byStatus={serializeDecimals(byStatus)}
      departments={departments.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
      members={members}
      viewableMembers={viewableMembers}
      currentUserId={session.user.id}
      currentRole={session.user.role ?? "viewer"}
      currentDeptId={ctx?.departmentId ?? null}
      currentIsLeader={ctx?.isLeader ?? false}
      currentIsDirector={ctx?.isDirector ?? false}
      view={sp.view === "swimlane" ? "swimlane" : "kanban"}
      filters={{
        deptId: queryDeptId ?? null,
        assigneeId: sp.assigneeId ?? null,
        assigneeIds: assigneeIds ?? [],
        priority: sp.priority ?? null,
        fromForm: fromForm ?? null,
        deadlineFrom: sp.deadlineFrom ?? "",
        deadlineTo: sp.deadlineTo ?? "",
        includeUndated,
      }}
    />
    </div>
  );
}
