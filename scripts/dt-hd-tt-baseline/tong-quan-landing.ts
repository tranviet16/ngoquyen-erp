/**
 * Kiểm "link của Tổng quan mở ra đúng chỗ" cho lệnh đo `todos`: theo đích của link (đọc từ đường dẫn),
 *   - đích đã sẵn sàng (`READY_TARGETS`): trạng thái `data-*` của màn = tham số của link (đọc bằng parser
 *     của chính màn đó), URL sau khi vào vẫn mang đúng tham số, và còn ≥ 1 dòng; neo phải có phần tử;
 *   - đích chưa sẵn sàng: link là trang trần và trang mở ra không có query / neo;
 *   - Cài đặt: ngoại lệ không lọc duy nhất, chỉ cần mở được;
 *   - DT-HĐ (màn báo cáo, hook `data-dt-hd-state`): trạng thái = tham số link = URL, còn ≥ 1 đầu mối; link
 *     `dauMoi` của Kiểm tổng chỉ hiện đúng khối đó và khối đang mở; link trần hiện đủ mọi khối.
 * Đích đã sẵn sàng mà chưa có cách kiểm ở đây → lỗi (phase làm màn đó phải thêm vào). Thông báo chỉ nói
 * đích / tham số / kết luận, không in số liệu.
 */

import type { Page } from "playwright";
import { canonicalJson } from "../../lib/du-an/dt-hd-tt/grid-url-codec";
import {
  ANH_XA_URL, CHI_THUC_TE_URL, DAU_MOI_ANCHORS, DAU_MOI_COUNTERPARTY_URL, DAU_MOI_SUPPLIER_URL, DT_HD_URL, HOA_DON_URL, parseDuToanQuery,
  READY_TARGETS, screenPath, THUC_TE_NHAP_URL, type ScreenTarget,
} from "../../lib/du-an/dt-hd-tt/screen-links";
import { dtHdStateOfUrl, readDtHd, waitForDtHd } from "./dt-hd-screen-hooks";
import { liveSearch, PAGE_TIMEOUT_MS, readHook, SETTLE_MS, waitForHook } from "./screen-state-hooks";

const ALL_TARGETS: readonly ScreenTarget[] = ["hoa-don", "thuc-te-nhap", "chi-thuc-te", "dau-moi", "anh-xa", "du-toan", "dt-hd", "dt-tt", "hd-tt", "cai-dat"];

type Codec = { parse: (search: string) => unknown };

/** Màn đã nhận bộ lọc từ URL: hook `data-grid-state` + parser của nó. Đầu mối có hai lưới, xử lý riêng. */
const GRID_LANDINGS: Partial<Record<ScreenTarget, { hook: string; codec: Codec }>> = {
  "hoa-don": { hook: "hoa-don", codec: HOA_DON_URL },
  "thuc-te-nhap": { hook: "thuc-te-nhap", codec: THUC_TE_NHAP_URL },
  "chi-thuc-te": { hook: "chi-thuc-te", codec: CHI_THUC_TE_URL },
  "anh-xa": { hook: "anh-xa", codec: ANH_XA_URL },
  "du-toan": { hook: "du-toan", codec: { parse: parseDuToanQuery } },
};

export interface ParsedLink {
  href: string;
  target: ScreenTarget;
  search: string;
  hash: string;
  ready: boolean;
}

/** Đích của một href của Tổng quan (theo đường dẫn); null = không phải màn của công trình (vd. Xuất Excel). */
export function parseLink(projectId: number, href: string): ParsedLink | null {
  const url = new URL(href, "http://127.0.0.1");
  const target = ALL_TARGETS.find((t) => screenPath(projectId, t) === url.pathname);
  if (!target) return null;
  return { href, target, search: url.search, hash: url.hash.replace(/^#/, ""), ready: READY_TARGETS.includes(target) };
}

export const isFiltered = (l: ParsedLink) => l.search !== "" || l.hash !== "";

/** Màn đã vào xong (sau khi bấm link): chờ hook của màn (hoặc hàng điều hướng của khung) + một nhịp ổn định. */
async function settle(page: Page, hooks: readonly string[]): Promise<void> {
  if (hooks.length > 0) for (const h of hooks) await waitForHook(page, h);
  else await page.locator('[data-nav-row="groups"]').first().waitFor({ timeout: PAGE_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Kiểm trang vừa mở từ link `l` (trang đã điều hướng tới đúng đường dẫn). `where` dùng cho thông báo.
 * Trả về danh sách lỗi.
 */
export async function checkLanding(page: Page, l: ParsedLink, where: string): Promise<string[]> {
  const failures: string[] = [];
  const grid = GRID_LANDINGS[l.target];

  if (!l.ready) {
    if (isFiltered(l)) failures.push(`${where}: đích ${l.target} chưa sẵn sàng nhưng link mang tham số`);
    await settle(page, []);
    const now = new URL(page.url());
    if (now.search !== "" || now.hash !== "") failures.push(`${where}: đích ${l.target} chưa sẵn sàng nhưng trang mở ra không phải trang trần`);
    return failures;
  }

  if (l.target === "cai-dat") {
    await settle(page, []);
    return failures;
  }

  if (grid) {
    await settle(page, [grid.hook]);
    const s = await readHook(page, grid.hook);
    const params = grid.codec.parse(l.search);
    const expected = canonicalJson(params);
    if (expected === "{}") failures.push(`${where}: link tới ${l.target} không mang bộ lọc`);
    if (s.filters !== canonicalJson(grid.codec.parse(liveSearch(page)))) failures.push(`${where}: data-filters khác trạng thái đọc từ URL`);
    if (s.filters !== expected) failures.push(`${where}: trạng thái lọc khác tham số của link`);
    if (!(s.visibleRows >= 1)) failures.push(`${where}: không còn dòng nào sau khi lọc`);
    const tab = (params as { tab?: string }).tab;
    if (l.target === "anh-xa" && s.tab !== tab) failures.push(`${where}: data-tab khác tab của link`);
    return failures;
  }

  if (l.target === "dau-moi") {
    await settle(page, ["dau-moi", "dau-moi-ncc"]);
    const parts: [string, Codec][] = [["dau-moi", DAU_MOI_COUNTERPARTY_URL], ["dau-moi-ncc", DAU_MOI_SUPPLIER_URL]];
    let filtered = false;
    for (const [hook, codec] of parts) {
      const expected = canonicalJson(codec.parse(l.search));
      if (expected === "{}") continue;
      filtered = true;
      const s = await readHook(page, hook);
      if (s.filters !== canonicalJson(codec.parse(liveSearch(page)))) failures.push(`${where} [${hook}]: data-filters khác trạng thái đọc từ URL`);
      if (s.filters !== expected) failures.push(`${where} [${hook}]: trạng thái lọc khác tham số của link`);
      if (!(s.visibleRows >= 1)) failures.push(`${where} [${hook}]: không còn dòng nào sau khi lọc`);
    }
    if (l.hash) {
      filtered = true;
      const anchor = await page.evaluate(({ id, ids }) => ({
        present: document.getElementById(id) !== null,
        withoutRow: Number(document.getElementById(ids.ncc)?.dataset.nccWithoutRow ?? "NaN"),
      }), { id: l.hash, ids: DAU_MOI_ANCHORS });
      if (!anchor.present) failures.push(`${where}: thiếu neo #${l.hash}`);
      if (l.hash === DAU_MOI_ANCHORS.nccWithoutRow && !(anchor.withoutRow >= 1)) failures.push(`${where}: thông báo NCC chưa có dòng không liệt kê NCC nào`);
    }
    if (!filtered) failures.push(`${where}: link tới dau-moi không mang bộ lọc hay neo`);
    return failures;
  }

  if (l.target === "dt-hd") return checkDtHdLanding(page, l, where);

  failures.push(`${where}: đích ${l.target} đã sẵn sàng nhưng lệnh đo todos chưa có cách kiểm màn này`);
  return failures;
}

/** DT-HĐ mở từ link của Tổng quan (Kiểm tổng `dauMoi=…`, lối tắt "Mở" trần). */
async function checkDtHdLanding(page: Page, l: ParsedLink, where: string): Promise<string[]> {
  const failures: string[] = [];
  await waitForDtHd(page);
  await page.waitForTimeout(SETTLE_MS);
  const s = await readDtHd(page);
  const params = DT_HD_URL.parse(l.search);
  if (s.state !== dtHdStateOfUrl(page)) failures.push(`${where}: data-dt-hd-state khác trạng thái đọc từ URL`);
  if (s.state !== canonicalJson(params)) failures.push(`${where}: trạng thái DT-HĐ khác tham số của link`);
  if (!(s.rows.length >= 1)) failures.push(`${where}: không còn đầu mối nào`);
  if (params.dauMoi !== undefined) {
    const row = s.rows.find((r) => r.key === String(params.dauMoi));
    if (!row || s.rows.length !== 1) failures.push(`${where}: link dauMoi không hiện đúng một khối đầu mối của nó`);
    else if (!row.open) failures.push(`${where}: khối đầu mối của link không mở`);
  }
  if (canonicalJson(params) === "{}" && s.rows.length !== s.blocks) failures.push(`${where}: link trần không hiện đủ khối đầu mối`);
  return failures;
}
