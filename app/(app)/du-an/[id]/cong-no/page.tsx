import { notFound } from "next/navigation";
import {
  listProjectSupplierDebts,
  getProjectSupplierDebtSummary,
} from "@/lib/du-an/supplier-debt-service";
import { CongNoClient } from "./cong-no-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CongNoPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const [rows, summary] = await Promise.all([
    listProjectSupplierDebts(projectId),
    getProjectSupplierDebtSummary(projectId),
  ]);

  return <CongNoClient rows={rows} summary={summary} />;
}
