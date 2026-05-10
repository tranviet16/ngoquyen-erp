"use server";

import { revalidatePath } from "next/cache";
import {
  createComment,
  deleteComment,
  editComment,
  listComments,
  type CommentRow,
} from "@/lib/task/comment-service";

export async function listCommentsAction(taskId: number): Promise<CommentRow[]> {
  return listComments(taskId);
}

export async function createCommentAction(taskId: number, body: string): Promise<CommentRow> {
  const row = await createComment(taskId, body);
  revalidatePath("/van-hanh/cong-viec");
  return row;
}

export async function editCommentAction(commentId: number, body: string): Promise<CommentRow> {
  return editComment(commentId, body);
}

export async function deleteCommentAction(commentId: number): Promise<void> {
  await deleteComment(commentId);
  revalidatePath("/van-hanh/cong-viec");
}
