"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import {
  createDepartment,
  updateDepartment,
  assignUserToDept,
  setDirector,
  unsetDirector,
} from "@/lib/department-service";

async function requireAdmin() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  await requireRoleModuleAccess(session?.user?.role, "admin.phong-ban", "admin");
}

export async function createDepartmentAction(data: { code: string; name: string }) {
  await requireReleasedModuleRequest("admin.phong-ban");
  await requireAdmin();
  const dept = await createDepartment(data);
  revalidatePath("/admin/phong-ban");
  return dept;
}

export async function updateDepartmentAction(
  id: number,
  data: Partial<{ code: string; name: string; isActive: boolean }>
) {
  await requireReleasedModuleRequest("admin.phong-ban");
  await requireAdmin();
  const dept = await updateDepartment(id, data);
  revalidatePath("/admin/phong-ban");
  return dept;
}

export async function assignUserAction(
  userId: string,
  departmentId: number | null,
  isLeader: boolean
) {
  await requireReleasedModuleRequest("admin.phong-ban");
  await requireAdmin();
  await assignUserToDept(userId, departmentId, { isLeader });
  revalidatePath("/admin/phong-ban");
}

export async function setDirectorAction(userId: string) {
  await requireReleasedModuleRequest("admin.phong-ban");
  await requireAdmin();
  await setDirector(userId);
  revalidatePath("/admin/phong-ban");
}

export async function unsetDirectorAction(userId: string) {
  await requireReleasedModuleRequest("admin.phong-ban");
  await requireAdmin();
  await unsetDirector(userId);
  revalidatePath("/admin/phong-ban");
}
