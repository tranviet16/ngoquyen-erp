import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getFormById,
  resolveAvailableActions,
} from "@/lib/coordination-form/coordination-form-service";
import { getUserContext } from "@/lib/department-rbac";
import { listDepartments } from "@/lib/department-service";
import { DetailClient } from "./detail-client";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) notFound();

  let form;
  try {
    form = await getFormById(id);
  } catch (e) {
    return (
      <div className="max-w-2xl">
        <p className="text-red-600">{e instanceof Error ? e.message : String(e)}</p>
      </div>
    );
  }
  if (!form) notFound();

  const ctx = await getUserContext(session.user.id);
  const role = session.user.role ?? "viewer";
  const availableActions = ctx
    ? resolveAvailableActions(form, ctx, role)
    : [];

  const departments = (await listDepartments({ activeOnly: true })).map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
  }));

  return (
    <DetailClient
      form={form}
      availableActions={availableActions}
      departments={departments}
    />
  );
}
