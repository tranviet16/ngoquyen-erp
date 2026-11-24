/**
 * Khung điều hướng của một công trình: 14 tab cũ gom thành 7 nhóm, URL giữ nguyên. Hàng 1 là nhóm, hàng 2
 * là tab của nhóm đang mở. Nhóm "Đối chiếu DT-HĐ-TT" không có hàng 2 ở khung: layout con vẽ thanh mục con
 * của nó ngay bên dưới. "Cài đặt" có hàng 2 rỗng để chiều cao thanh không nhảy khi chuyển nhóm.
 * Module thuần — component chỉ việc vẽ mô hình này.
 */

export interface ProjectTab {
  /** Segment ngay sau /du-an/[id]; `null` là trang Dashboard (index). */
  segment: string | null;
  label: string;
}

export interface ProjectNavGroup {
  id: string;
  label: string;
  tabs: ProjectTab[];
  /** "subnav": hàng 2 do layout con vẽ; "none": hàng 2 rỗng; "tabs": hàng tab thường. */
  row2: "tabs" | "subnav" | "none";
}

export const PROJECT_NAV_GROUPS: readonly ProjectNavGroup[] = [
  { id: "tong-quan", label: "Tổng quan", row2: "tabs", tabs: [{ segment: null, label: "Dashboard" }] },
  {
    id: "tien-do", label: "Tiến độ & nghiệm thu", row2: "tabs",
    tabs: [{ segment: "tien-do", label: "Tiến Độ" }, { segment: "nghiem-thu", label: "Nghiệm Thu" }],
  },
  {
    id: "du-toan", label: "Dự toán", row2: "tabs",
    tabs: [{ segment: "du-toan", label: "Dự Toán" }, { segment: "du-toan-dieu-chinh", label: "DT Điều Chỉnh" }, { segment: "phat-sinh", label: "Phát Sinh (CO)" }],
  },
  { id: "dt-hd-tt", label: "Đối chiếu DT-HĐ-TT", row2: "subnav", tabs: [{ segment: "dt-hd-tt", label: "Đối chiếu DT-HĐ-TT" }] },
  {
    id: "vat-tu", label: "Vật tư & công nợ", row2: "tabs",
    tabs: [
      { segment: "giao-dich", label: "Giao Dịch" },
      { segment: "can-doi-vat-tu", label: "Cân Đối VT" },
      { segment: "dinh-muc", label: "Định Mức" },
      { segment: "cong-no", label: "Công Nợ NCC" },
    ],
  },
  {
    id: "hop-dong", label: "Hợp đồng & dòng tiền", row2: "tabs",
    tabs: [{ segment: "hop-dong", label: "Hợp Đồng" }, { segment: "dong-tien-3-ben", label: "Dòng Tiền 3 Bên" }],
  },
  { id: "cai-dat", label: "Cài đặt", row2: "none", tabs: [{ segment: "cai-dat", label: "Cài Đặt" }] },
];

/** Nhóm chứa các tab có ghi chú "hóa đơn lấy từ sổ" trên công trình dùng sổ đội. */
export const BOOK_NOTE_GROUP_ID = "vat-tu";

export const tabHref = (basePath: string, tab: ProjectTab) => (tab.segment === null ? basePath : `${basePath}/${tab.segment}`);

/** Link của nhóm = tab đầu tiên của nhóm. */
export const groupHref = (basePath: string, group: ProjectNavGroup) => tabHref(basePath, group.tabs[0]);

export interface ResolvedProjectNav {
  group: ProjectNavGroup | null;
  tab: ProjectTab | null;
}

/** Nhóm và tab đang mở theo segment của layout dự án (`useSelectedLayoutSegment()`). */
export function resolveProjectNav(segment: string | null): ResolvedProjectNav {
  for (const group of PROJECT_NAV_GROUPS) {
    const tab = group.tabs.find((t) => t.segment === segment);
    if (tab) return { group, tab };
  }
  return { group: null, tab: null };
}
