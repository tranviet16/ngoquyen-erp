import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { listTransactions } from "@/lib/du-an/transaction-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { serializeDecimals } from "@/lib/serialize";
import { GiaoDichClient } from "./giao-dich-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GiaoDichPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;

  const [transactions, project] = await Promise.all([
    listTransactions(projectId),
    getProjectById(projectId),
  ]);

  return (
    <Suspense>
      <GiaoDichClient projectId={projectId} initialData={serializeDecimals(transactions)} categories={project?.categories ?? []} role={role} />
    </Suspense>
  );
}
