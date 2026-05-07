export const TASK_STATUSES = ["todo", "doing", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Cần làm",
  doing: "Đang làm",
  review: "Chờ duyệt",
  done: "Hoàn thành",
};

export function taskStatusLabel(s: TaskStatus): string {
  return STATUS_LABEL[s];
}

export function isValidTaskStatus(s: string): s is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(s);
}

export type TaskMoveRole = "assignee" | "leader" | "creator" | "admin" | "none";

export function canMoveTask(
  from: TaskStatus,
  to: TaskStatus,
  role: TaskMoveRole,
  hasSourceForm: boolean,
): boolean {
  if (from === to) return true;
  if (role === "admin") return true;
  if (role === "leader") return true;

  if (role === "assignee") {
    if (from === "todo" && to === "doing") return true;
    if (from === "doing" && to === "todo") return true;
    if (from === "doing" && to === "review") return true;
    return false;
  }

  if (role === "creator" && !hasSourceForm) {
    if (from === "review" && to === "done") return true;
  }

  return false;
}
