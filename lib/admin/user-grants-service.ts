import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { bypassAudit } from "@/lib/async-context";
import { LEVEL_ORDER, type AccessLevel } from "@/lib/dept-access";
import { requireActiveAdmin } from "./require-active-admin";

function isAccessLevel(s: string): s is AccessLevel {
  return LEVEL_ORDER.includes(s as AccessLevel);
}

export interface UserWithGrants {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  role: string;
  departmentId: number | null;
  departmentName: string | null;
  isLeader: boolean;
  isDirector: boolean;
  isActive: boolean;
  grants: { deptId: number; deptName: string; level: AccessLevel }[];
}

export async function listUsersWithGrants(): Promise<UserWithGrants[]> {
  await requireActiveAdmin();
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: {
      department: { select: { id: true, name: true } },
      deptAccess: {
        include: { dept: { select: { id: true, name: true } } },
      },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role ?? "viewer",
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    isLeader: u.isLeader,
    isDirector: u.isDirector,
    isActive: u.isActive,
    grants: u.deptAccess
      .filter((g) => isAccessLevel(g.level))
      .map((g) => ({
        deptId: g.deptId,
        deptName: g.dept.name,
        level: g.level as AccessLevel,
      })),
  }));
}

export async function setGrant(
  userId: string,
  deptId: number,
  level: AccessLevel,
): Promise<void> {
  const adminId = await requireActiveAdmin();
  if (!isAccessLevel(level)) throw new Error("Cấp quyền không hợp lệ");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  if (!user) throw new Error("Không tìm thấy user");
  if (user.departmentId === deptId) {
    throw new Error("Không cần cấp quyền cho phòng của chính user");
  }

  const existing = await prisma.userDeptAccess.findUnique({
    where: { userId_deptId: { userId, deptId } },
  });

  await bypassAudit(() =>
    prisma.userDeptAccess.upsert({
      where: { userId_deptId: { userId, deptId } },
      create: { userId, deptId, level, grantedBy: adminId },
      update: { level, grantedBy: adminId },
    }),
  );

  await writeAuditLog({
    tableName: "user_dept_access",
    recordId: `${userId}:${deptId}`,
    action: existing ? "update" : "create",
    before: existing ? { level: existing.level } : undefined,
    after: { level },
    userId: adminId,
  });
}

export async function removeGrant(userId: string, deptId: number): Promise<void> {
  const adminId = await requireActiveAdmin();
  const existing = await prisma.userDeptAccess.findUnique({
    where: { userId_deptId: { userId, deptId } },
  });
  if (!existing) return;
  await prisma.userDeptAccess.delete({
    where: { userId_deptId: { userId, deptId } },
  });
  await writeAuditLog({
    tableName: "user_dept_access",
    recordId: `${userId}:${deptId}`,
    action: "delete",
    before: { level: existing.level },
    userId: adminId,
  });
}

export interface UpdateUserAttributesInput {
  userId: string;
  role: string;
  isLeader: boolean;
  isDirector: boolean;
  isActive: boolean;
  departmentId: number | null;
}

export async function updateUserAttributes(
  input: UpdateUserAttributesInput,
): Promise<void> {
  const adminId = await requireActiveAdmin();

  const roleExists = await prisma.role.findUnique({
    where: { id: input.role },
    select: { id: true },
  });
  if (!roleExists) {
    throw new Error(`Role không hợp lệ: ${input.role}`);
  }

  if (input.userId === adminId && input.role !== "admin") {
    throw new Error("Không thể tự hạ quyền admin của chính mình");
  }
  if (input.userId === adminId && !input.isActive) {
    throw new Error("Không thể tự vô hiệu hóa tài khoản của chính mình");
  }

  if (input.isLeader && input.departmentId === null) {
    throw new Error("Trưởng bộ phận phải có phòng");
  }

  if (input.departmentId !== null) {
    const exists = await prisma.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true },
    });
    if (!exists) throw new Error("Phòng không tồn tại");
  }

  // Audit log written automatically by prisma $extends update interceptor (lib/prisma.ts).
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      role: input.role,
      isLeader: input.isActive ? input.isLeader : false,
      isDirector: input.isActive ? input.isDirector : false,
      isActive: input.isActive,
      departmentId: input.departmentId,
    },
  });
}

/**
 * Phase-5 hook: clear all grants for a user. Wired into assignUserToDept
 * when transitioning A→B (not null→X). Audits each row.
 */
export async function clearGrants(userId: string, actorId?: string): Promise<void> {
  const existing = await prisma.userDeptAccess.findMany({ where: { userId } });
  if (existing.length === 0) return;
  await bypassAudit(() =>
    prisma.userDeptAccess.deleteMany({ where: { userId } }),
  );
  for (const g of existing) {
    await writeAuditLog({
      tableName: "user_dept_access",
      recordId: `${g.userId}:${g.deptId}`,
      action: "delete",
      before: { level: g.level },
      userId: actorId ?? null,
    });
  }
}
