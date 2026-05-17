import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccess } from "@/lib/acl";
import type { ModuleKey } from "@/lib/acl";
import { AppSidebarClient, type NavGroupData, type NavItemData } from "./app-sidebar-client";

type NavItemSpec = NavItemData & { moduleKey: ModuleKey };
type NavGroupSpec = { label: string; items: NavItemSpec[] };

const NAV_GROUPS: NavGroupSpec[] = [
  {
    label: "Tổng quan",
    items: [
      { label: "Bảng điều khiển", href: "/dashboard", icon: "LayoutDashboard", moduleKey: "dashboard" },
      { label: "Dữ liệu nền tảng", href: "/master-data", icon: "Database", moduleKey: "master-data" },
    ],
  },
  {
    label: "Dự án & Sản xuất",
    items: [
      { label: "Dự án xây dựng", href: "/du-an", icon: "Building2", moduleKey: "du-an" },
      { label: "Vật tư – Nhà cung cấp", href: "/vat-tu-ncc", icon: "Package", moduleKey: "vat-tu-ncc" },
      { label: "Sản lượng – Doanh thu", href: "/sl-dt", icon: "TrendingUp", moduleKey: "sl-dt" },
    ],
  },
  {
    label: "Tài chính & Công nợ",
    items: [
      { label: "Công nợ vật tư", href: "/cong-no-vt", icon: "Receipt", moduleKey: "cong-no-vt" },
      { label: "Công nợ nhân công", href: "/cong-no-nc", icon: "HardHat", moduleKey: "cong-no-nc" },
      { label: "Tài chính NQ", href: "/tai-chinh", icon: "Wallet", moduleKey: "tai-chinh" },
      { label: "KH thanh toán", href: "/thanh-toan/ke-hoach", icon: "CircleDollarSign", moduleKey: "thanh-toan.ke-hoach" },
      { label: "Tổng hợp TT tháng", href: "/thanh-toan/tong-hop", icon: "FileSpreadsheet", moduleKey: "thanh-toan.tong-hop" },
    ],
  },
  {
    label: "Vận hành",
    items: [
      { label: "Bảng công việc", href: "/van-hanh/cong-viec", icon: "KanbanSquare", moduleKey: "van-hanh.cong-viec" },
      { label: "Phiếu phối hợp", href: "/van-hanh/phieu-phoi-hop", icon: "ClipboardList", moduleKey: "van-hanh.phieu-phoi-hop" },
      { label: "Hiệu suất", href: "/van-hanh/hieu-suat", icon: "TrendingUp", moduleKey: "van-hanh.hieu-suat" },
      { label: "Thông báo", href: "/thong-bao", icon: "Bell", moduleKey: "thong-bao" },
    ],
  },
  {
    label: "Quản trị",
    items: [
      { label: "Nhập dữ liệu", href: "/admin/import", icon: "Upload", moduleKey: "admin.import" },
      { label: "Phòng ban", href: "/admin/phong-ban", icon: "Users", moduleKey: "admin.phong-ban" },
      { label: "Người dùng", href: "/admin/nguoi-dung", icon: "Users", moduleKey: "admin.nguoi-dung" },
      { label: "Phân quyền", href: "/admin/permissions", icon: "Shield", moduleKey: "admin.permissions" },
    ],
  },
];

export async function AppSidebar() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const userId = session?.user?.id;
  if (!userId) return null;

  // Flatten all items, resolve access in parallel, then re-group
  const allItems = NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ group: g, item })));
  const accessResults = await Promise.all(
    allItems.map(({ item }) =>
      canAccess(userId, item.moduleKey, { minLevel: "read", scope: "module" }),
    ),
  );

  // Re-group by original group order, preserving only visible items
  const groupMap = new Map<string, NavItemData[]>();
  for (const group of NAV_GROUPS) {
    groupMap.set(group.label, []);
  }
  for (let i = 0; i < allItems.length; i++) {
    if (accessResults[i]) {
      const { group, item } = allItems[i];
      groupMap.get(group.label)!.push({ label: item.label, href: item.href, icon: item.icon });
    }
  }

  const filteredGroups: NavGroupData[] = NAV_GROUPS
    .map((g) => ({ label: g.label, items: groupMap.get(g.label)! }))
    .filter((g) => g.items.length > 0);

  return <AppSidebarClient groups={filteredGroups} />;
}
