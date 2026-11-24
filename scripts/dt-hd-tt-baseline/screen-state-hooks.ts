/**
 * Đọc phần tử ẩn `data-grid-state` mà các màn sửa việc vẽ ra (components/du-an/dt-hd-tt/screen-state-hook.tsx)
 * cho lệnh đo `filters`. Lưới vẽ trên canvas nên trạng thái lọc chỉ đọc được qua các thuộc tính này.
 * Trang giữ kết nối dài (huy hiệu, Suspense) nên chờ `load` + phần tử + một nhịp ổn định, không chờ
 * `networkidle`.
 */

import type { Page } from "playwright";

export const PAGE_TIMEOUT_MS = 90_000;
/** Đủ cho microtask đọc URL lúc gắn trang + replaceState chuẩn hóa + Suspense của khung. */
export const SETTLE_MS = 1_000;

export interface ScreenState {
  /** JSON khóa đã sắp xếp của trạng thái lọc đang áp dụng. */
  filters: string;
  visibleRows: number;
  samples: Record<string, string[]>;
  tab?: string;
  openKey?: string;
  totalRows?: number;
}

/** Hook bị thiếu = lỗi đo (script thoát khác 0), không phải "không có dữ liệu". */
export class MissingHookError extends Error {}

export async function waitForHook(page: Page, name: string): Promise<void> {
  try {
    await page.locator(`[data-grid-state="${name}"]`).first().waitFor({ state: "attached", timeout: PAGE_TIMEOUT_MS });
  } catch {
    throw new MissingHookError(`thiếu phần tử data-grid-state="${name}" ở ${new URL(page.url()).pathname}`);
  }
}

export async function readHook(page: Page, name: string): Promise<ScreenState> {
  await waitForHook(page, name);
  return page.locator(`[data-grid-state="${name}"]`).first().evaluate((node: HTMLElement) => {
    const d = node.dataset;
    return {
      filters: d.filters ?? "",
      visibleRows: Number(d.visibleRows ?? "NaN"),
      samples: JSON.parse(d.samples ?? "{}") as Record<string, string[]>,
      tab: d.tab,
      openKey: d.openKey,
      totalRows: d.totalRows === undefined ? undefined : Number(d.totalRows),
    };
  });
}

/** Mở URL như người dùng gõ / bấm link từ Tổng quan, chờ các hook rồi đọc. */
export async function land(page: Page, url: string, hooks: readonly string[]): Promise<Record<string, ScreenState>> {
  await page.goto(url, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
  for (const name of hooks) await waitForHook(page, name);
  await page.waitForTimeout(SETTLE_MS);
  const out: Record<string, ScreenState> = {};
  for (const name of hooks) out[name] = await readHook(page, name);
  return out;
}

/** Query của URL đang hiện (sau replaceState chuẩn hóa), có "?". */
export const liveSearch = (page: Page): string => new URL(page.url()).search;
