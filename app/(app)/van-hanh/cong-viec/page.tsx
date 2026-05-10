import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listTasksForBoard, listDeptMembers } from "@/lib/task/task-service";
import { listDepartments } from "@/lib/department-service";
import { getUserContext } from "@/lib/department-rbac";
import { listViewableDeptIds } from "@/lib/dept-access";
import { KanbanClient } from "./kanban-client";
import { OverdueSummary } from "./overdue-summary";
import { serializeDecimals } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deptId?: string; assigneeId?: string; priority?: string; fromForm?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const deptIdNum = sp.deptId ? Number(sp.deptId) : undefined;
  const fromForm =
    sp.fromForm === "true" ? true : sp.fromForm === "false" ? false : undefined;

  const ctx = await getUserContext(session.user.id);
  // Task query: only filter by dept when user explicitly picked one in the
  // dropdown. Otherwise let the access map's OR clause (own dept + grants)
  // decide visibility — falling back to ctx.departmentId would hide cross-dept
  // grants whenever "— Tất cả —" is selected.
  const queryDeptId = deptIdNum;
  // Member dropdown context: needs a single dept to list assignable members.
  const memberDeptId = deptIdNum ?? ctx?.departmentId ?? undefined;

  const [{ byStatus }, allDepartments, members, viewableIds] = await Promise.all([
    listTasksForBoard({
      deptId: queryDeptId,
      assigneeId: sp.assigneeId,
      priority: sp.priority,
      fromForm,
    }),
    listDepartments({ activeOnly: true }),
    memberDeptId ? listDeptMembers(memberDeptId) : Promise.resolve([]),
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
      currentUserId={session.user.id}
      currentRole={session.user.role ?? "viewer"}
      currentDeptId={ctx?.departmentId ?? null}
      currentIsLeader={ctx?.isLeader ?? false}
      currentIsDirector={ctx?.isDirector ?? false}
      filters={{
        deptId: queryDeptId ?? null,
        assigneeId: sp.assigneeId ?? null,
        priority: sp.priority ?? null,
        fromForm: fromForm ?? null,
      }}
    />
    </div>
  );
}
