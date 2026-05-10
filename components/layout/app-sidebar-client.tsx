"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Building2,
  Package,
  Receipt,
  HardHat,
  TrendingUp,
  Wallet,
  Upload,
  Users,
  ClipboardList,
  KanbanSquare,
  Bell,
  Shield,
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

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Database,
  Building2,
  Package,
  Receipt,
  HardHat,
  TrendingUp,
  Wallet,
  Upload,
  Users,
  ClipboardList,
  KanbanSquare,
  Bell,
  Shield,
};

export type NavItemData = {
  label: string;
  href: string;
  icon: string;
};

export type NavGroupData = {
  label: string;
  items: NavItemData[];
};

interface Props {
  groups: NavGroupData[];
}

export function AppSidebarClient({ groups }: Props) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" className="flex flex-col gap-0.5">
          <span className="font-bold text-base text-primary tracking-tight">ERP Ngô Quyền</span>
          <span className="text-[11px] text-muted-foreground leading-tight">Hệ thống quản lý nội bộ</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={
                          <Link href={item.href} className="flex items-center gap-2.5" />
                        }
                        isActive={isActive}
                        tooltip={item.label}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t px-4 py-2.5">
        <p className="text-[11px] text-muted-foreground">Phiên bản 1.0.0</p>
      </SidebarFooter>
    </Sidebar>
  );
}
