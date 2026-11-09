import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { isModuleReleased } from "@/lib/acl/module-availability";
import { listSupplierProjects } from "@/lib/vat-tu-ncc/project-overview-service";
import { SupplierPairNav, SupplierTabsFallback, type SupplierTab } from "@/components/vat-tu-ncc/pair-project-picker";

const TABS: SupplierTab[] = [
  { href: "/ngay", label: "Vật tư ngày" },
  { href: "/thang", label: "Vật tư tháng" },
  { href: "/bao-gia", label: "Báo giá" },
  { href: "/chot-ky", label: "Chốt kỳ" },
  { href: "/doi-chieu", label: "Đối chiếu công nợ" },
];

// Tab ghi chuyển khoản / thuế hoá đơn qua sổ cái cong-no-vt: chỉ hiện khi module đó đã phát hành
// và người dùng có quyền đọc cong-no-vt (cùng điều kiện mà requireReleasedModuleRequest áp cho server action).
const PAYMENT_TAB: SupplierTab = { href: "/thanh-toan", label: "Thanh toán" };

const ADMIN_TABS: SupplierTab[] = [{ href: "/kiem-tra-khop", label: "Kiểm tra khớp" }];

interface Props {
  params: Promise<{ supplierId: string }>;
  children: React.ReactNode;
}

export default async function SupplierLayout({ params, children }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supplier = await prisma.supplier.findUnique({ where: { id, deletedAt: null } });
  if (!supplier) notFound();

  const { userId, role } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  const [isAdmin, canReadCongNoVt, congNoVtReleased, supplierProjects, allProjects] = await Promise.all([
    requireActiveAdmin().then(() => true).catch(() => false),
    canAccessEntitlement(userId, "cong-no-vt", { minLevel: "read", scope: "module" }),
    role === "admin" ? Promise.resolve(true) : isModuleReleased("cong-no-vt"),
    listSupplierProjects(id),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);
  const showPaymentTab = canReadCongNoVt && congNoVtReleased;
  // Chèn "Thanh toán" ngay sau "Báo giá"
  const baseTabs = showPaymentTab
    ? [...TABS.slice(0, 3), PAYMENT_TAB, ...TABS.slice(3)]
    : TABS;
  const tabs = isAdmin ? [...baseTabs, ...ADMIN_TABS] : baseTabs;

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

      {/* Tab giữ `?projectId=` (đọc bằng useSearchParams phía client) để đi qua các sheet của cùng một cặp. */}
      <Suspense fallback={<SupplierTabsFallback supplierId={id} tabs={tabs} />}>
        <SupplierPairNav
          supplierId={id}
          supplierName={supplier.name}
          tabs={tabs}
          supplierProjects={supplierProjects}
          allProjects={allProjects}
        />
      </Suspense>

      <div>{children}</div>
    </div>
  );
}
