import { prisma } from "@/lib/prisma";
import { MODULE_KEYS } from "@/lib/acl/modules";
import type { ModuleKey, AccessLevel } from "@/lib/acl/modules";
import { MODULE_LABELS } from "@/lib/acl/module-labels";
import { ModulePermissionGrid } from "./module-permission-grid";

export const dynamic = "force-dynamic";

export default async function ModulePermissionsPage() {
  const [users, permRows] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        department: { select: { name: true } },
      },
    }),
    prisma.modulePermission.findMany({
      select: { userId: true, moduleKey: true, level: true },
    }),
  ]);

  // Build Map<userId, Map<ModuleKey, AccessLevel>>
  const permMap = new Map<string, Map<ModuleKey, AccessLevel>>();
  for (const row of permRows) {
    if (!MODULE_KEYS.includes(row.moduleKey as ModuleKey)) continue;
    if (!permMap.has(row.userId)) {
      permMap.set(row.userId, new Map());
    }
    permMap.get(row.userId)!.set(row.moduleKey as ModuleKey, row.level as AccessLevel);
  }

  const userRows = users.map((u) => ({
    id: u.id,
    name: u.name ?? u.id,
    role: u.role ?? "viewer",
    deptName: u.department?.name ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">
          Phân quyền theo module
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chỉnh sửa quyền truy cập module cho từng người dùng. Nhấn{" "}
          <strong>Lưu thay đổi</strong> để áp dụng tất cả thay đổi trong một
          giao dịch.
        </p>
      </div>

      <ModulePermissionGrid
        users={userRows}
        permissions={permMap}
        moduleLabels={MODULE_LABELS}
      />
    </div>
  );
}
