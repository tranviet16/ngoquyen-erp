import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { listDepartments, listAllUsersForAdmin } from "@/lib/department-service";
import { DepartmentClient } from "./department-client";

export const dynamic = "force-dynamic";

export default async function PhongBanPage() {
  await requireActiveAdmin();

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
