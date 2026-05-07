import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listForms } from "@/lib/coordination-form/coordination-form-service";
import { listDepartments } from "@/lib/department-service";
import type { FormStatus } from "@/lib/coordination-form/state-machine";
import { ListClient } from "./list-client";

export const dynamic = "force-dynamic";

const VALID_STATUS: FormStatus[] = [
  "draft",
  "pending_leader",
  "pending_director",
  "approved",
  "rejected",
  "revising",
  "cancelled",
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; scope?: string; page?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const status = VALID_STATUS.includes(sp.status as FormStatus)
    ? (sp.status as FormStatus)
    : undefined;
  const scope = sp.scope === "mine" ? "mine" : "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const [data, depts] = await Promise.all([
    listForms({ status, mine: scope === "mine", page }),
    listDepartments({ activeOnly: false }),
  ]);

  return (
    <ListClient
      data={data}
      departments={depts}
      filter={{ status, scope, page }}
    />
  );
}
