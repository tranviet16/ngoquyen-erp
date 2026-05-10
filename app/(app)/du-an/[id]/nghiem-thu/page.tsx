import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { listAcceptances } from "@/lib/du-an/acceptance-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { serializeDecimals } from "@/lib/serialize";
import { NghiemThuClient } from "./nghiem-thu-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NghiemThuPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;

  const [acceptances, project] = await Promise.all([
    listAcceptances(projectId),
    getProjectById(projectId),
  ]);

  return (
    <Suspense>
      <NghiemThuClient projectId={projectId} initialData={serializeDecimals(acceptances)} categories={project?.categories ?? []} role={role} />
    </Suspense>
  );
}
