/**
 * Lệnh đo `filters` (tiêu chí 3 và nửa "lọc" của tiêu chí 6), CHỈ ĐỌC, trên công trình `--project`:
 *   - mỗi dòng của hợp đồng URL (screen-links) cho các sổ, Đầu mối, Ánh xạ và Dự toán: mở link → trạng thái
 *     ở `data-filters` bằng trạng thái đọc từ URL, URL vẫn mang đúng bộ lọc của link, và còn ≥ 1 dòng;
 *   - Hóa đơn và Ánh xạ: đổi bộ lọc trên trang, sang trang khác bằng link trong app, bấm Back → trạng thái
 *     khôi phục bằng URL (không phải bộ lọc lúc mới vào trang);
 *   - thiếu hook `data-*` nào → lỗi (thoát khác 0).
 * Giá trị lọc lấy từ chính trang (`data-samples`: giá trị có thật trong dữ liệu), không đoán id. Giá trị đặc
 * biệt (none / chưa gán / chưa chốt / 0) không có dòng nào thì ghi chú bỏ qua — khi đó Tổng quan cũng không
 * hiện việc dẫn tới nó. Thông báo chỉ nói màn / cột / kết luận, không in giá trị dữ liệu.
 */

import type { Page } from "playwright";
import type { MeasureCommand } from "../dt-hd-tt-baseline/measure-types";
import { land, liveSearch, MissingHookError, PAGE_TIMEOUT_MS, readHook, SETTLE_MS, waitForHook, type ScreenState } from "../dt-hd-tt-baseline/screen-state-hooks";
import { canonicalJson, gridQuery } from "../../lib/du-an/dt-hd-tt/grid-url-codec";
import type { AliasSource } from "../../lib/du-an/dt-hd-tt/register-ui";
import {
  ANH_XA_STATUSES, ANH_XA_URL, anhXaQuery, CHI_THUC_TE_GRID_SPEC, CHI_THUC_TE_URL, DAU_MOI_ANCHORS, DAU_MOI_COUNTERPARTY_URL,
  DAU_MOI_PAGE_SPEC, DAU_MOI_SUPPLIER_URL, DU_TOAN_KINDLESS, duToanQuery, HOA_DON_GRID_SPEC, HOA_DON_URL, NO_COUNTERPARTY,
  NONE_FILTER_VALUE, parseDuToanQuery, screenHref, SPECIAL_FILTER_VALUES, THUC_TE_NHAP_GRID_SPEC, THUC_TE_NHAP_URL, UNMAPPED_TEXT,
  UNSETTLED_ACTUAL, type AnhXaParams, type ScreenTarget,
} from "../../lib/du-an/dt-hd-tt/screen-links";
import type { ResourceSpec } from "../../lib/table/types";

type Codec = { parse: (search: string) => unknown };
const FIRST = "(giá trị đầu tiên)";

interface GridCase {
  screen: ScreenTarget;
  hook: string;
  spec: ResourceSpec;
  codec: Codec;
  column: string;
  /** FIRST = giá trị thường đầu tiên của cột; còn lại là giá trị đặc biệt của hợp đồng. */
  pick: string;
}

const g = (screen: ScreenTarget, hook: string, spec: ResourceSpec, codec: Codec) => (column: string, pick: string): GridCase => ({ screen, hook, spec, codec, column, pick });
const hoaDon = g("hoa-don", "hoa-don", HOA_DON_GRID_SPEC, HOA_DON_URL);
const thucTe = g("thuc-te-nhap", "thuc-te-nhap", THUC_TE_NHAP_GRID_SPEC, THUC_TE_NHAP_URL);
const chiTt = g("chi-thuc-te", "chi-thuc-te", CHI_THUC_TE_GRID_SPEC, CHI_THUC_TE_URL);
const dauMoi = g("dau-moi", "dau-moi", DAU_MOI_PAGE_SPEC, DAU_MOI_COUNTERPARTY_URL);
const dauMoiNcc = g("dau-moi", "dau-moi-ncc", DAU_MOI_PAGE_SPEC, DAU_MOI_SUPPLIER_URL);

/** Hợp đồng URL của các sổ và Đầu mối (phase-03, bảng "URL contract"). */
const GRID_CASES: GridCase[] = [
  hoaDon("supplierId", FIRST), hoaDon("invoiceNo", FIRST), hoaDon("mapping", UNMAPPED_TEXT),
  thucTe("counterpartyId", FIRST), thucTe("counterpartyId", NONE_FILTER_VALUE), thucTe("mapping", UNMAPPED_TEXT), thucTe("itemName", FIRST),
  chiTt("supplierId", FIRST), chiTt("supplierId", NONE_FILTER_VALUE), chiTt("counterpartyId", FIRST), chiTt("counterpartyId", NONE_FILTER_VALUE), chiTt("content", FIRST),
  dauMoi("actual", UNSETTLED_ACTUAL), dauMoi("name", FIRST),
  dauMoiNcc("counterpartyId", NO_COUNTERPARTY), dauMoiNcc("supplierName", FIRST),
];
const BOOK_HOOKS: Partial<Record<ScreenTarget, string[]>> = {
  "hoa-don": ["hoa-don"], "thuc-te-nhap": ["thuc-te-nhap"], "chi-thuc-te": ["chi-thuc-te"], "dau-moi": ["dau-moi", "dau-moi-ncc"],
};
const TABS: readonly AliasSource[] = ["dt", "hd", "tt"];

const pickValue = (samples: string[] | undefined, pick: string): string | undefined =>
  pick === FIRST ? samples?.find((v) => !SPECIAL_FILTER_VALUES.includes(v)) : samples?.includes(pick) ? pick : undefined;

export const run: MeasureCommand = async ({ session, projectId }) => {
  const failures: string[] = [];
  const notes: string[] = [];
  const page = await session.context.newPage();
  const href = (target: ScreenTarget, query = "", hash = "") => `${session.baseUrl}${screenHref(projectId, target, { query, hash })}`;

  /** Mở link, so hook với URL và với trạng thái mà link mang; cần ≥ 1 dòng khi `needRows`. */
  async function checkLanding(where: string, url: string, hook: string, codec: Codec, expected: unknown, needRows: boolean): Promise<ScreenState | null> {
    const s = (await land(page, url, [hook]))[hook];
    const urlState = canonicalJson(codec.parse(liveSearch(page)));
    if (s.filters !== urlState) failures.push(`${where}: data-filters khác trạng thái đọc từ URL`);
    if (urlState !== canonicalJson(expected)) failures.push(`${where}: URL sau khi vào trang không còn đúng bộ lọc của link`);
    if (needRows && !(s.visibleRows >= 1)) failures.push(`${where}: không còn dòng nào sau khi lọc`);
    return s;
  }

  async function books() {
    const samples: Record<string, ScreenState> = {};
    for (const [screen, hooks] of Object.entries(BOOK_HOOKS) as [ScreenTarget, string[]][]) {
      Object.assign(samples, await land(page, href(screen), hooks));
    }
    for (const c of GRID_CASES) {
      const where = `${c.screen} [${c.hook}] filter.${c.column}=${c.pick === FIRST ? FIRST : c.pick}`;
      const value = pickValue(samples[c.hook]?.samples[c.column], c.pick);
      if (value === undefined) {
        if (c.pick === FIRST) failures.push(`${where}: trang không có dòng nào để lấy giá trị đo`);
        else notes.push(`${where}: bỏ qua — không có dòng nào mang giá trị này`);
        continue;
      }
      const query = gridQuery(c.spec, { [c.column]: value });
      await checkLanding(where, href(c.screen, query), c.hook, c.codec, c.codec.parse(`?${query}`), true);
    }
  }

  async function dauMoiAnchors() {
    await land(page, href("dau-moi", gridQuery(DAU_MOI_PAGE_SPEC, { counterpartyId: NO_COUNTERPARTY }), DAU_MOI_ANCHORS.ncc), ["dau-moi-ncc"]);
    const anchors = await page.evaluate((ids) => ({
      ncc: document.getElementById(ids.ncc) !== null,
      withoutRow: document.getElementById(ids.nccWithoutRow) !== null,
      withoutRowCount: Number(document.getElementById(ids.ncc)?.dataset.nccWithoutRow ?? "NaN"),
    }), DAU_MOI_ANCHORS);
    if (!anchors.ncc) failures.push(`dau-moi: thiếu neo #${DAU_MOI_ANCHORS.ncc}`);
    if (!Number.isFinite(anchors.withoutRowCount)) failures.push("dau-moi: thiếu data-ncc-without-row");
    else if (anchors.withoutRowCount > 0 && !anchors.withoutRow) failures.push(`dau-moi: thiếu neo #${DAU_MOI_ANCHORS.nccWithoutRow}`);
    else if (anchors.withoutRowCount === 0) notes.push(`dau-moi #${DAU_MOI_ANCHORS.nccWithoutRow}: bỏ qua — không có NCC nào chưa có dòng`);
  }

  async function anhXa() {
    for (const tab of TABS) {
      const base = await checkLanding(`anh-xa tab=${tab}`, href("anh-xa", anhXaQuery({ tab })), "anh-xa", ANH_XA_URL, { tab }, false);
      if (!base) continue;
      if (base.tab !== tab) failures.push(`anh-xa tab=${tab}: data-tab khác tab của URL`);
      if (!((base.totalRows ?? 0) > 0)) {
        notes.push(`anh-xa tab=${tab}: bỏ qua lọc — tab không có khóa nào`);
        continue;
      }
      if (!(base.visibleRows >= 1)) failures.push(`anh-xa tab=${tab}: không còn dòng nào`);
      const cases: [string, AnhXaParams][] = [];
      for (const status of ANH_XA_STATUSES) {
        if (tab === "dt" && (status === "ngoai_dt" || status === "thieu_he_so")) continue;
        if (base.samples.status?.includes(status)) cases.push([`status=${status}`, { tab, status }]);
        else notes.push(`anh-xa tab=${tab} status=${status}: bỏ qua — không có khóa nào`);
      }
      if (base.samples.q?.[0]) cases.push(["q", { tab, q: base.samples.q[0] }]);
      if (base.samples.key?.[0]) cases.push(["key", { tab, key: base.samples.key[0] }]);
      for (const [label, params] of cases) {
        const where = `anh-xa tab=${tab} ${label}`;
        const s = await checkLanding(where, href("anh-xa", anhXaQuery(params)), "anh-xa", ANH_XA_URL, ANH_XA_URL.parse(`?${anhXaQuery(params)}`), true);
        if (params.key && s?.openKey !== params.key) failures.push(`${where}: khóa của link không được mở`);
      }
    }
  }

  async function duToan() {
    const bare = await checkLanding("du-toan", href("du-toan"), "du-toan", { parse: parseDuToanQuery }, {}, false);
    if (!bare?.samples.loai?.includes(DU_TOAN_KINDLESS)) {
      notes.push("du-toan loai=thieu: bỏ qua — không có dòng dự toán nào chưa có loại");
      return;
    }
    await checkLanding("du-toan loai=thieu", href("du-toan", duToanQuery({ loai: DU_TOAN_KINDLESS })), "du-toan", { parse: parseDuToanQuery }, { loai: DU_TOAN_KINDLESS }, true);
  }

  /** Đổi bộ lọc trên trang → link trong app sang trang khác → Back: trạng thái khôi phục = URL. */
  async function backRestores(where: string, hook: string, codec: Codec, change: (p: Page) => Promise<void>, awayHook: string, awaySegment: string) {
    const landedUrl = page.url();
    await change(page);
    await page.waitForFunction((before) => location.href !== before, landedUrl, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    const changedSearch = liveSearch(page);
    const before = await readHook(page, hook);
    if (before.filters !== canonicalJson(codec.parse(changedSearch))) failures.push(`${where}: sau khi đổi lọc, data-filters khác URL`);
    await page.locator(`[data-nav-row="dt-hd-tt"] a[href$="/dt-hd-tt/${awaySegment}"]`).first().click();
    await waitForHook(page, awayHook);
    await page.goBack({ waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
    await waitForHook(page, hook);
    await page.waitForTimeout(SETTLE_MS);
    const after = await readHook(page, hook);
    if (liveSearch(page) !== changedSearch) failures.push(`${where}: Back không về đúng URL đã đổi`);
    if (after.filters !== canonicalJson(codec.parse(liveSearch(page)))) failures.push(`${where}: sau Back, trạng thái lọc khác URL`);
    if (after.filters !== before.filters) failures.push(`${where}: sau Back, trạng thái lọc khác bộ lọc vừa đổi`);
  }

  async function backTests() {
    // Hóa đơn: vào bằng link "chưa gán" (hoặc trang trần), chọn NCC ở ô lọc của lưới.
    const hd = (await land(page, href("hoa-don"), ["hoa-don"]))["hoa-don"];
    const supplier = pickValue(hd.samples.supplierId, FIRST);
    if (!supplier) {
      failures.push("hoa-don Back: không có NCC nào để đổi bộ lọc");
    } else {
      const start = hd.samples.mapping?.includes(UNMAPPED_TEXT) ? gridQuery(HOA_DON_GRID_SPEC, { mapping: UNMAPPED_TEXT }) : "";
      await land(page, href("hoa-don", start), ["hoa-don"]);
      await backRestores("hoa-don Back", "hoa-don", HOA_DON_URL, async (p) => {
        // Ô lọc chọn của FilterBar là <select> có lựa chọn "Tất cả" (value ""); lưới tải sau hydrate.
        const select = p.locator("select").filter({ has: p.locator('option[value=""]', { hasText: "Tất cả" }) }).first();
        await select.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
        await select.selectOption(supplier);
      }, "dau-moi", "dau-moi");
    }

    // Ánh xạ: vào một tab có khóa, đổi trạng thái lọc (hoặc ô tìm nếu tab chỉ có một kiểu trạng thái).
    for (const tab of TABS) {
      const base = (await land(page, href("anh-xa", anhXaQuery({ tab })), ["anh-xa"]))["anh-xa"];
      if (!((base.totalRows ?? 0) > 0)) continue;
      const status = base.samples.status?.[0];
      await backRestores(`anh-xa tab=${tab} Back`, "anh-xa", ANH_XA_URL, async (p) => {
        if (status) await p.locator('select[data-filter-control="status"]').selectOption(status);
        else await p.locator('input[data-filter-control="q"]').fill(base.samples.q?.[0] ?? "a");
      }, "hoa-don", "hoa-don");
      return;
    }
    failures.push("anh-xa Back: không tab nào có khóa để đổi bộ lọc");
  }

  try {
    for (const [name, step] of [["sổ + Đầu mối", books], ["neo Đầu mối", dauMoiAnchors], ["Ánh xạ", anhXa], ["Dự toán", duToan], ["Back", backTests]] as const) {
      const before = failures.length;
      try {
        await step();
      } catch (err) {
        failures.push(err instanceof MissingHookError ? `${name}: ${err.message}` : `${name}: lỗi khi đo — ${err instanceof Error ? err.message : String(err)}`);
      }
      notes.push(`${name}: ${failures.length === before ? "đạt" : `${failures.length - before} lỗi`}`);
    }
  } finally {
    await page.close();
  }
  return { failures, notes };
};
