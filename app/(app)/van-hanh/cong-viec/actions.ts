"use server";

import { revalidatePath } from "next/cache";
import {
  assignTask,
  createTaskManual,
  deleteTask,
  moveTask,
  updateTask,
} from "@/lib/task/task-service";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/task/schemas";
import type { TaskStatus } from "@/lib/task/state-machine";
import { prisma } from "@/lib/prisma";

export type TaskActivityEntry = {
  id: string;
  action: string;
  createdAt: Date;
  user: { id: string; name: string | null } | null;
  changes: Array<{ field: string; label: string; before: unknown; after: unknown }>;
};

const FIELD_LABEL_VI: Record<string, string> = {
  title: "Tiêu đề",
  description: "Mô tả",
  status: "Trạng thái",
  priority: "Ưu tiên",
  deadline: "Hạn chót",
  assigneeId: "Người thực hiện",
  deptId: "Phòng ban",
  completedAt: "Hoàn thành lúc",
  parentId: "Task cha",
};

function diffJson(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Array<{ field: string; label: string; before: unknown; after: unknown }> {
  if (!before && !after) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: Array<{ field: string; label: string; before: unknown; after: unknown }> = [];
  for (const k of keys) {
    if (k === "id") continue;
    const b = before?.[k] ?? null;
    const a = after?.[k] ?? null;
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    out.push({ field: k, label: FIELD_LABEL_VI[k] ?? k, before: b, after: a });
  }
  return out;
}

export async function createTaskAction(input: CreateTaskInput) {
  const t = await createTaskManual(input);
  revalidatePath("/van-hanh/cong-viec");
  revalidatePath("/van-hanh/hieu-suat");
  return { id: t.id };
}

export async function updateTaskAction(id: number, input: UpdateTaskInput) {
  await updateTask(id, input);
  revalidatePath("/van-hanh/cong-viec");
  revalidatePath("/van-hanh/hieu-suat");
}

export async function assignTaskAction(id: number, assigneeId: string | null) {
  await assignTask(id, assigneeId);
  revalidatePath("/van-hanh/cong-viec");
  revalidatePath("/van-hanh/hieu-suat");
}

export async function moveTaskAction(id: number, toStatus: TaskStatus, toOrder?: number) {
  await moveTask(id, toStatus, toOrder);
  revalidatePath("/van-hanh/cong-viec");
  revalidatePath("/van-hanh/hieu-suat");
}

export async function deleteTaskAction(id: number) {
  await deleteTask(id);
  revalidatePath("/van-hanh/cong-viec");
  revalidatePath("/van-hanh/hieu-suat");
}

export async function getTaskActivity(taskId: number): Promise<TaskActivityEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { tableName: "Task", recordId: String(taskId) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { id: true, name: true } } },
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    createdAt: l.createdAt,
    user: l.user,
    changes: diffJson(
      l.beforeJson as Record<string, unknown> | null,
      l.afterJson as Record<string, unknown> | null,
    ),
  }));
}
