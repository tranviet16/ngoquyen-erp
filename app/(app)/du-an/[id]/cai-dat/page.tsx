import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSettings } from "@/lib/du-an/settings-service";
import { CaiDatClient } from "./cai-dat-client";
import { serializeDecimals } from "@/lib/serialize";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CaiDatPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const settings = await getSettings(projectId);

  return (
    <Suspense>
      <CaiDatClient projectId={projectId} initialSettings={serializeDecimals(settings)} />
    </Suspense>
  );
}
