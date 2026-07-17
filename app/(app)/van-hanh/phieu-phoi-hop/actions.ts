"use server";

import { revalidatePath } from "next/cache";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
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
  await requireReleasedModuleRequest("van-hanh.phieu-phoi-hop", { minLevel: "create", scope: "module" });
  const data = createDraftSchema.parse(input);
  const form = await createDraft(data);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function updateDraftAction(id: number, input: unknown) {
  await requireReleasedModuleRequest("van-hanh.phieu-phoi-hop", { minLevel: "edit", scope: "module" });
  const data = updateDraftSchema.parse(input);
  const form = await updateDraft(id, data);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function submitFormAction(id: number) {
  await requireReleasedModuleRequest("van-hanh.phieu-phoi-hop", { minLevel: "edit", scope: "module" });
  const form = await submitForm(id);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function cancelFormAction(id: number) {
  await requireReleasedModuleRequest("van-hanh.phieu-phoi-hop", { minLevel: "edit", scope: "module" });
  const form = await cancelForm(id);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function leaderApproveAction(id: number, assigneeId: string, comment?: string) {
  await requireReleasedModuleRequest("van-hanh.phieu-phoi-hop", { minLevel: "edit", scope: "module" });
  const form = await leaderApprove(id, assigneeId, comment);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  revalidatePath("/van-hanh/cong-viec");
  return form;
}

export async function leaderRejectReviseAction(id: number, comment: string) {
  await requireReleasedModuleRequest("van-hanh.phieu-phoi-hop", { minLevel: "edit", scope: "module" });
  const form = await leaderRejectRevise(id, comment);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function leaderRejectCloseAction(id: number, comment: string) {
  await requireReleasedModuleRequest("van-hanh.phieu-phoi-hop", { minLevel: "edit", scope: "module" });
  const form = await leaderRejectClose(id, comment);
  revalidatePath(`/van-hanh/phieu-phoi-hop/${id}`);
  revalidatePath("/van-hanh/phieu-phoi-hop");
  return form;
}

export async function listAssigneeCandidatesAction(formId: number) {
  await requireReleasedModuleRequest("van-hanh.phieu-phoi-hop", { minLevel: "read", scope: "module" });
  return listAssigneeCandidates(formId);
}
