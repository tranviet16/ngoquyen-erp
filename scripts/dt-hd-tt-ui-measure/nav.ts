/**
 * Lệnh đo `nav` (tiêu chí 1): ở 1366 px và 1440 px, trên Dashboard và từng tab của công trình, mỗi hàng
 * điều hướng (`data-nav-row`) không cuộn ngang và không xuống dòng; đúng một nhóm đang mở; nhiều nhất một
 * tab đang mở; Cài đặt có hàng tab rỗng; nhóm Đối chiếu DT-HĐ-TT dùng thanh mục con làm hàng 2.
 * Vì hàng dùng flex-wrap, chỉ đo bề rộng thì không bao giờ trượt — nên đo cả việc xuống dòng (offsetTop).
 */

import type { MeasureCommand } from "../dt-hd-tt-baseline/measure-types";

const VIEWPORTS = [{ width: 1366, height: 900 }, { width: 1440, height: 900 }];
const TAB_PATHS = [
  "", "/tien-do", "/nghiem-thu", "/du-toan", "/du-toan-dieu-chinh", "/phat-sinh", "/giao-dich", "/can-doi-vat-tu",
  "/dinh-muc", "/cong-no", "/hop-dong", "/dong-tien-3-ben", "/cai-dat",
];
/** Trang của nhóm Đối chiếu DT-HĐ-TT: một báo cáo nhẹ và trang mang huy hiệu. */
const SUBNAV_PATHS = ["/dt-hd-tt/hd-tt", "/dt-hd-tt/anh-xa"];
const PAGE_TIMEOUT_MS = 90_000;
const SETTLE_MS = 1_000;

interface RowState {
  row: string;
  overflow: boolean;
  wrapped: boolean;
}

interface NavState {
  rows: RowState[];
  activeGroups: number;
  activeTabs: number;
  tabLinks: number;
  hasTabsRow: boolean;
  hasSubnav: boolean;
}

export const run: MeasureCommand = async ({ session, projectId }) => {
  const failures: string[] = [];
  const notes: string[] = [];
  const page = await session.context.newPage();
  try {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      for (const path of [...TAB_PATHS, ...SUBNAV_PATHS]) {
        const where = `${vp.width}px ${path || "/ (Dashboard)"}`;
        await page.goto(`${session.baseUrl}/du-an/${projectId}${path}`, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
        await page.locator('[data-nav-row="groups"]').waitFor({ timeout: PAGE_TIMEOUT_MS });
        // Ghi chú sổ đội và huy hiệu "chưa gán" tải trong Suspense riêng: chờ chúng kịp hiện rồi mới đo.
        await page.waitForTimeout(SETTLE_MS);
        const s: NavState = await page.evaluate(() => {
          const rows = [...document.querySelectorAll<HTMLElement>("[data-nav-row]")].map((el) => {
            const visible = [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.offsetParent !== null);
            // Xuống dòng = một phần tử bắt đầu thấp hơn nửa chiều cao phần tử đầu dòng. Chữ nhỏ canh giữa cạnh
            // nút cao hơn chỉ lệch vài px, không phải xuống dòng.
            const first = visible[0];
            return {
              row: el.dataset.navRow ?? "?",
              overflow: el.scrollWidth > el.clientWidth + 1,
              wrapped: !!first && visible.some((c) => c.offsetTop >= first.offsetTop + first.offsetHeight / 2),
            };
          });
          return {
            rows,
            activeGroups: document.querySelectorAll('[data-nav-row="groups"] [aria-current="true"]').length,
            activeTabs: document.querySelectorAll('[data-nav-row="tabs"] [aria-current="page"]').length,
            tabLinks: document.querySelectorAll('[data-nav-row="tabs"] a').length,
            hasTabsRow: document.querySelector('[data-nav-row="tabs"]') !== null,
            hasSubnav: document.querySelector('[data-nav-row="dt-hd-tt"]') !== null,
          };
        });
        for (const r of s.rows) {
          if (r.overflow) failures.push(`${where}: hàng "${r.row}" cuộn ngang`);
          if (r.wrapped) failures.push(`${where}: hàng "${r.row}" xuống dòng`);
        }
        if (s.activeGroups !== 1) failures.push(`${where}: ${s.activeGroups} nhóm đang mở (cần đúng 1)`);
        if (s.activeTabs > 1) failures.push(`${where}: ${s.activeTabs} tab đang mở (tối đa 1)`);
        if (SUBNAV_PATHS.includes(path)) {
          if (s.hasTabsRow) failures.push(`${where}: nhóm DT-HĐ-TT không được có hàng tab của khung`);
          if (!s.hasSubnav) failures.push(`${where}: thiếu thanh mục con DT-HĐ-TT`);
        } else if (path === "/cai-dat") {
          if (!s.hasTabsRow || s.tabLinks !== 0) failures.push(`${where}: Cài đặt phải có hàng tab rỗng`);
        } else if (!s.hasTabsRow || s.activeTabs !== 1) {
          failures.push(`${where}: thiếu hàng tab hoặc tab đang mở`);
        }
      }
      notes.push(`${vp.width}px: đã kiểm ${TAB_PATHS.length + SUBNAV_PATHS.length} trang`);
    }
  } finally {
    await page.close();
  }
  return { failures, notes };
};
