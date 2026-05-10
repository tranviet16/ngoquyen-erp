import { prisma } from "@/lib/prisma";
import type { AccessLevel } from "@/lib/acl/modules";
import { ProjectPermissionPanel } from "./project-permission-panel";

export const dynamic = "force-dynamic";

export default async function ProjectPermissionsPage() {
  const [users, projects, perms, grantAlls] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        department: { select: { name: true } },
        projectGrantAll: { select: { userId: true } },
      },
    }),
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.projectPermission.findMany({
      select: { userId: true, projectId: true, level: true },
    }),
    prisma.projectGrantAll.findMany({
      select: { userId: true, level: true },
    }),
  ]);

  const userRows = users.map((u) => ({
    id: u.id,
    name: u.name ?? u.id,
    role: u.role ?? "viewer",
    deptName: u.department?.name ?? null,
    hasGrantAll: u.projectGrantAll !== null,
  }));

  const permRows = perms.map((p) => ({
    userId: p.userId,
    projectId: p.projectId,
    level: p.level as AccessLevel,
  }));

  const grantAllRows = grantAlls.map((g) => ({
    userId: g.userId,
    level: g.level as AccessLevel,
  }));

  const projectRows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">
          Phân quyền theo dự án
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn người dùng để xem và chỉnh sửa quyền truy cập từng dự án. Hàng{" "}
          <strong>Toàn bộ dự án</strong> cấp quyền mặc định; dòng theo từng dự
          án ghi đè giá trị đó.
        </p>
      </div>

      <ProjectPermissionPanel
        users={userRows}
        projects={projectRows}
        permissions={permRows}
        grantAlls={grantAllRows}
      />
    </div>
  );
}
