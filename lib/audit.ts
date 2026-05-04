import { prisma } from "./prisma";
import { getCurrentUserId } from "./async-context";
import { Prisma } from "@prisma/client";

interface AuditOptions {
  tableName: string;
  recordId: string;
  action: "create" | "update" | "delete" | string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  userId?: string | null;
}

export async function writeAuditLog(opts: AuditOptions): Promise<void> {
  const userId = opts.userId ?? getCurrentUserId() ?? null;
  await prisma.auditLog.create({
    data: {
      userId,
      tableName: opts.tableName,
      recordId: opts.recordId,
      action: opts.action,
      beforeJson: opts.before,
      afterJson: opts.after,
    },
  });
}
