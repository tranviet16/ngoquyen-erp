import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listAcceptances } from "@/lib/du-an/acceptance-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { NghiemThuClient } from "./nghiem-thu-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NghiemThuPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const [acceptances, project] = await Promise.all([
    listAcceptances(projectId),
    getProjectById(projectId),
  ]);

  return (
    <Suspense>
      <NghiemThuClient projectId={projectId} initialData={acceptances} categories={project?.categories ?? []} />
    </Suspense>
  );
}
