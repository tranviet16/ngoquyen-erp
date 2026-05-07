import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listDepartments } from "@/lib/department-service";
import { getUserContext } from "@/lib/department-rbac";
import { CreateFormClient } from "./create-form-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const ctx = await getUserContext(session.user.id);
  const departments = await listDepartments({ activeOnly: true });

  return (
    <CreateFormClient
      departments={departments.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
      currentDeptId={ctx?.departmentId ?? null}
    />
  );
}
