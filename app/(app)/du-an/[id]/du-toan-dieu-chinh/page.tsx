import { notFound } from "next/navigation";
import { listEstimateAdjusted } from "@/lib/du-an/norm-service";
import { DuToanDieuChinhClient } from "./du-toan-dieu-chinh-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DuToanDieuChinhPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const rows = await listEstimateAdjusted(projectId);

  return <DuToanDieuChinhClient rows={rows} />;
}
