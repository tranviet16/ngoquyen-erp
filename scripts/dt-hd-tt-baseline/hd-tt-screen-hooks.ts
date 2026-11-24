/**
 * Đọc các hook của màn HĐ-TT (components/du-an/dt-hd-tt/hd-tt-screen.tsx) và DT-TT (dt-tt-screen.tsx) cho lệnh đo
 * `hd-tt` và cho kiểm link Tổng quan → HĐ-TT / DT-TT của lệnh `todos`. Trang giữ kết nối dài nên chờ `load` + phần tử
 * + một nhịp ổn định, không chờ `networkidle`. Thiếu hook nào ở gốc màn hình → `MissingHookError` (script thoát khác 0).
 * Không khai báo hàm có tên trong `page.evaluate` (tsx chèn `__name`, trình duyệt không có).
 */

import type { Page } from "playwright";
import { canonicalJson } from "../../lib/du-an/dt-hd-tt/grid-url-codec";
import { HD_TT_URL } from "../../lib/du-an/dt-hd-tt/screen-links";
import { liveSearch, MissingHookError, PAGE_TIMEOUT_MS, SETTLE_MS } from "./screen-state-hooks";

export interface HdTtScreenState {
  /** JSON khóa đã sắp xếp của trạng thái URL mà màn đang giữ (`data-hd-tt-state`). */
  state: string;
  /** Số dòng báo cáo (`data-hd-tt-rows`) và số dòng đang hiện (`data-visible-rows`). */
  totalRows: number;
  visibleRows: number;
  /** Số dòng NCC thật sự có trong bảng. */
  domRows: number;
  canEdit: boolean;
  editing: boolean;
  /** Số trên từng chip `loc`. */
  chips: Record<string, number>;
  /** Chữ ô đầu của dòng tổng. */
  totalLabel: string;
}

async function waitForRoot(page: Page, selector: string): Promise<void> {
  try {
    await page.locator(selector).first().waitFor({ state: "attached", timeout: PAGE_TIMEOUT_MS });
  } catch {
    throw new MissingHookError(`thiếu phần tử ${selector} ở ${new URL(page.url()).pathname}`);
  }
}

export const waitForHdTt = (page: Page) => waitForRoot(page, "[data-hd-tt-screen]");
export const waitForDtTt = (page: Page) => waitForRoot(page, "[data-dt-tt-screen]");

export async function readHdTt(page: Page): Promise<HdTtScreenState> {
  await waitForHdTt(page);
  const { missing, state } = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-hd-tt-screen]")!;
    const d = root.dataset;
    const required = {
      state: d.hdTtState, rows: d.hdTtRows, visibleRows: d.visibleRows, canEdit: d.canEdit, editing: d.editing,
      box: root.querySelector("[data-hd-tt-box]") ? "" : undefined, total: root.querySelector("[data-hd-tt-total]") ? "" : undefined,
    };
    return {
      missing: Object.entries(required).filter(([, v]) => v === undefined).map(([k]) => k),
      state: {
        state: d.hdTtState ?? "",
        totalRows: Number(d.hdTtRows ?? "NaN"),
        visibleRows: Number(d.visibleRows ?? "NaN"),
        domRows: root.querySelectorAll("[data-hd-tt-row]").length,
        canEdit: d.canEdit === "true",
        editing: d.editing === "true",
        chips: Object.fromEntries(
          [...root.querySelectorAll<HTMLElement>("[data-loc-chip][data-count]")].map((el) => [el.dataset.locChip ?? "", Number(el.dataset.count ?? "NaN")]),
        ),
        totalLabel: root.querySelector("[data-hd-tt-total] td")?.textContent?.trim() ?? "",
      },
    };
  });
  if (missing.length > 0) throw new MissingHookError(`màn HĐ-TT thiếu hook: ${missing.join(", ")}`);
  return state;
}

/** Mở URL như người dùng gõ / bấm link, chờ màn HĐ-TT rồi đọc. */
export async function landHdTt(page: Page, url: string): Promise<HdTtScreenState> {
  await page.goto(url, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
  await waitForHdTt(page);
  await page.waitForTimeout(SETTLE_MS);
  return readHdTt(page);
}

/** Trạng thái đọc từ URL đang hiện, cùng dạng với `data-hd-tt-state`. */
export const hdTtStateOfUrl = (page: Page): string => canonicalJson(HD_TT_URL.parse(liveSearch(page)));

export interface DtTtScreenState {
  /** Thanh nhảy có mặt và dính (`position: sticky`). */
  jump: boolean;
  jumpSticky: boolean;
  /** Đích của các link trên thanh nhảy (không có "#"). */
  jumpTargets: string[];
  /** Neo đang có trong màn (id của các phần và các dòng `dm-`). */
  anchors: string[];
  /** Số dòng Phần II theo màn (`data-phan-ii-rows`) và số dòng mang neo `dm-`. */
  phanIIRows: number;
  counterpartyAnchors: number;
}

export async function readDtTt(page: Page): Promise<DtTtScreenState> {
  await waitForDtTt(page);
  const state = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-dt-tt-screen]")!;
    const jump = root.querySelector<HTMLElement>("[data-dt-tt-jump]");
    return {
      jump: jump !== null,
      jumpSticky: jump !== null && getComputedStyle(jump).position === "sticky",
      jumpTargets: jump ? [...jump.querySelectorAll<HTMLAnchorElement>("a[href^='#']")].map((a) => a.getAttribute("href")!.slice(1)) : [],
      anchors: [...root.querySelectorAll<HTMLElement>("[id]")].map((el) => el.id),
      phanIIRows: Number(root.dataset.phanIiRows ?? "NaN"),
      counterpartyAnchors: root.querySelectorAll("[data-dt-tt-counterparty][id^='dm-']").length,
    };
  });
  if (!state.jump) throw new MissingHookError("màn DT-TT thiếu thanh nhảy data-dt-tt-jump");
  if (!Number.isFinite(state.phanIIRows)) throw new MissingHookError("màn DT-TT thiếu hook data-phan-ii-rows");
  return state;
}
