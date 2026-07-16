"use server";

import { revalidatePath } from "next/cache";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import {
  deleteAttachment,
  listAttachments,
  uploadAttachment,
  type AttachmentRow,
} from "@/lib/task/attachment-service";

export async function listAttachmentsAction(taskId: number): Promise<AttachmentRow[]> {
  await requireReleasedModuleRequest("van-hanh.cong-viec");
  return listAttachments(taskId);
}

export async function uploadAttachmentAction(formData: FormData): Promise<AttachmentRow> {
  await requireReleasedModuleRequest("van-hanh.cong-viec");
  const taskIdRaw = formData.get("taskId");
  const file = formData.get("file");
  const taskId = Number(taskIdRaw);
  if (!Number.isInteger(taskId)) throw new Error("taskId không hợp lệ");
  if (!(file instanceof File)) throw new Error("Không có file");
  const row = await uploadAttachment(taskId, file);
  revalidatePath("/van-hanh/cong-viec");
  return row;
}

export async function deleteAttachmentAction(id: number): Promise<void> {
  await requireReleasedModuleRequest("van-hanh.cong-viec");
  await deleteAttachment(id);
  revalidatePath("/van-hanh/cong-viec");
}
