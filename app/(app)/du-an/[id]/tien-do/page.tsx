import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { listSchedules } from "@/lib/du-an/schedule-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { serializeDecimals } from "@/lib/serialize";
import { TienDoClient } from "./tien-do-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TienDoPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;

  const [schedules, project] = await Promise.all([
    listSchedules(projectId),
    getProjectById(projectId),
  ]);

  const categories = project?.categories ?? [];

  return (
    <Suspense>
      <TienDoClient projectId={projectId} initialData={serializeDecimals(schedules)} categories={categories} role={role} />
    </Suspense>
  );
}
