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
  listAssigneeCandidates,
} from "@/lib/coordination-form/coordination-form-service";
import { createDraftSchema, updateDraftSchema } from "@/lib/coordination-form/schemas";

export async function createDraftAction(input: unknown) {
  const data = createDraftSchema.parse(input);
  const form = await createDraft(data);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function updateDraftAction(id: number, input: unknown) {
  const data = updateDraftSchema.parse(input);
  const form = await updateDraft(id, data);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function submitFormAction(id: number) {
  const form = await submitForm(id);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function cancelFormAction(id: number) {
  const form = await cancelForm(id);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function leaderApproveAction(id: number, assigneeId: string, comment?: string) {
  const form = await leaderApprove(id, assigneeId, comment);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  revalidatePath("/van-hanh/cong-viec");
  return form;
}

export async function leaderRejectReviseAction(id: number, comment: string) {
  const form = await leaderRejectRevise(id, comment);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function leaderRejectCloseAction(id: number, comment: string) {
  const form = await leaderRejectClose(id, comment);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function listAssigneeCandidatesAction(formId: number) {
  return listAssigneeCandidates(formId);
}
