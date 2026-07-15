import { listRoles, getRoleWithPermissions } from "@/lib/admin/role-service";
import { RolesClient, type RoleListItem } from "./roles-client";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const summaries = await listRoles();
  const full = await Promise.all(
    summaries.map((s) => getRoleWithPermissions(s.id)),
  );
  const roles: RoleListItem[] = summaries.map((s, i) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    moduleCount: s.moduleCount,
    userCount: s.userCount,
    permissions: full[i]?.permissions ?? [],
  }));

  return <RolesClient roles={roles} />;
}
