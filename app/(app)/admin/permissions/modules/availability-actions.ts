"use server";

import { revalidatePath } from "next/cache";
import { assertModuleReleased } from "@/lib/acl";
import { MODULE_KEYS } from "@/lib/acl/modules";
import type { ModuleAvailabilityStatus, ModuleKey } from "@/lib/acl";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { bypassAudit } from "@/lib/async-context";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set<ModuleAvailabilityStatus>(["ready", "development"]);
const PROTECTED_MODULES = new Set<ModuleKey>(["dashboard", "admin.permissions"]);

export type ModuleAvailabilityChange = {
  moduleKey: string;
  status: string;
  previousStatus: string;
};

function validateChanges(changes: ModuleAvailabilityChange[]): Array<{
  moduleKey: ModuleKey;
  status: ModuleAvailabilityStatus;
  previousStatus: ModuleAvailabilityStatus;
}> {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error("Không có thay đổi trạng thái nào để lưu");
  }
  if (changes.length > MODULE_KEYS.length) {
    throw new Error("Danh sách thay đổi không hợp lệ");
  }

  const seen = new Set<string>();
  return changes.map((change) => {
    if (
      !change ||
      typeof change.moduleKey !== "string" ||
      typeof change.status !== "string" ||
      typeof change.previousStatus !== "string"
    ) {
      throw new Error("Dữ liệu thay đổi không hợp lệ");
    }
    const { moduleKey, status, previousStatus } = change;
    if (!(MODULE_KEYS as readonly string[]).includes(moduleKey)) {
      throw new Error(`Module không hợp lệ: ${moduleKey}`);
    }
    if (!VALID_STATUSES.has(status as ModuleAvailabilityStatus)) {
      throw new Error(`Trạng thái không hợp lệ: ${status}`);
    }
    if (!VALID_STATUSES.has(previousStatus as ModuleAvailabilityStatus)) {
      throw new Error(`Trạng thái trước đó không hợp lệ: ${previousStatus}`);
    }
    if (PROTECTED_MODULES.has(moduleKey as ModuleKey)) {
      throw new Error(`Không thể thay đổi trạng thái module cốt lõi: ${moduleKey}`);
    }
    if (seen.has(moduleKey)) {
      throw new Error(`Module bị lặp trong danh sách: ${moduleKey}`);
    }
    seen.add(moduleKey);
    return {
      moduleKey: moduleKey as ModuleKey,
      status: status as ModuleAvailabilityStatus,
      previousStatus: previousStatus as ModuleAvailabilityStatus,
    };
  });
}

export async function updateModuleAvailability(
  changes: ModuleAvailabilityChange[],
): Promise<{ updated: number }> {
  const adminId = await requireActiveAdmin();
  await assertModuleReleased("admin.permissions");
  const validated = validateChanges(changes);

  const writeAvailability = () =>
    prisma.$transaction(async (tx) => {
      const beforeRows = await tx.moduleAvailability.findMany({
        where: { moduleKey: { in: validated.map((change) => change.moduleKey) } },
        select: { moduleKey: true, status: true },
      });
      const beforeByKey = new Map(beforeRows.map((row) => [row.moduleKey, row.status]));
      if (beforeByKey.size !== validated.length) {
        throw new Error("Không tìm thấy đầy đủ cấu hình module");
      }

      let changedCount = 0;
      for (const change of validated) {
        const beforeStatus = beforeByKey.get(change.moduleKey);
        if (beforeStatus !== change.previousStatus) {
          throw new Error(
            `Trạng thái ${change.moduleKey} đã thay đổi. Hãy đóng và mở lại cửa sổ để tải dữ liệu mới.`,
          );
        }
        if (beforeStatus === change.status) continue;

        await tx.moduleAvailability.update({
          where: { moduleKey: change.moduleKey },
          data: { status: change.status },
        });
        await tx.auditLog.create({
          data: {
            userId: adminId,
            tableName: "module_availability",
            recordId: change.moduleKey,
            action: "update",
            beforeJson: { status: beforeStatus },
            afterJson: { status: change.status },
          },
        });
        changedCount += 1;
      }
      return changedCount;
    }, { isolationLevel: "Serializable" });

  let updated = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      updated = await bypassAudit(writeAvailability);
      break;
    } catch (error) {
      const serializationConflict =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034";
      if (serializationConflict && attempt === 0) continue;
      if (serializationConflict) {
        throw new Error("Có thay đổi đồng thời. Hãy thử lưu lại trạng thái module.");
      }
      throw error;
    }
  }

  revalidatePath("/admin/permissions/modules");
  revalidatePath("/", "layout");
  return { updated };
}
