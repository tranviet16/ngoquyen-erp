import { prisma } from "./prisma";
import type { Department, User } from "@prisma/client";
import { writeAuditLog } from "./audit";
import { bypassAudit } from "./async-context";

export type DepartmentMember = Pick<
  User,
  "id" | "name" | "email" | "role" | "departmentId" | "isLeader" | "isDirector"
>;

export async function listDepartments(opts?: { activeOnly?: boolean }): Promise<
  (Department & { _count: { members: number } })[]
> {
  return prisma.department.findMany({
    where: opts?.activeOnly ? { isActive: true } : undefined,
    include: { _count: { select: { members: true } } },
    orderBy: { code: "asc" },
  });
}

export async function createDepartment(data: {
  code: string;
  name: string;
}): Promise<Department> {
  const code = data.code.trim().toUpperCase();
  const name = data.name.trim();
  if (!code) throw new Error("Mã phòng ban không được trống");
  if (!name) throw new Error("Tên phòng ban không được trống");
  return prisma.department.create({ data: { code, name } });
}

export async function updateDepartment(
  id: number,
  data: Partial<{ code: string; name: string; isActive: boolean }>
): Promise<Department> {
  const patch: Record<string, unknown> = {};
  if (data.code !== undefined) {
    const c = data.code.trim().toUpperCase();
    if (!c) throw new Error("Mã phòng ban không được trống");
    patch.code = c;
  }
  if (data.name !== undefined) {
    const n = data.name.trim();
    if (!n) throw new Error("Tên phòng ban không được trống");
    patch.name = n;
  }
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  return prisma.department.update({ where: { id }, data: patch });
}

export async function listAllUsersForAdmin(): Promise<DepartmentMember[]> {
  return prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
      isLeader: true,
      isDirector: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function assignUserToDept(
  userId: string,
  departmentId: number | null,
  opts?: { isLeader?: boolean }
): Promise<void> {
  const isLeader = opts?.isLeader ?? false;
  if (isLeader && departmentId === null) {
    throw new Error("Lãnh đạo phòng phải thuộc 1 phòng ban");
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  const oldDeptId = existing?.departmentId ?? null;
  // A→B (both non-null and different): reset grants. null→X keeps grants.
  const shouldResetGrants =
    oldDeptId !== null && departmentId !== null && oldDeptId !== departmentId;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        departmentId,
        isLeader: departmentId === null ? false : isLeader,
      },
    });
    if (shouldResetGrants) {
      const grants = await tx.userDeptAccess.findMany({ where: { userId } });
      await bypassAudit(() =>
        tx.userDeptAccess.deleteMany({ where: { userId } }),
      );
      for (const g of grants) {
        await writeAuditLog({
          tableName: "user_dept_access",
          recordId: `${g.userId}:${g.deptId}`,
          action: "delete",
          before: { level: g.level },
        });
      }
    }
    if (oldDeptId !== departmentId) {
      await writeAuditLog({
        tableName: "users",
        recordId: userId,
        action: "dept_change",
        before: { departmentId: oldDeptId },
        after: { departmentId },
      });
    }
  });
}

export async function setDirector(userId: string): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("User không tồn tại");

  const existing = await prisma.user.findMany({
    where: { isDirector: true, NOT: { id: userId } },
    select: { id: true },
  });

  for (const u of existing) {
    await prisma.user.update({
      where: { id: u.id },
      data: { isDirector: false },
    });
  }

  if (!target.isDirector) {
    await prisma.user.update({
      where: { id: userId },
      data: { isDirector: true },
    });
  }
}

export async function unsetDirector(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { isDirector: false },
  });
}
