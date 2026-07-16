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
import {
  createUserAccount,
  type CreateUserAccountInput,
} from "@/lib/admin/user-account-service";

export async function createUserAccountAction(input: CreateUserAccountInput) {
  await requireReleasedModuleRequest("admin.nguoi-dung");
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
  await setGrant(userId, deptId, level);
  revalidatePath("/admin/nguoi-dung");
}

export async function removeGrantAction(userId: string, deptId: number) {
  await requireReleasedModuleRequest("admin.nguoi-dung");
  await removeGrant(userId, deptId);
  revalidatePath("/admin/nguoi-dung");
}

export async function updateUserAttributesAction(
  input: UpdateUserAttributesInput,
) {
  await requireReleasedModuleRequest("admin.nguoi-dung");
  await updateUserAttributes(input);
  revalidatePath("/admin/nguoi-dung");
}
