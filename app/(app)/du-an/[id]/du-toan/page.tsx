import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listEstimates } from "@/lib/du-an/estimate-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { DuToanClient } from "./du-toan-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DuToanPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const [estimates, project] = await Promise.all([
    listEstimates(projectId),
    getProjectById(projectId),
  ]);

  return (
    <Suspense>
      <DuToanClient projectId={projectId} initialData={estimates} categories={project?.categories ?? []} />
    </Suspense>
  );
}
