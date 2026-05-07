import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { bypassAudit } from "@/lib/async-context";
import { LEVEL_ORDER, type AccessLevel } from "@/lib/dept-access";

async function assertAdmin(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  if (session.user.role !== "admin") throw new Error("Chỉ admin được thao tác");
  return session.user.id;
}

function isAccessLevel(s: string): s is AccessLevel {
  return LEVEL_ORDER.includes(s as AccessLevel);
}

export interface UserWithGrants {
  id: string;
  name: string | null;
  email: string;
  role: string;
  departmentId: number | null;
  departmentName: string | null;
  isLeader: boolean;
  isDirector: boolean;
  grants: { deptId: number; deptName: string; level: AccessLevel }[];
}

export async function listUsersWithGrants(): Promise<UserWithGrants[]> {
  await assertAdmin();
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
    email: u.email,
    role: u.role ?? "viewer",
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    isLeader: u.isLeader,
    isDirector: u.isDirector,
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
  const adminId = await assertAdmin();
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
  const adminId = await assertAdmin();
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
