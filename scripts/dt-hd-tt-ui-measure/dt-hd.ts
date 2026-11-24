/**
 * Lệnh đo `dt-hd` (tiêu chí 4), CHỈ ĐỌC, trên công trình `--project`, ở 1440 × 900:
 *   1. trang trần: số dòng tóm tắt (`data-dt-hd-summary-row`) = số khối đầu mối của trang (`data-dt-hd-blocks`),
 *      mọi khối đóng, không dòng dự toán; chiều cao `main` khi đóng hết ≤ 2 000 px; bản in (`data-print-view`)
 *      là con cuối của trang, ngay sau màn hình (`data-report-screen`);
 *   2. `?mo=<khối đầu>`: khối đó mở và trạng thái = URL; reload → vẫn vậy;
 *   3. `?loc=vuot`: chỉ còn (và đủ) các khối có dòng "Vượt", khối nào cũng mở, mọi dòng dự toán đang hiện là
 *      "Vượt", số dòng hiện = số trên chip;
 *   4. bấm chip `loc` và bấm một khối (đổi `loc`, `mo`), sang Ánh xạ bằng link Phần B (link phải mở đúng khóa;
 *      không có dòng chưa gán thì qua thanh mục con), bấm Back → trạng thái = URL = trạng thái vừa đổi;
 *   5. cỡ tài liệu HTML đã giải nén ≤ 2,0 × baseline `dt-hd` và thời gian server (trung vị 5 lần) ≤ baseline + 300 ms.
 * Baseline: `--against <thư mục>` (mặc định test-results/dt-hd-tt-baseline/main). Thiếu hook hoặc baseline → lỗi.
 * Thông báo chỉ in số đếm, cỡ, thời gian và kết luận — không in số liệu hay tên.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import type { MeasureCommand } from "../dt-hd-tt-baseline/measure-types";
import { dtHdStateOfUrl, landDtHd, readDtHd, waitForDtHd, type DtHdScreenState } from "../dt-hd-tt-baseline/dt-hd-screen-hooks";
import { measureServer, type Timing } from "../dt-hd-tt-baseline/page-capture";
import { liveSearch, MissingHookError, PAGE_TIMEOUT_MS, readHook, SETTLE_MS, waitForHook } from "../dt-hd-tt-baseline/screen-state-hooks";
import { canonicalJson } from "../../lib/du-an/dt-hd-tt/grid-url-codec";
import { DT_HD_LOCS, dtHdQuery, parseAnhXaQuery, screenPath } from "../../lib/du-an/dt-hd-tt/screen-links";

const VIEWPORT = { width: 1440, height: 900 };
const MAX_COLLAPSED_HEIGHT = 2_000;
const MAX_SIZE_RATIO = 2.0;
const TIME_BUDGET_MS = 300;
const DEFAULT_BASELINE = join("test-results", "dt-hd-tt-baseline", "main");

const argValue = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function readBaseline(dir: string): { projectId: number; dtHd: Timing } | null {
  const manifestPath = join(dir, "manifest.json");
  const timingsPath = join(dir, "timings.json");
  if (!existsSync(manifestPath) || !existsSync(timingsPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { projectId: number };
  const timings = JSON.parse(readFileSync(timingsPath, "utf8")) as Record<string, Timing>;
  return timings["dt-hd"] ? { projectId: manifest.projectId, dtHd: timings["dt-hd"] } : null;
}

/** Thứ tự trang và chiều cao `main` (hộp cuộn của khung). */
async function readLayout(page: Page) {
  return page.evaluate(() => {
    const print = document.querySelector<HTMLElement>("[data-print-view]");
    return {
      mainHeight: document.querySelector("main")?.scrollHeight ?? NaN,
      hasPrint: print !== null,
      printLast: print !== null && print.parentElement?.lastElementChild === print,
      screenBefore: print?.previousElementSibling?.hasAttribute("data-report-screen") ?? false,
    };
  });
}

export const run: MeasureCommand = async ({ session, projectId, argv }) => {
  const failures: string[] = [];
  const notes: string[] = [];
  const path = screenPath(projectId, "dt-hd");
  const url = (query = "") => `${session.baseUrl}${path}${query ? `?${query}` : ""}`;
  const page = await session.context.newPage();
  await page.setViewportSize(VIEWPORT);

  const sameAsUrl = (where: string, s: DtHdScreenState) => {
    if (s.state !== dtHdStateOfUrl(page)) failures.push(`${where}: data-dt-hd-state khác trạng thái đọc từ URL`);
  };

  async function collapsed(): Promise<DtHdScreenState> {
    const s = await landDtHd(page, url());
    const layout = await readLayout(page);
    sameAsUrl("trang trần", s);
    if (!(s.blocks >= 1)) failures.push("trang trần: data-dt-hd-blocks không phải số khối dương");
    if (s.rows.length !== s.blocks) failures.push(`trang trần: ${s.rows.length} dòng tóm tắt, cần ${s.blocks} (một dòng mỗi khối)`);
    if (s.rows.some((r) => r.open) || s.lines.length > 0) failures.push("trang trần: có khối mở sẵn hoặc có dòng dự toán");
    if (!(layout.mainHeight <= MAX_COLLAPSED_HEIGHT)) failures.push(`trang trần: chiều cao khi đóng hết ${layout.mainHeight} px > ${MAX_COLLAPSED_HEIGHT} px`);
    if (!layout.hasPrint) throw new MissingHookError("thiếu phần tử data-print-view (bản in)");
    if (!layout.printLast) failures.push("bản in (data-print-view) không phải con cuối của trang");
    if (!layout.screenBefore) failures.push("màn hình (data-report-screen) không đứng ngay trước bản in");
    notes.push(`trang trần: ${s.rows.length} dòng tóm tắt, cao ${layout.mainHeight} px khi đóng hết`);
    return s;
  }

  async function openSurvivesReload(base: DtHdScreenState) {
    const key = base.rows[0]?.key;
    if (!key) {
      failures.push("mo: không có khối nào để mở");
      return;
    }
    const mo = [key === "none" ? "none" : Number(key)] as const;
    const expected = canonicalJson({ mo });
    const check = (step: string, s: DtHdScreenState) => {
      sameAsUrl(`mo (${step})`, s);
      if (s.state !== expected) failures.push(`mo (${step}): trạng thái khác tham số mo của link`);
      if (!s.rows.find((r) => r.key === key)?.open) failures.push(`mo (${step}): khối của mo không mở`);
    };
    check("vào", await landDtHd(page, url(dtHdQuery({ mo: [...mo] }))));
    await page.reload({ waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
    await waitForDtHd(page);
    await page.waitForTimeout(SETTLE_MS);
    check("reload", await readDtHd(page));
  }

  async function locFilters(base: DtHdScreenState) {
    const loc = "vuot";
    const expected = base.rows.filter((r) => r.statuses.includes(loc)).map((r) => r.key);
    const s = await landDtHd(page, url(dtHdQuery({ loc })));
    sameAsUrl(`loc=${loc}`, s);
    if (s.state !== canonicalJson({ loc })) failures.push(`loc=${loc}: trạng thái khác tham số của link`);
    const chip = Number(await page.locator(`[data-loc-chip="${loc}"]`).first().getAttribute("data-count"));
    if (canonicalJson(s.rows.map((r) => r.key)) !== canonicalJson(expected)) failures.push(`loc=${loc}: khối hiện khác các khối có dòng ${loc}`);
    if (s.rows.some((r) => !r.open)) failures.push(`loc=${loc}: có khối khớp nhưng không mở`);
    if (s.lines.some((l) => l !== loc)) failures.push(`loc=${loc}: có dòng dự toán khác tình trạng đang lọc`);
    if (s.lines.length !== s.visibleLines || s.visibleLines !== chip) failures.push(`loc=${loc}: số dòng hiện khác số đếm "hiện n" / số trên chip`);
    notes.push(`loc=${loc}: ${s.rows.length} khối, ${s.visibleLines}/${s.totalLines} dòng${expected.length === 0 ? " (công trình không có dòng vượt)" : ""}`);
  }

  async function backRestores() {
    await landDtHd(page, url());
    const loc = (
      await page.evaluate((locs) => locs.find((l) => Number(document.querySelector(`[data-loc-chip="${l}"]`)?.getAttribute("data-count") ?? "0") > 0), [...DT_HD_LOCS])
    ) ?? null;
    if (!loc) {
      failures.push("Back: không có chip tình trạng nào có dòng để đổi bộ lọc");
      return;
    }
    let before = page.url();
    await page.locator(`[data-loc-chip="${loc}"] button`).click();
    await page.waitForFunction((b) => location.href !== b, before, { timeout: PAGE_TIMEOUT_MS });
    before = page.url();
    await page.locator("[data-dt-hd-summary-row] button").first().click();
    await page.waitForFunction((b) => location.href !== b, before, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    const changedSearch = liveSearch(page);
    const changed = await readDtHd(page);
    sameAsUrl("Back (sau khi đổi)", changed);
    if (!/[?&]mo=/.test(changedSearch) || !/[?&]loc=/.test(changedSearch)) failures.push("Back: bấm chip / khối không ghi loc và mo lên URL");

    // Sang Ánh xạ bằng link Phần B (mở mọi <details> của Phần B cho link bấm được); không có thì qua mục con.
    await page.evaluate(() => document.querySelectorAll("[data-dt-hd-part-b] details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
    const partB = page.locator("[data-part-b-link]").first();
    if ((await partB.count()) > 0) {
      const key = parseAnhXaQuery(new URL((await partB.getAttribute("href")) ?? "", session.baseUrl).search).key;
      await partB.click();
      await waitForHook(page, "anh-xa");
      await page.waitForTimeout(SETTLE_MS);
      if ((await readHook(page, "anh-xa")).openKey !== key) failures.push("Phần B: link Gán ở Ánh xạ không mở đúng khóa của dòng");
      notes.push("Back: rời trang bằng link Phần B");
    } else {
      await page.locator('[data-nav-row="dt-hd-tt"] a[href$="/dt-hd-tt/hoa-don"]').first().click();
      await waitForHook(page, "hoa-don");
      notes.push("Back: không có dòng chưa gán — rời trang bằng mục Hóa đơn");
    }
    await page.goBack({ waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
    await waitForDtHd(page);
    await page.waitForTimeout(SETTLE_MS);
    const after = await readDtHd(page);
    if (liveSearch(page) !== changedSearch) failures.push("Back: không về đúng URL đã đổi");
    sameAsUrl("Back", after);
    if (after.state !== changed.state || canonicalJson(after.open) !== canonicalJson(changed.open)) failures.push("Back: trạng thái khác trạng thái vừa đổi");
  }

  async function sizeAndTime() {
    const dir = argValue(argv, "--against") ?? DEFAULT_BASELINE;
    const baseline = readBaseline(dir);
    if (!baseline) {
      failures.push(`chưa có baseline dt-hd ở ${dir} (thiếu manifest.json hoặc timings.json)`);
      return;
    }
    if (baseline.projectId !== projectId) {
      failures.push(`cỡ / thời gian: baseline chụp công trình ${baseline.projectId}, không phải ${projectId}`);
      return;
    }
    const now = await measureServer(session.context, url());
    const ratio = now.documentBytes / baseline.dtHd.documentBytes;
    const limit = baseline.dtHd.medianMs + TIME_BUDGET_MS;
    notes.push(`cỡ tài liệu ${now.documentBytes} B = ${ratio.toFixed(2)} × baseline; thời gian server ${now.medianMs} ms (baseline ${baseline.dtHd.medianMs} ms, ngưỡng ${limit} ms)`);
    if (!(ratio <= MAX_SIZE_RATIO)) failures.push(`cỡ tài liệu ${ratio.toFixed(2)} × baseline > ${MAX_SIZE_RATIO}`);
    if (now.medianMs > limit) failures.push(`thời gian server ${now.medianMs} ms vượt ngưỡng ${limit} ms`);
  }

  /** Chạy một bước, ghi lỗi (kể cả hook thiếu) và kết luận của bước; trả kết quả hoặc null khi bước ném lỗi. */
  async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    const before = failures.length;
    let result: T | null = null;
    try {
      result = await fn();
    } catch (err) {
      failures.push(err instanceof MissingHookError ? `${name}: ${err.message}` : `${name}: lỗi khi đo — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }
    notes.push(`${name}: ${failures.length === before ? "đạt" : `${failures.length - before} lỗi`}`);
    return result;
  }

  try {
    const base = await step("trang trần", collapsed);
    if (base) {
      await step("mo + reload", () => openSurvivesReload(base));
      await step("loc=vuot", () => locFilters(base));
    } else {
      failures.push("mo / loc: bỏ qua vì không đọc được trang trần");
    }
    await step("Back", backRestores);
    await step("cỡ + thời gian", sizeAndTime);
  } finally {
    await page.close();
  }
  return { failures, notes };
};
