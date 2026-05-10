import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { listEstimates } from "@/lib/du-an/estimate-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { serializeDecimals } from "@/lib/serialize";
import { DuToanClient } from "./du-toan-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DuToanPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;

  const [estimates, project] = await Promise.all([
    listEstimates(projectId),
    getProjectById(projectId),
  ]);

  return (
    <Suspense>
      <DuToanClient
        projectId={projectId}
        initialData={serializeDecimals(estimates)}
        categories={project?.categories ?? []}
        role={role}
      />
    </Suspense>
  );
}
