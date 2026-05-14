"use server";

import { revalidatePath } from "next/cache";
import {
  setGrant,
  removeGrant,
  updateUserAttributes,
  type UpdateUserAttributesInput,
} from "@/lib/admin/user-grants-service";
import type { AccessLevel } from "@/lib/dept-access";

export async function setGrantAction(
  userId: string,
  deptId: number,
  level: AccessLevel,
) {
  await setGrant(userId, deptId, level);
  revalidatePath("/admin/nguoi-dung");
}

export async function removeGrantAction(userId: string, deptId: number) {
  await removeGrant(userId, deptId);
  revalidatePath("/admin/nguoi-dung");
}

export async function updateUserAttributesAction(
  input: UpdateUserAttributesInput,
) {
  await updateUserAttributes(input);
  revalidatePath("/admin/nguoi-dung");
}
