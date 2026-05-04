"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

const NAV_ITEMS = [
  {
    label: "Du lieu nen tang",
    href: "/master-data",
    icon: "DB",
  },
  {
    label: "Du an Xay dung",
    href: "/du-an",
    icon: "DA",
  },
  {
    label: "Vat tu Nha cung cap",
    href: "/vat-tu-ncc",
    icon: "VT",
  },
  {
    label: "Cong no Vat tu",
    href: "/cong-no-vt",
    icon: "CV",
  },
  {
    label: "Cong no Nhan cong",
    href: "/cong-no-nc",
    icon: "CN",
  },
  {
    label: "San luong - Doanh thu",
    href: "/sl-dt",
    icon: "SL",
  },
  {
    label: "Tai chinh NQ",
    href: "/tai-chinh",
    icon: "TC",
  },
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
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={
                      <Link href={item.href} className="flex items-center gap-2" />
                    }
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.label}
                  >
                    <span className="text-xs font-mono bg-muted rounded px-1">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
