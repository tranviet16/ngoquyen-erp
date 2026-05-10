"use server";

import { revalidatePath } from "next/cache";
import {
  createSubtask,
  deleteSubtask,
  listChildren,
  reorderSubtasks,
  type SubtaskRow,
} from "@/lib/task/subtask-service";
import { moveTask } from "@/lib/task/task-service";
import type { TaskStatus } from "@/lib/task/state-machine";

export async function listChildrenAction(parentId: number): Promise<SubtaskRow[]> {
  return listChildren(parentId);
}

export async function createSubtaskAction(
  parentId: number,
  input: { title: string; assigneeId?: string | null; priority?: string },
): Promise<SubtaskRow> {
  const row = await createSubtask(parentId, input);
  revalidatePath("/van-hanh/cong-viec");
  return row;
}

export async function moveSubtaskAction(id: number, toStatus: TaskStatus): Promise<void> {
  await moveTask(id, toStatus);
  revalidatePath("/van-hanh/cong-viec");
}

export async function deleteSubtaskAction(id: number): Promise<void> {
  await deleteSubtask(id);
  revalidatePath("/van-hanh/cong-viec");
}

export async function reorderSubtasksAction(parentId: number, orderedIds: number[]): Promise<void> {
  await reorderSubtasks(parentId, orderedIds);
  revalidatePath("/van-hanh/cong-viec");
}
