import type { Task, TaskComment } from "@prisma/client";
import type { UserContext } from "@/lib/department-rbac";

export const COMMENT_EDIT_WINDOW_MS = 5 * 60 * 1000;

export function canEditComment(
  comment: Pick<TaskComment, "authorId" | "createdAt">,
  userId: string,
  now: Date = new Date(),
): boolean {
  if (comment.authorId !== userId) return false;
  return now.getTime() - comment.createdAt.getTime() < COMMENT_EDIT_WINDOW_MS;
}

export function canDeleteComment(
  comment: Pick<TaskComment, "authorId">,
  task: Pick<Task, "deptId">,
  ctx: UserContext,
  role: string,
): boolean {
  if (role === "admin") return true;
  if (comment.authorId === ctx.userId) return true;
  if (ctx.isLeader && ctx.departmentId === task.deptId) return true;
  return false;
}
