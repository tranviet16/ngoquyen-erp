import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { prisma } from "@/lib/prisma";
import { listUsersWithGrants } from "@/lib/admin/user-grants-service";
import { listDepartments } from "@/lib/department-service";
import { UserGrantsClient } from "./user-grants-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireActiveAdmin();
  const [users, depts, roles] = await Promise.all([
    listUsersWithGrants(),
    listDepartments({ activeOnly: true }),
    prisma.role.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
  ]);
  return (
    <UserGrantsClient
      users={users}
      departments={depts.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
      roles={roles}
    />
  );
}
