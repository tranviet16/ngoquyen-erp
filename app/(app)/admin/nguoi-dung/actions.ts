"use server";

import { revalidatePath } from "next/cache";
import {
  setGrant,
  removeGrant,
  updateUserAttributes,
  type UpdateUserAttributesInput,
} from "@/lib/admin/user-grants-service";
import type { AccessLevel } from "@/lib/dept-access";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import {
  createUserAccount,
  type CreateUserAccountInput,
} from "@/lib/admin/user-account-service";

export async function createUserAccountAction(input: CreateUserAccountInput) {
  await requireReleasedModuleRequest("admin.nguoi-dung");
  await requireActiveAdmin();
  const result = await createUserAccount(input);
  revalidatePath("/admin/nguoi-dung");
  return result;
}

export async function setGrantAction(
  userId: string,
  deptId: number,
  level: AccessLevel,
) {
  await requireReleasedModuleRequest("admin.nguoi-dung");
  await requireActiveAdmin();
  await setGrant(userId, deptId, level);
  revalidatePath("/admin/nguoi-dung");
}

export async function removeGrantAction(userId: string, deptId: number) {
  await requireReleasedModuleRequest("admin.nguoi-dung");
  await requireActiveAdmin();
  await removeGrant(userId, deptId);
  revalidatePath("/admin/nguoi-dung");
}

export async function updateUserAttributesAction(
  input: UpdateUserAttributesInput,
) {
  await requireReleasedModuleRequest("admin.nguoi-dung");
  await requireActiveAdmin();
  await updateUserAttributes(input);
  revalidatePath("/admin/nguoi-dung");
}
