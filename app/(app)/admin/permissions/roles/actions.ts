"use server";

/**
 * Role management server actions.
 *
 * Role (single PK `id`) create/update/delete flow through the audit middleware
 * automatically. RolePermission has a composite PK [roleId, moduleKey] and is
 * mutated via createMany/deleteMany, which the middleware blocks outside
 * bypassAudit(); those writes are wrapped in bypassAudit() + an explicit
 * writeAuditLog() summary row, matching admin/permissions/actions.ts.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { bypassAudit } from "@/lib/async-context";
import {
  MODULE_KEYS,
  isValidLevelForModule,
  type ModuleKey,
  type AccessLevel,
} from "@/lib/acl/modules";

export type RolePermissionInput = {
  moduleKey: ModuleKey;
  level: AccessLevel;
};

export type RoleInput = {
  id: string;
  name: string;
  description?: string | null;
  permissions: RolePermissionInput[];
};

const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

async function assertPermissionsAdmin(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  await requireRoleModuleAccess(session.user.role, "admin.permissions", "admin");
  return session.user.id;
}

function validatePermissions(
  permissions: RolePermissionInput[],
): RolePermissionInput[] {
  const seen = new Set<string>();
  const clean: RolePermissionInput[] = [];
  for (const p of permissions) {
    if (!MODULE_KEYS.includes(p.moduleKey)) {
      throw new Error(`Module không hợp lệ: ${p.moduleKey}`);
    }
    if (!isValidLevelForModule(p.moduleKey, p.level)) {
      throw new Error(
        `Cấp quyền "${p.level}" không hợp lệ cho module "${p.moduleKey}"`,
      );
    }
    if (seen.has(p.moduleKey)) {
      throw new Error(`Module bị lặp: ${p.moduleKey}`);
    }
    seen.add(p.moduleKey);
    clean.push({ moduleKey: p.moduleKey, level: p.level });
  }
  return clean;
}

function permsToJson(
  perms: { moduleKey: string; level: string }[],
): Record<string, string> {
  return Object.fromEntries(
    [...perms]
      .sort((a, b) => a.moduleKey.localeCompare(b.moduleKey))
      .map((p) => [p.moduleKey, p.level]),
  );
}

export async function createRole(input: RoleInput): Promise<void> {
  await requireReleasedModuleRequest("admin.permissions");
  const adminId = await assertPermissionsAdmin();
  const id = input.id.trim().toLowerCase();
  const name = input.name.trim();

  if (!ID_PATTERN.test(id) || id.length < 2 || id.length > 32) {
    throw new Error(
      "Mã vai trò phải 2-32 ký tự, bắt đầu bằng chữ thường, chỉ gồm a-z 0-9 - _",
    );
  }
  if (!name) throw new Error("Tên vai trò không được để trống");

  const existing = await prisma.role.findUnique({
    where: { id },
    select: { id: true },
  });
  if (existing) throw new Error(`Mã vai trò "${id}" đã tồn tại`);

  const perms = validatePermissions(input.permissions);

  await prisma.role.create({
    data: { id, name, description: input.description?.trim() || null },
  });

  if (perms.length > 0) {
    await bypassAudit(() =>
      prisma.rolePermission.createMany({
        data: perms.map((p) => ({
          roleId: id,
          moduleKey: p.moduleKey,
          level: p.level,
        })),
      }),
    );
  }

  await writeAuditLog({
    tableName: "role_permissions",
    recordId: id,
    action: "create",
    after: permsToJson(perms),
    userId: adminId,
  });

  revalidatePath("/admin/permissions/roles");
  revalidatePath("/admin/permissions");
  revalidatePath("/admin/nguoi-dung");
}

export async function updateRole(
  id: string,
  input: {
    name: string;
    description?: string | null;
    permissions: RolePermissionInput[];
  },
): Promise<void> {
  await requireReleasedModuleRequest("admin.permissions");
  const adminId = await assertPermissionsAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Tên vai trò không được để trống");

  const role = await prisma.role.findUnique({
    where: { id },
    select: {
      id: true,
      permissions: { select: { moduleKey: true, level: true } },
    },
  });
  if (!role) throw new Error(`Vai trò "${id}" không tồn tại`);

  const perms = validatePermissions(input.permissions);

  await prisma.role.update({
    where: { id },
    data: { name, description: input.description?.trim() || null },
  });

  await bypassAudit(() =>
    prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      ...(perms.length > 0
        ? [
            prisma.rolePermission.createMany({
              data: perms.map((p) => ({
                roleId: id,
                moduleKey: p.moduleKey,
                level: p.level,
              })),
            }),
          ]
        : []),
    ]),
  );

  await writeAuditLog({
    tableName: "role_permissions",
    recordId: id,
    action: "update",
    before: permsToJson(role.permissions),
    after: permsToJson(perms),
    userId: adminId,
  });

  revalidatePath("/admin/permissions/roles");
  revalidatePath("/admin/permissions");
  revalidatePath("/admin/nguoi-dung");
}

export async function deleteRole(id: string): Promise<void> {
  await requireReleasedModuleRequest("admin.permissions");
  await assertPermissionsAdmin();

  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!role) throw new Error(`Vai trò "${id}" không tồn tại`);

  const userCount = await prisma.user.count({ where: { role: id } });
  if (userCount > 0) {
    throw new Error(
      `Còn ${userCount} người dùng đang dùng vai trò này — gán lại vai trò khác trước khi xóa`,
    );
  }

  // RolePermission rows cascade-delete via the FK onDelete: Cascade.
  await prisma.role.delete({ where: { id } });

  revalidatePath("/admin/permissions/roles");
  revalidatePath("/admin/permissions");
  revalidatePath("/admin/nguoi-dung");
}
