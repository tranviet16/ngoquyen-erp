import { notFound } from "next/navigation";
import {
  listProjectSupplierDebts,
  getProjectSupplierDebtSummary,
  listProjectSupplierNames,
} from "@/lib/du-an/supplier-debt-service";
import { CongNoClient } from "./cong-no-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ suppliers?: string }>;
}

export default async function CongNoPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const suppliers = sp.suppliers
    ? sp.suppliers.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const [rows, summary, supplierNames] = await Promise.all([
    listProjectSupplierDebts(projectId, suppliers),
    getProjectSupplierDebtSummary(projectId, suppliers),
    listProjectSupplierNames(projectId),
  ]);

  return (
    <CongNoClient
      rows={rows}
      summary={summary}
      supplierNames={supplierNames}
      initialSuppliers={suppliers ?? []}
    />
  );
}
