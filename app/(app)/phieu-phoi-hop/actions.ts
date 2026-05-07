"use server";

import { revalidatePath } from "next/cache";
import {
  createDraft,
  updateDraft,
  submitForm,
  cancelForm,
  leaderApprove,
  leaderRejectRevise,
  leaderRejectClose,
  directorApprove,
  directorRejectRevise,
  directorRejectClose,
} from "@/lib/coordination-form/coordination-form-service";
import { createDraftSchema, updateDraftSchema } from "@/lib/coordination-form/schemas";

export async function createDraftAction(input: unknown) {
  const data = createDraftSchema.parse(input);
  const form = await createDraft(data);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function updateDraftAction(id: number, input: unknown) {
  const data = updateDraftSchema.parse(input);
  const form = await updateDraft(id, data);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function submitFormAction(id: number) {
  const form = await submitForm(id);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function cancelFormAction(id: number) {
  const form = await cancelForm(id);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function leaderApproveAction(id: number, comment?: string) {
  const form = await leaderApprove(id, comment);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function leaderRejectReviseAction(id: number, comment: string) {
  const form = await leaderRejectRevise(id, comment);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function leaderRejectCloseAction(id: number, comment: string) {
  const form = await leaderRejectClose(id, comment);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function directorApproveAction(id: number, comment?: string) {
  const form = await directorApprove(id, comment);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function directorRejectReviseAction(id: number, comment: string) {
  const form = await directorRejectRevise(id, comment);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}

export async function directorRejectCloseAction(id: number, comment: string) {
  const form = await directorRejectClose(id, comment);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return form;
}
