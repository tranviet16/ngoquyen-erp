import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listTransactions } from "@/lib/du-an/transaction-service";
import { getProjectById } from "@/lib/master-data/project-service";
import { GiaoDichClient } from "./giao-dich-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GiaoDichPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const [transactions, project] = await Promise.all([
    listTransactions(projectId),
    getProjectById(projectId),
  ]);

  return (
    <Suspense>
      <GiaoDichClient projectId={projectId} initialData={transactions} categories={project?.categories ?? []} />
    </Suspense>
  );
}
