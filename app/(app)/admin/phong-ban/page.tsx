import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRoleModuleAccess } from "@/lib/acl/role-permissions";
import { listDepartments, listAllUsersForAdmin } from "@/lib/department-service";
import { DepartmentClient } from "./department-client";

export const dynamic = "force-dynamic";

export default async function PhongBanPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user || !(await hasRoleModuleAccess(session.user.role, "admin.phong-ban", "admin"))) {
    redirect("/dashboard");
  }

  const [departments, users] = await Promise.all([
    listDepartments(),
    listAllUsersForAdmin(),
  ]);

  return (
    <DepartmentClient
      departments={departments.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        isActive: d.isActive,
        memberCount: d._count.members,
      }))}
      users={users}
    />
  );
}
