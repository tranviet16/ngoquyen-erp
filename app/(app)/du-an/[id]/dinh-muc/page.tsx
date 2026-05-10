import { notFound } from "next/navigation";
import { listNorm } from "@/lib/du-an/norm-service";
import { getSettings } from "@/lib/du-an/settings-service";
import { DinhMucClient } from "./dinh-muc-client";
import { serializeDecimals } from "@/lib/serialize";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DinhMucPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const settings = await getSettings(projectId);

  const rows = await listNorm(projectId, {
    normYellowThreshold: Number(settings?.normYellowThreshold ?? 0.8),
    normRedThreshold: Number(settings?.normRedThreshold ?? 0.95),
  });

  return <DinhMucClient rows={serializeDecimals(rows)} />;
}
