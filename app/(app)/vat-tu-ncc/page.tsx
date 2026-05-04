import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function listSuppliersWithCount() {
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  const counts = await prisma.supplierDeliveryDaily.groupBy({
    by: ["supplierId"],
    where: { deletedAt: null },
    _count: { id: true },
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.supplierId, c._count.id]));
  return suppliers.map((s) => ({ ...s, deliveryCount: countMap[s.id] ?? 0 }));
}

export default async function VatTuNccPage() {
  const suppliers = await listSuppliersWithCount();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Vật tư theo Nhà cung cấp</h1>
        <p className="text-sm text-muted-foreground">
          Chọn NCC để xem chi tiết phiếu nhập vật tư và đối chiếu công nợ.
        </p>
      </div>

      {suppliers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Chưa có NCC nào.{" "}
          <Link href="/master-data/suppliers" className="underline text-primary">
            Thêm NCC trong Master Data
          </Link>
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <Link
              key={s.id}
              href={`/vat-tu-ncc/${s.id}/ngay`}
              className="block rounded-lg border p-4 hover:border-primary hover:shadow-sm transition-all"
            >
              <p className="font-semibold">{s.name}</p>
              {s.taxCode && <p className="text-xs text-muted-foreground">MST: {s.taxCode}</p>}
              {s.phone && <p className="text-xs text-muted-foreground">SĐT: {s.phone}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                {s.deliveryCount} phiếu nhập
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
