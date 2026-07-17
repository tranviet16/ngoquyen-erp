"use server";

import { revalidatePath } from "next/cache";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import {
  createComment,
  deleteComment,
  editComment,
  listComments,
  type CommentRow,
} from "@/lib/task/comment-service";

export async function listCommentsAction(taskId: number): Promise<CommentRow[]> {
  await requireReleasedModuleRequest("van-hanh.cong-viec", { minLevel: "read", scope: "module" });
  return listComments(taskId);
}

export async function createCommentAction(taskId: number, body: string): Promise<CommentRow> {
  await requireReleasedModuleRequest("van-hanh.cong-viec", { minLevel: "comment", scope: "module" });
  const row = await createComment(taskId, body);
  revalidatePath("/van-hanh/cong-viec");
  return row;
}

export async function editCommentAction(commentId: number, body: string): Promise<CommentRow> {
  await requireReleasedModuleRequest("van-hanh.cong-viec", { minLevel: "comment", scope: "module" });
  return editComment(commentId, body);
}

export async function deleteCommentAction(commentId: number): Promise<void> {
  await requireReleasedModuleRequest("van-hanh.cong-viec", { minLevel: "comment", scope: "module" });
  await deleteComment(commentId);
  revalidatePath("/van-hanh/cong-viec");
}
