import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listTasksForBoard, listDeptMembers } from "@/lib/task/task-service";
import { listDepartments } from "@/lib/department-service";
import { getUserContext } from "@/lib/department-rbac";
import { KanbanClient } from "./kanban-client";

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
  const effectiveDeptId = deptIdNum ?? ctx?.departmentId ?? undefined;

  const [{ byStatus }, departments, members] = await Promise.all([
    listTasksForBoard({
      deptId: effectiveDeptId,
      assigneeId: sp.assigneeId,
      priority: sp.priority,
      fromForm,
    }),
    listDepartments({ activeOnly: true }),
    effectiveDeptId ? listDeptMembers(effectiveDeptId) : Promise.resolve([]),
  ]);

  return (
    <KanbanClient
      byStatus={byStatus}
      departments={departments.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
      members={members}
      currentUserId={session.user.id}
      currentRole={session.user.role ?? "viewer"}
      currentDeptId={ctx?.departmentId ?? null}
      currentIsLeader={ctx?.isLeader ?? false}
      currentIsDirector={ctx?.isDirector ?? false}
      filters={{
        deptId: effectiveDeptId ?? null,
        assigneeId: sp.assigneeId ?? null,
        priority: sp.priority ?? null,
        fromForm: fromForm ?? null,
      }}
    />
  );
}
