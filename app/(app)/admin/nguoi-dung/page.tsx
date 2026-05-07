import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/rbac";
import { listUsersWithGrants } from "@/lib/admin/user-grants-service";
import { listDepartments } from "@/lib/department-service";
import { UserGrantsClient } from "./user-grants-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !hasRole(session.user.role, "admin")) {
    redirect("/dashboard");
  }
  const [users, depts] = await Promise.all([
    listUsersWithGrants(),
    listDepartments({ activeOnly: true }),
  ]);
  return (
    <UserGrantsClient
      users={users}
      departments={depts.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
    />
  );
}
