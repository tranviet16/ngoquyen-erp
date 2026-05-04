import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listReconciliations } from "@/lib/vat-tu-ncc/reconciliation-service";
import { DoiChieuClient } from "./doi-chieu-client";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function DoiChieuPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();

  const reconciliations = await listReconciliations(id);

  return (
    <Suspense>
      <DoiChieuClient supplierId={id} initialData={reconciliations} />
    </Suspense>
  );
}
