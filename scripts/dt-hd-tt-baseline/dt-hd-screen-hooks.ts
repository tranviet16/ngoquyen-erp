/**
 * Đọc các hook của màn DT-HĐ (components/du-an/dt-hd-tt/dt-hd-screen.tsx) cho lệnh đo `dt-hd` và cho kiểm
 * link Tổng quan → DT-HĐ của lệnh `todos`. Trang giữ kết nối dài nên chờ `load` + phần tử + một nhịp ổn
 * định, không chờ `networkidle`. Thiếu hook nào ở gốc màn hình → `MissingHookError` (script thoát khác 0).
 */

import type { Page } from "playwright";
import { canonicalJson } from "../../lib/du-an/dt-hd-tt/grid-url-codec";
import { DT_HD_URL } from "../../lib/du-an/dt-hd-tt/screen-links";
import { liveSearch, MissingHookError, PAGE_TIMEOUT_MS, SETTLE_MS } from "./screen-state-hooks";

export interface DtHdSummaryState {
  key: string;
  open: boolean;
  /** Mã tình trạng có dòng trong khối (vuot, con-thieu, …). */
  statuses: string[];
}

export interface DtHdScreenState {
  /** JSON khóa đã sắp xếp của trạng thái URL mà màn đang giữ (`data-dt-hd-state`). */
  state: string;
  /** Khối đang mở (`data-dt-hd-open`). */
  open: string[];
  /** Số khối đầu mối của báo cáo (`data-dt-hd-blocks`). */
  blocks: number;
  visibleLines: number;
  totalLines: number;
  rows: DtHdSummaryState[];
  /** Mã tình trạng của từng dòng dự toán đang hiện. */
  lines: string[];
  /** Số dòng hóa đơn "↳" đang hiện. */
  invoiceRows: number;
}

export async function waitForDtHd(page: Page): Promise<void> {
  try {
    await page.locator("[data-dt-hd-screen]").first().waitFor({ state: "attached", timeout: PAGE_TIMEOUT_MS });
  } catch {
    throw new MissingHookError(`thiếu phần tử data-dt-hd-screen ở ${new URL(page.url()).pathname}`);
  }
}

export async function readDtHd(page: Page): Promise<DtHdScreenState> {
  await waitForDtHd(page);
  const { missing, state } = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-dt-hd-screen]")!;
    const d = root.dataset;
    const required = { state: d.dtHdState, open: d.dtHdOpen, blocks: d.dtHdBlocks, visibleLines: d.visibleLines, totalLines: d.totalLines };
    return {
      missing: Object.entries(required).filter(([, v]) => v === undefined).map(([k]) => k),
      state: {
        state: d.dtHdState ?? "",
        open: (d.dtHdOpen ?? "").split(",").filter(Boolean),
        blocks: Number(d.dtHdBlocks ?? "NaN"),
        visibleLines: Number(d.visibleLines ?? "NaN"),
        totalLines: Number(d.totalLines ?? "NaN"),
        rows: [...root.querySelectorAll<HTMLElement>("[data-dt-hd-summary-row]")].map((tr) => ({
          key: tr.dataset.dtHdSummaryRow ?? "",
          open: tr.dataset.open === "true",
          statuses: (tr.dataset.statuses ?? "").split(" ").filter(Boolean),
        })),
        lines: [...root.querySelectorAll<HTMLElement>("[data-dt-hd-line]")].map((tr) => tr.dataset.dtHdLine ?? ""),
        invoiceRows: root.querySelectorAll("[data-dt-hd-invoice]").length,
      },
    };
  });
  if (missing.length > 0) throw new MissingHookError(`màn DT-HĐ thiếu hook: ${missing.join(", ")}`);
  return state;
}

/** Mở URL như người dùng gõ / bấm link, chờ màn DT-HĐ rồi đọc. */
export async function landDtHd(page: Page, url: string): Promise<DtHdScreenState> {
  await page.goto(url, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
  await waitForDtHd(page);
  await page.waitForTimeout(SETTLE_MS);
  return readDtHd(page);
}

/** Trạng thái đọc từ URL đang hiện, cùng dạng với `data-dt-hd-state`. */
export const dtHdStateOfUrl = (page: Page): string => canonicalJson(DT_HD_URL.parse(liveSearch(page)));
