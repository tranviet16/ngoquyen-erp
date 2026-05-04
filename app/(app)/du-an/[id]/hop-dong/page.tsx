import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listContracts } from "@/lib/du-an/contract-service";
import { HopDongClient } from "./hop-dong-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HopDongPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const contracts = await listContracts(projectId);

  return (
    <Suspense>
      <HopDongClient projectId={projectId} initialData={contracts} />
    </Suspense>
  );
}
