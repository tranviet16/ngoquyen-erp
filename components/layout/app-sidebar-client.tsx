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
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import type { ModuleAvailabilityStatus } from "@/lib/acl";
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
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
};

export type NavItemData = {
  label: string;
  href: string;
  icon: string;
  status?: ModuleAvailabilityStatus;
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground shadow-sm">
            NQ
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-bold tracking-normal text-sidebar-foreground">Ngô Quyền ERP</span>
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/58 leading-tight">
              Hệ thống quản lý công việc nội bộ
            </span>
          </span>
        </Link>
        <div className="mt-3 rounded-md border border-sidebar-border bg-sidebar-accent/45 px-3 py-2 text-[11px] text-sidebar-foreground/72 group-data-[collapsible=icon]:hidden">
          Điều hành dự án, vật tư, công nợ trong một luồng.
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 py-3">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-0 py-2">
            <SidebarGroupLabel className="h-7 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/46">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
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
                        className="h-9 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/76 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:font-bold hover:bg-sidebar-accent/78 hover:text-sidebar-foreground"
                      >
                        <Icon className="size-4 shrink-0 text-sidebar-foreground/58 group-data-[active=true]/menu-button:text-sidebar-primary" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                        {item.status === "development" ? (
                          <span className="ml-auto rounded-full border border-sidebar-border bg-sidebar-accent/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sidebar-foreground/72 group-data-[collapsible=icon]:hidden">
                            Dev
                          </span>
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/35 px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-primary/15 text-xs font-bold text-sidebar-primary">
            ERP
          </span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-bold text-sidebar-foreground">ERP Ngô Quyền</p>
            <p className="truncate text-[11px] text-sidebar-foreground/58">Bản vận hành 1.0</p>
          </div>
          <LogOut className="hidden size-3.5 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
