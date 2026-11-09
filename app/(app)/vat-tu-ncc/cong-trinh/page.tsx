import Link from "next/link";
import { requireModuleAccess } from "@/lib/acl/guards";
import { listProjectsWithMaterial } from "@/lib/vat-tu-ncc/project-overview-service";
import { MaterialProjectTable } from "@/components/vat-tu-ncc/material-project-table";

export const dynamic = "force-dynamic";

/** Cửa vào theo công trình: công trình có phiếu / sổ vật tư → các NCC của công trình. */
export default async function VatTuCongTrinhPage() {
  await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  const projects = await listProjectsWithMaterial();

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/vat-tu-ncc" className="hover:underline">Vật tư NCC</Link>
          <span>/</span>
          <span>Theo công trình</span>
        </div>
        <h1 className="text-xl font-bold">Vật tư theo công trình</h1>
        <p className="text-sm text-muted-foreground">
          Chọn công trình để xem các NCC, nhập phiếu, chốt kỳ, đối chiếu và thanh toán theo từng NCC × công trình.
        </p>
      </div>
      <MaterialProjectTable rows={projects} />
    </div>
  );
}
