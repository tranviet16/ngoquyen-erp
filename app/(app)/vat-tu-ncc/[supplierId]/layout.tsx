import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { isModuleReleased } from "@/lib/acl/module-availability";

const TABS = [
  { href: "/ngay", label: "Vật tư ngày" },
  { href: "/thang", label: "Vật tư tháng" },
  { href: "/bao-gia", label: "Báo giá" },
  { href: "/chot-ky", label: "Chốt kỳ" },
  { href: "/doi-chieu", label: "Đối chiếu công nợ" },
];

// Tab ghi chuyển khoản / thuế hoá đơn qua sổ cái cong-no-vt: chỉ hiện khi module đó đã phát hành
// và người dùng có quyền đọc cong-no-vt (cùng điều kiện mà requireReleasedModuleRequest áp cho server action).
const PAYMENT_TAB = { href: "/thanh-toan", label: "Thanh toán" };

const ADMIN_TABS = [{ href: "/kiem-tra-khop", label: "Kiểm tra khớp" }];

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

  const { userId, role } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  const [isAdmin, canReadCongNoVt, congNoVtReleased] = await Promise.all([
    requireActiveAdmin().then(() => true).catch(() => false),
    canAccessEntitlement(userId, "cong-no-vt", { minLevel: "read", scope: "module" }),
    role === "admin" ? Promise.resolve(true) : isModuleReleased("cong-no-vt"),
  ]);
  const showPaymentTab = canReadCongNoVt && congNoVtReleased;
  // Chèn "Thanh toán" ngay sau "Báo giá"
  const baseTabs = showPaymentTab
    ? [...TABS.slice(0, 3), PAYMENT_TAB, ...TABS.slice(3)]
    : TABS;
  const tabs = isAdmin ? [...baseTabs, ...ADMIN_TABS] : baseTabs;

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
          {tabs.map((tab) => (
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
