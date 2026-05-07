import type { Task, TaskAttachment } from "@prisma/client";
import type { UserContext } from "@/lib/department-rbac";

export function canDeleteAttachment(
  att: Pick<TaskAttachment, "uploaderId">,
  task: Pick<Task, "deptId">,
  ctx: UserContext,
  role: string,
): boolean {
  if (role === "admin") return true;
  if (att.uploaderId === ctx.userId) return true;
  if (ctx.isLeader && ctx.departmentId === task.deptId) return true;
  return false;
}
