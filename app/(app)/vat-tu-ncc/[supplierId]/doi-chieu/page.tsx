import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listReconciliations } from "@/lib/vat-tu-ncc/reconciliation-service";
import { serializeDecimals } from "@/lib/serialize";
import { DoiChieuClient } from "./doi-chieu-client";
import { ExcelExportButton, PrintButton } from "@/components/export-buttons";

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Đối chiếu công nợ - NCC #{id}</h1>
        <div className="flex gap-2">
          <ExcelExportButton
            template="doi-chieu"
            params={{ ledgerType: "material", partyId: id }}
            label="Xuất Excel đối chiếu"
            filename={`doi-chieu-ncc-${id}.xlsx`}
          />
          <PrintButton label="In đối chiếu" />
        </div>
      </div>
      <Suspense>
        <DoiChieuClient supplierId={id} initialData={serializeDecimals(reconciliations)} />
      </Suspense>
      {/* Signature section for print */}
      <div className="print-signatures hidden">
        <div>Đại diện Công ty<br /><br /><br />Ký, ghi rõ họ tên</div>
        <div>Đại diện Nhà cung cấp<br /><br /><br />Ký, ghi rõ họ tên</div>
      </div>
    </div>
  );
}
