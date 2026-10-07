import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { previewPeriodClose } from "@/lib/vat-tu-ncc/period-close-service";
import { ChotKyClient } from "./chot-ky-client";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function ChotKyPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  const canEdit = await canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" });
  // Kỳ gợi ý (liền kề marker gần nhất / sau mốc số dư ban đầu) điền sẵn khi mở trang.
  const initialPreview = await previewPeriodClose(id);

  return (
    <Suspense>
      <ChotKyClient supplierId={id} canEdit={canEdit} initialPreview={initialPreview} />
    </Suspense>
  );
}
