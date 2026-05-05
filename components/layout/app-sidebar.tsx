"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  Building2,
  Package,
  Receipt,
  HardHat,
  TrendingUp,
  Wallet,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const NAV_ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Du lieu nen tang", href: "/master-data", icon: Database },
  { label: "Du an Xay dung", href: "/du-an", icon: Building2 },
  { label: "Vat tu Nha cung cap", href: "/vat-tu-ncc", icon: Package },
  { label: "Cong no Vat tu", href: "/cong-no-vt", icon: Receipt },
  { label: "Cong no Nhan cong", href: "/cong-no-nc", icon: HardHat },
  { label: "San luong - Doanh thu", href: "/sl-dt", icon: TrendingUp },
  { label: "Tai chinh NQ", href: "/tai-chinh", icon: Wallet },
  { label: "Nhap du lieu (Admin)", href: "/admin/import", icon: Upload },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" className="font-bold text-lg text-primary">
          ERP Ngo Quyen
        </Link>
        <p className="text-xs text-muted-foreground">He thong quan ly noi bo</p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Phan he</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href} className="flex items-center gap-2" />
                      }
                      isActive={pathname.startsWith(item.href)}
                      tooltip={item.label}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">v1.0.0</p>
      </SidebarFooter>
    </Sidebar>
  );
}
