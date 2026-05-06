import { prisma } from "./prisma";

export interface UserContext {
  userId: string;
  departmentId: number | null;
  isLeader: boolean;
  isDirector: boolean;
}

export async function getUserContext(userId: string): Promise<UserContext | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, departmentId: true, isLeader: true, isDirector: true },
  });
  if (!u) return null;
  return {
    userId: u.id,
    departmentId: u.departmentId,
    isLeader: u.isLeader,
    isDirector: u.isDirector,
  };
}

export async function isDeptLeader(userId: string, deptId: number): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true, isLeader: true },
  });
  return !!u && u.isLeader && u.departmentId === deptId;
}

export async function getDirectorId(): Promise<string | null> {
  const u = await prisma.user.findFirst({
    where: { isDirector: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return u?.id ?? null;
}

export async function getDeptLeaders(deptId: number): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { departmentId: deptId, isLeader: true },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function canSubmitFormToDept(deptId: number): Promise<boolean> {
  const leaders = await getDeptLeaders(deptId);
  return leaders.length > 0;
}
