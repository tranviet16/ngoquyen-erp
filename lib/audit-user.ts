import { prisma } from "@/lib/prisma";

type AuditAction = "profile_update" | "password_change";

export async function logUserAudit(
  action: AuditAction,
  actorUserId: string,
  targetUserId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: actorUserId,
      tableName: "User",
      recordId: targetUserId,
      action,
      beforeJson: before ?? undefined,
      afterJson: after ?? undefined,
    },
  });
}
