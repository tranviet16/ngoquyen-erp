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

export async function createTaskAction(input: CreateTaskInput) {
  const t = await createTaskManual(input);
  revalidatePath("/cong-viec");
  return { id: t.id };
}

export async function updateTaskAction(id: number, input: UpdateTaskInput) {
  await updateTask(id, input);
  revalidatePath("/cong-viec");
}

export async function assignTaskAction(id: number, assigneeId: string | null) {
  await assignTask(id, assigneeId);
  revalidatePath("/cong-viec");
}

export async function moveTaskAction(id: number, toStatus: TaskStatus, toOrder?: number) {
  await moveTask(id, toStatus, toOrder);
  revalidatePath("/cong-viec");
}

export async function deleteTaskAction(id: number) {
  await deleteTask(id);
  revalidatePath("/cong-viec");
}
