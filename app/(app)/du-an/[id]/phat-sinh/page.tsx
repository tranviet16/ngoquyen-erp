import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { listChangeOrders } from "@/lib/du-an/change-order-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { serializeDecimals } from "@/lib/serialize";
import { PhatSinhClient } from "./phat-sinh-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PhatSinhPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;

  const [changeOrders, project] = await Promise.all([
    listChangeOrders(projectId),
    getProjectById(projectId),
  ]);

  return (
    <Suspense>
      <PhatSinhClient projectId={projectId} initialData={serializeDecimals(changeOrders)} categories={project?.categories ?? []} role={role} />
    </Suspense>
  );
}
