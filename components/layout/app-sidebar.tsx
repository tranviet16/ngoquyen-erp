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

type NavItem = { label: string; href: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [
      { label: "Bảng điều khiển", href: "/dashboard", icon: LayoutDashboard },
      { label: "Dữ liệu nền tảng", href: "/master-data", icon: Database },
    ],
  },
  {
    label: "Dự án & Sản xuất",
    items: [
      { label: "Dự án xây dựng", href: "/du-an", icon: Building2 },
      { label: "Vật tư – Nhà cung cấp", href: "/vat-tu-ncc", icon: Package },
      { label: "Sản lượng – Doanh thu", href: "/sl-dt", icon: TrendingUp },
    ],
  },
  {
    label: "Tài chính & Công nợ",
    items: [
      { label: "Công nợ vật tư", href: "/cong-no-vt", icon: Receipt },
      { label: "Công nợ nhân công", href: "/cong-no-nc", icon: HardHat },
      { label: "Tài chính NQ", href: "/tai-chinh", icon: Wallet },
    ],
  },
  {
    label: "Cộng tác",
    items: [
      { label: "Phiếu phối hợp", href: "/phieu-phoi-hop", icon: ClipboardList },
      { label: "Bảng công việc", href: "/cong-viec", icon: KanbanSquare },
      { label: "Thông báo", href: "/thong-bao", icon: Bell },
    ],
  },
  {
    label: "Quản trị",
    items: [
      { label: "Nhập dữ liệu", href: "/admin/import", icon: Upload },
      { label: "Phòng ban", href: "/admin/phong-ban", icon: Users },
    ],
  },
];

export function AppSidebar() {
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
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
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
