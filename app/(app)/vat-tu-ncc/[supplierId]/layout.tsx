import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

const TABS = [
  { href: "/ngay", label: "Vật tư ngày" },
  { href: "/thang", label: "Vật tư tháng" },
  { href: "/doi-chieu", label: "Đối chiếu công nợ" },
];

interface Props {
  params: Promise<{ supplierId: string }>;
  children: React.ReactNode;
}

export default async function SupplierLayout({ params, children }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();

  const supplier = await prisma.supplier.findUnique({ where: { id, deletedAt: null } });
  if (!supplier) notFound();

  const basePath = `/vat-tu-ncc/${id}`;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/vat-tu-ncc" className="hover:underline">Vật tư NCC</Link>
          <span>/</span>
          <span>{supplier.name}</span>
        </div>
        <h1 className="text-xl font-bold">{supplier.name}</h1>
        {supplier.taxCode && (
          <p className="text-sm text-muted-foreground">MST: {supplier.taxCode}</p>
        )}
      </div>

      <div className="border-b overflow-x-auto">
        <nav className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={`${basePath}${tab.href}`}
              className="px-4 py-2 text-sm font-medium border-b-2 border-transparent hover:border-primary hover:text-primary transition-colors whitespace-nowrap text-muted-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
