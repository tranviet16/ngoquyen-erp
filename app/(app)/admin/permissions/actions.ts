"use server";

/**
 * AUDIT MIDDLEWARE DECISION — verified 2026-05-10
 *
 * lib/prisma.ts uses $extends to intercept create/update/delete on all models.
 * However, ModulePermission, ProjectPermission, and ProjectGrantAll all use
 * composite primary keys ([userId, moduleKey], [userId, projectId], userId).
 * The middleware's safeReadBefore() reads via `where: { id }` — composite-PK
 * models have no single `id` field, so before-state capture would be null.
 *
 * Additionally, `upsert` is BLOCKED by the middleware outside bypassAudit().
 * Since "default" level means delete and any other level means upsert, every
 * mutation goes through bypassAudit() + explicit writeAuditLog(), matching the
 * pattern established in lib/admin/user-grants-service.ts.
 *
 * DECISION: Server actions use bypassAudit() for all mutations and call
 * writeAuditLog() explicitly per change. No manual AuditLog.create elsewhere.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { bypassAudit } from "@/lib/async-context";
import {
  MODULE_KEYS,
  MODULE_LEVELS,
  isValidLevelForModule,
  type ModuleKey,
  type AccessLevel,
} from "@/lib/acl/modules";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ModulePermissionChange = {
  userId: string;
  moduleKey: ModuleKey;
  level: AccessLevel | "default";
};

export type BulkResult = {
  applied: number;
  rejected: { change: ModulePermissionChange; reason: string }[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function assertAdmin(): Promise<string> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  requireRole(session.user.role, "admin");
  return session.user.id;
}

function isValidModuleKey(key: string): key is ModuleKey {
  return MODULE_KEYS.includes(key as ModuleKey);
}

// ─── Module permission ─────────────────────────────────────────────────────────

/**
 * Set or remove a single module permission for a user.
 * level === "default" → delete row (D2: revoke = delete).
 */
export async function setModulePermission(
  change: ModulePermissionChange,
): Promise<void> {
  const adminId = await assertAdmin();
  const { userId, moduleKey, level } = change;

  if (!isValidModuleKey(moduleKey)) {
    throw new Error(`Module không hợp lệ: ${moduleKey}`);
  }
  if (level !== "default" && !isValidLevelForModule(moduleKey, level)) {
    throw new Error(`Cấp quyền "${level}" không hợp lệ cho module "${moduleKey}"`);
  }
  // Self-lockout guard: refuse to demote current admin's own admin.permissions access
  if (userId === adminId && moduleKey === "admin.permissions" && level !== "admin") {
    throw new Error("Không thể hạ quyền của chính mình trên module Phân quyền");
  }

  const existing = await prisma.modulePermission.findUnique({
    where: { userId_moduleKey: { userId, moduleKey } },
  });

  if (level === "default") {
    if (!existing) return;
    await bypassAudit(() =>
      prisma.modulePermission.deleteMany({ where: { userId, moduleKey } }),
    );
    await writeAuditLog({
      tableName: "module_permissions",
      recordId: `${userId}:${moduleKey}`,
      action: "delete",
      before: { level: existing.level },
      userId: adminId,
    });
  } else {
    await bypassAudit(() =>
      prisma.modulePermission.upsert({
        where: { userId_moduleKey: { userId, moduleKey } },
        create: { userId, moduleKey, level, grantedBy: adminId },
        update: { level, grantedBy: adminId },
      }),
    );
    await writeAuditLog({
      tableName: "module_permissions",
      recordId: `${userId}:${moduleKey}`,
      action: existing ? "update" : "create",
      before: existing ? { level: existing.level } : undefined,
      after: { level },
      userId: adminId,
    });
  }

  revalidatePath("/admin/permissions");
}

/**
 * Bulk commit for the matrix editor (D5).
 * Validates each change, guards self-lockout, chunks into batches of 100.
 * Returns { applied, rejected } so the caller can toast rejected items.
 */
export async function bulkApplyModulePermissionChanges(
  changes: ModulePermissionChange[],
): Promise<BulkResult> {
  const adminId = await assertAdmin();

  const applied: ModulePermissionChange[] = [];
  const rejected: BulkResult["rejected"] = [];

  for (const change of changes) {
    const { userId, moduleKey, level } = change;

    if (!isValidModuleKey(moduleKey)) {
      rejected.push({ change, reason: `Module không hợp lệ: ${moduleKey}` });
      continue;
    }
    if (level !== "default" && !isValidLevelForModule(moduleKey, level)) {
      rejected.push({
        change,
        reason: `Cấp "${level}" không hợp lệ cho module "${moduleKey}"`,
      });
      continue;
    }
    // Self-lockout guard: refuse to demote current admin's own admin.permissions access
    if (
      userId === adminId &&
      moduleKey === "admin.permissions" &&
      level !== "admin"
    ) {
      rejected.push({
        change,
        reason: "Không thể hạ quyền của chính mình trên module Phân quyền",
      });
      continue;
    }

    applied.push(change);
  }

  if (applied.length === 0) {
    return { applied: 0, rejected };
  }

  // Load existing rows for audit before/after comparison
  const pairs = await Promise.all(
    applied.map(({ userId, moduleKey }) =>
      prisma.modulePermission.findUnique({
        where: { userId_moduleKey: { userId, moduleKey } },
      }),
    ),
  );

  // Chunk into batches of 100
  const BATCH = 100;
  for (let i = 0; i < applied.length; i += BATCH) {
    const batch = applied.slice(i, i + BATCH);
    const batchPairs = pairs.slice(i, i + BATCH);

    await bypassAudit(async () => {
      const ops = batch.map((change, idx) => {
        const { userId, moduleKey, level } = change;
        const existing = batchPairs[idx];
        if (level === "default") {
          if (!existing) return null;
          return prisma.modulePermission.deleteMany({ where: { userId, moduleKey } });
        }
        return prisma.modulePermission.upsert({
          where: { userId_moduleKey: { userId, moduleKey } },
          create: { userId, moduleKey, level, grantedBy: adminId },
          update: { level, grantedBy: adminId },
        });
      });
      // Filter out nulls (no-op deletes)
      const filtered = ops.filter(Boolean) as NonNullable<typeof ops[number]>[];
      if (filtered.length > 0) {
        await prisma.$transaction(filtered);
      }
    });

    // Write audit rows after transaction
    for (let j = 0; j < batch.length; j++) {
      const { userId, moduleKey, level } = batch[j];
      const existing = batchPairs[j];
      if (level === "default" && !existing) continue;
      await writeAuditLog({
        tableName: "module_permissions",
        recordId: `${userId}:${moduleKey}`,
        action: level === "default" ? "delete" : existing ? "update" : "create",
        before: existing ? { level: existing.level } : undefined,
        after: level !== "default" ? { level } : undefined,
        userId: adminId,
      });
    }
  }

  revalidatePath("/admin/permissions");
  revalidatePath("/admin/permissions/modules");

  return { applied: applied.length, rejected };
}

// ─── Project permission ────────────────────────────────────────────────────────

/**
 * Set or remove a per-project permission for a user.
 * level === "default" → delete row.
 */
export async function setProjectPermission(
  userId: string,
  projectId: number,
  level: AccessLevel | "default",
): Promise<void> {
  const adminId = await assertAdmin();

  if (level !== "default" && !isValidLevelForModule("du-an", level)) {
    throw new Error(`Cấp "${level}" không hợp lệ cho dự án`);
  }

  const existing = await prisma.projectPermission.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  if (level === "default") {
    if (!existing) return;
    await bypassAudit(() =>
      prisma.projectPermission.deleteMany({ where: { userId, projectId } }),
    );
    await writeAuditLog({
      tableName: "project_permissions",
      recordId: `${userId}:${projectId}`,
      action: "delete",
      before: { level: existing.level },
      userId: adminId,
    });
  } else {
    await bypassAudit(() =>
      prisma.projectPermission.upsert({
        where: { userId_projectId: { userId, projectId } },
        create: { userId, projectId, level, grantedBy: adminId },
        update: { level, grantedBy: adminId },
      }),
    );
    await writeAuditLog({
      tableName: "project_permissions",
      recordId: `${userId}:${projectId}`,
      action: existing ? "update" : "create",
      before: existing ? { level: existing.level } : undefined,
      after: { level },
      userId: adminId,
    });
  }

  revalidatePath("/admin/permissions");
  revalidatePath("/admin/permissions/projects");
}

/**
 * Set or remove the "grant all projects" super-grant for a user.
 * level === "default" → delete row.
 */
export async function setProjectGrantAll(
  userId: string,
  level: AccessLevel | "default",
): Promise<void> {
  const adminId = await assertAdmin();

  if (level !== "default" && !isValidLevelForModule("du-an", level)) {
    throw new Error(`Cấp "${level}" không hợp lệ cho dự án`);
  }

  const existing = await prisma.projectGrantAll.findUnique({
    where: { userId },
  });

  if (level === "default") {
    if (!existing) return;
    await bypassAudit(() =>
      prisma.projectGrantAll.deleteMany({ where: { userId } }),
    );
    await writeAuditLog({
      tableName: "project_grant_all",
      recordId: userId,
      action: "delete",
      before: { level: existing.level },
      userId: adminId,
    });
  } else {
    await bypassAudit(() =>
      prisma.projectGrantAll.upsert({
        where: { userId },
        create: { userId, level, grantedBy: adminId },
        update: { level, grantedBy: adminId },
      }),
    );
    await writeAuditLog({
      tableName: "project_grant_all",
      recordId: userId,
      action: existing ? "update" : "create",
      before: existing ? { level: existing.level } : undefined,
      after: { level },
      userId: adminId,
    });
  }

  revalidatePath("/admin/permissions");
  revalidatePath("/admin/permissions/projects");
}
