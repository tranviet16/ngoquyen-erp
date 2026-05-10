import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { listCashflows, getCashflowSummary } from "@/lib/du-an/cashflow-service";
import { serializeDecimals } from "@/lib/serialize";
import { DongTien3BenClient } from "./dong-tien-3-ben-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DongTien3BenPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;

  const [cashflows, summary] = await Promise.all([
    listCashflows(projectId),
    getCashflowSummary(projectId),
  ]);

  return (
    <Suspense>
      <DongTien3BenClient projectId={projectId} initialData={serializeDecimals(cashflows)} summary={serializeDecimals(summary)} role={role} />
    </Suspense>
  );
}
