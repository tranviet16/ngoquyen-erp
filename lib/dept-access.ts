import { prisma } from "./prisma";
import { ACCESS_LEVELS, LEVEL_RANK, type AccessLevel } from "./acl/modules";

export { type AccessLevel } from "./acl/modules";

export const LEVEL_ORDER = ACCESS_LEVELS;

export interface DeptAccessMap {
  scope: "all" | "scoped";
  grants: Map<number, AccessLevel>;
}

function isAccessLevel(s: string): s is AccessLevel {
  return (ACCESS_LEVELS as readonly string[]).includes(s);
}

export async function getDeptAccessMap(userId: string): Promise<DeptAccessMap> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, isDirector: true, departmentId: true },
  });
  if (!u || u.isActive === false) return { scope: "scoped", grants: new Map() };
  if (u.role === "admin" || u.isDirector) return { scope: "all", grants: new Map() };

  const grants = new Map<number, AccessLevel>();
  if (u.departmentId !== null) grants.set(u.departmentId, "edit");

  const rows = await prisma.userDeptAccess.findMany({
    where: { userId },
    select: { deptId: true, level: true },
  });
  for (const r of rows) {
    if (!isAccessLevel(r.level)) continue;
    const existing = grants.get(r.deptId);
    if (!existing || LEVEL_RANK[r.level] > LEVEL_RANK[existing]) {
      grants.set(r.deptId, r.level);
    }
  }
  return { scope: "scoped", grants };
}

export function hasDeptAccess(
  map: DeptAccessMap,
  deptId: number,
  min: AccessLevel,
): boolean {
  if (map.scope === "all") return true;
  const have = map.grants.get(deptId);
  if (!have) return false;
  return LEVEL_RANK[have] >= LEVEL_RANK[min];
}

export function assertDeptAccess(
  map: DeptAccessMap,
  deptId: number,
  min: AccessLevel,
  msg?: string,
): void {
  if (!hasDeptAccess(map, deptId, min)) {
    const labels: Record<AccessLevel, string> = {
      read: "xem",
      create: "tạo mới",
      comment: "bình luận",
      edit: "chỉnh sửa",
    };
    throw new Error(msg ?? `Bạn không có quyền ${labels[min]} ở phòng này`);
  }
}

export async function listViewableDeptIds(userId: string): Promise<number[] | "all"> {
  const map = await getDeptAccessMap(userId);
  if (map.scope === "all") return "all";
  return Array.from(map.grants.keys());
}
