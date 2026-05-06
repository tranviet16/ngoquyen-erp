"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
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
  requireRole(session?.user?.role, "admin");
}

export async function createDepartmentAction(data: { code: string; name: string }) {
  await requireAdmin();
  const dept = await createDepartment(data);
  revalidatePath("/admin/phong-ban");
  return dept;
}

export async function updateDepartmentAction(
  id: number,
  data: Partial<{ code: string; name: string; isActive: boolean }>
) {
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
  await requireAdmin();
  await assignUserToDept(userId, departmentId, { isLeader });
  revalidatePath("/admin/phong-ban");
}

export async function setDirectorAction(userId: string) {
  await requireAdmin();
  await setDirector(userId);
  revalidatePath("/admin/phong-ban");
}

export async function unsetDirectorAction(userId: string) {
  await requireAdmin();
  await unsetDirector(userId);
  revalidatePath("/admin/phong-ban");
}
