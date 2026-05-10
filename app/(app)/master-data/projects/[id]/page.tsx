import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getProjectById } from "@/lib/master-data/project-service";
import { ProjectDetailClient } from "./project-detail-client";
import { serializeDecimals } from "@/lib/serialize";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);

  if (isNaN(projectId)) notFound();

  const project = await getProjectById(projectId);
  if (!project) notFound();

  return (
    <Suspense>
      <ProjectDetailClient project={serializeDecimals(project)} />
    </Suspense>
  );
}
