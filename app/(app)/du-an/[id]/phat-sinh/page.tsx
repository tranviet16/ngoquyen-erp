import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listChangeOrders } from "@/lib/du-an/change-order-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { PhatSinhClient } from "./phat-sinh-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PhatSinhPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const [changeOrders, project] = await Promise.all([
    listChangeOrders(projectId),
    getProjectById(projectId),
  ]);

  return (
    <Suspense>
      <PhatSinhClient projectId={projectId} initialData={changeOrders} categories={project?.categories ?? []} />
    </Suspense>
  );
}
