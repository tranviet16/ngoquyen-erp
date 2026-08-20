import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listForms, type CoordinationSortKey } from "@/lib/coordination-form/coordination-form-service";
import type { SortDir } from "@/lib/table/types";
import { listDepartments } from "@/lib/department-service";
import type { FormStatus } from "@/lib/coordination-form/state-machine";
import { ListClient } from "./list-client";

export const dynamic = "force-dynamic";

const VALID_STATUS: FormStatus[] = [
  "draft",
  "pending_leader",
  "approved",
  "rejected",
  "revising",
  "cancelled",
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; scope?: string; page?: string; sort?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const status = VALID_STATUS.includes(sp.status as FormStatus)
    ? (sp.status as FormStatus)
    : undefined;
  const scope = sp.scope === "mine" ? "mine" : "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [sortCol, sortDir] = sp.sort?.split(":") ?? [];
  const allowedSorts = new Set<CoordinationSortKey>(["code", "creatorDept", "executorDept", "content", "priority", "status", "sla", "createdAt"]);
  const sort = allowedSorts.has(sortCol as CoordinationSortKey) && (sortDir === "asc" || sortDir === "desc")
    ? { col: sortCol as CoordinationSortKey, dir: sortDir as SortDir }
    : undefined;

  const [data, depts] = await Promise.all([
    listForms({ status, mine: scope === "mine", page, sort }),
    listDepartments({ activeOnly: false }),
  ]);

  return (
    <ListClient
      data={data}
      departments={depts}
      filter={{ status, scope, page, sortCol: sort?.col, sortDir: sort?.dir }}
    />
  );
}
