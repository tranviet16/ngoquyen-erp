import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listCashflows, getCashflowSummary } from "@/lib/du-an/cashflow-service";
import { DongTien3BenClient } from "./dong-tien-3-ben-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DongTien3BenPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const [cashflows, summary] = await Promise.all([
    listCashflows(projectId),
    getCashflowSummary(projectId),
  ]);

  return (
    <Suspense>
      <DongTien3BenClient projectId={projectId} initialData={cashflows} summary={summary} />
    </Suspense>
  );
}
