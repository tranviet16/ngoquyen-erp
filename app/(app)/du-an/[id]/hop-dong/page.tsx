import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listContracts } from "@/lib/du-an/contract-service";
import { getSettings } from "@/lib/du-an/settings-service";
import { serializeDecimals } from "@/lib/serialize";
import { HopDongClient } from "./hop-dong-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HopDongPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const [contracts, settings] = await Promise.all([
    listContracts(projectId),
    getSettings(projectId),
  ]);

  const warningDays = settings?.contractWarningDays ?? 90;

  return (
    <Suspense>
      <HopDongClient projectId={projectId} initialData={serializeDecimals(contracts)} warningDays={warningDays} />
    </Suspense>
  );
}
