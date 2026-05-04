import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listSchedules } from "@/lib/du-an/schedule-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { TienDoClient } from "./tien-do-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TienDoPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const [schedules, project] = await Promise.all([
    listSchedules(projectId),
    getProjectById(projectId),
  ]);

  const categories = project?.categories ?? [];

  return (
    <Suspense>
      <TienDoClient projectId={projectId} initialData={schedules} categories={categories} />
    </Suspense>
  );
}
