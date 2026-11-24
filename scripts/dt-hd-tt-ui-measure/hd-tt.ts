/**
 * Lệnh đo `hd-tt` (tiêu chí 5), CHỈ ĐỌC — không gõ, không lưu gì — trên công trình `--project`, ở 1440 × 900:
 *   1. HĐ-TT trang trần: trạng thái = URL; đủ 13 đầu cột tiền (`data-money-col`); bản in (`data-print-view`) là con
 *      cuối của trang, ngay sau màn hình (`data-report-screen`);
 *   2. tên NCC (`data-ncc-name`) tối đa 2 dòng, tên đủ nằm trong `title`;
 *   3. cuộn hộp bảng (`data-hd-tt-box`) cả dọc lẫn ngang: đầu bảng giữ mép trên, cột NCC giữ mép trái, dòng tổng giữ
 *      mép dưới của hộp, trong khi ô thường dịch theo; hộp không cuộn được theo chiều nào → lỗi (không kiểm suông);
 *   4. theo tài khoản `--as`: `read` → không có nút nhập và không có ô nhập; tài khoản khác (admin hôm nay, `edit`
 *      sau này) → có nút "Nhập H / S / X / Z", bấm thì có > 0 ô nhập, đúng 4 ô ở mỗi dòng có dòng NCC và 0 ô ở dòng
 *      không có; bấm lại để tắt — không ô nào được gõ;
 *   5. DT-TT: thanh nhảy dính, ba neo `phan-i/ii/iii`, mỗi dòng Phần II một neo `dm-`, bản in là con cuối.
 * Thiếu hook → lỗi (script thoát khác 0). Thông báo chỉ in số đếm, cỡ điểm ảnh và kết luận — không in số liệu hay tên.
 */

import type { Page } from "playwright";
import type { MeasureCommand } from "../dt-hd-tt-baseline/measure-types";
import { hdTtStateOfUrl, landHdTt, readDtTt, readHdTt, waitForDtTt } from "../dt-hd-tt-baseline/hd-tt-screen-hooks";
import { MissingHookError, PAGE_TIMEOUT_MS, SETTLE_MS } from "../dt-hd-tt-baseline/screen-state-hooks";
import { DT_TT_ANCHORS, screenPath } from "../../lib/du-an/dt-hd-tt/screen-links";

const VIEWPORT = { width: 1440, height: 900 };
const MONEY_COLUMNS = 13;
const MAX_NAME_LINES = 2;
/** Sai số vị trí (px) cho phần tử dính sau khi cuộn. */
const TOLERANCE = 1.5;

const argValue = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

/** Thứ tự trang: bản in là con cuối, màn hình đứng ngay trước. */
async function readLayout(page: Page) {
  return page.evaluate(() => {
    const print = document.querySelector<HTMLElement>("[data-print-view]");
    return {
      hasPrint: print !== null,
      printLast: print !== null && print.parentElement?.lastElementChild === print,
      screenBefore: print?.previousElementSibling?.hasAttribute("data-report-screen") ?? false,
    };
  });
}

export const run: MeasureCommand = async ({ session, projectId, argv }) => {
  const failures: string[] = [];
  const notes: string[] = [];
  const account = argValue(argv, "--as") ?? "admin";
  const page = await session.context.newPage();
  await page.setViewportSize(VIEWPORT);
  const url = (target: "hd-tt" | "dt-tt") => `${session.baseUrl}${screenPath(projectId, target)}`;

  function layoutFailures(where: string, layout: Awaited<ReturnType<typeof readLayout>>) {
    if (!layout.hasPrint) throw new MissingHookError(`${where}: thiếu phần tử data-print-view (bản in)`);
    if (!layout.printLast) failures.push(`${where}: bản in (data-print-view) không phải con cuối của trang`);
    if (!layout.screenBefore) failures.push(`${where}: màn hình (data-report-screen) không đứng ngay trước bản in`);
  }

  async function columnsAndLayout() {
    const s = await landHdTt(page, url("hd-tt"));
    if (s.state !== hdTtStateOfUrl(page) || s.state !== "{}") failures.push("trang trần: data-hd-tt-state khác URL trần");
    if (!(s.totalRows >= 1)) failures.push("trang trần: HĐ-TT không có dòng nào");
    if (s.domRows !== s.visibleRows || s.visibleRows !== s.totalRows) failures.push("trang trần: số dòng trong bảng khác số dòng của báo cáo");
    const headers = await page.locator("[data-hd-tt-head] [data-money-col]").count();
    if (headers !== MONEY_COLUMNS) failures.push(`có ${headers} đầu cột tiền, cần ${MONEY_COLUMNS}`);
    layoutFailures("HĐ-TT", await readLayout(page));
    notes.push(`HĐ-TT: ${s.totalRows} dòng, ${headers} đầu cột tiền`);
  }

  async function nameLines() {
    const names = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-hd-tt-box] [data-ncc-name]")].map((el) => {
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
        return {
          lines: Math.round(el.getBoundingClientRect().height / lineHeight),
          lineHeight,
          clamped: el.scrollHeight > el.clientHeight + 1,
          titled: el.getAttribute("title") === (el.textContent ?? ""),
        };
      }),
    );
    if (names.length === 0) throw new MissingHookError("không có tên NCC nào (data-ncc-name)");
    if (names.some((n) => !Number.isFinite(n.lineHeight))) failures.push("tên NCC: không đọc được line-height");
    const tall = names.filter((n) => n.lines > MAX_NAME_LINES).length;
    if (tall > 0) failures.push(`${tall} tên NCC cao hơn ${MAX_NAME_LINES} dòng`);
    if (names.some((n) => !n.titled)) failures.push("tên NCC: title không phải tên đủ");
    notes.push(`tên NCC: ${names.length} tên, cao nhất ${Math.max(...names.map((n) => n.lines))} dòng, ${names.filter((n) => n.clamped).length} tên bị cắt (tên đủ trong title)`);
  }

  async function stickyAxes() {
    // Một lần evaluate: đo, cuộn hộp, đo lại (getBoundingClientRect ép bố cục ngay), trả hộp về vị trí cũ.
    const m = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>("[data-hd-tt-box]");
      const head = box?.querySelector<HTMLElement>("thead");
      const foot = box?.querySelector<HTMLElement>("tfoot");
      const money = box?.querySelector<HTMLElement>("[data-money-col]");
      const firstRow = box?.querySelector<HTMLElement>("[data-hd-tt-row]");
      if (!box || !head || !foot || !money || !firstRow) return null;
      const boxRect = box.getBoundingClientRect();
      const before = { head: head.getBoundingClientRect(), foot: foot.getBoundingClientRect(), money: money.getBoundingClientRect(), row: firstRow.getBoundingClientRect() };
      const dy = Math.min(300, box.scrollHeight - box.clientHeight);
      const dx = Math.min(600, box.scrollWidth - box.clientWidth);
      box.scrollTop = dy;
      box.scrollLeft = dx;
      const after = { head: head.getBoundingClientRect(), foot: foot.getBoundingClientRect(), money: money.getBoundingClientRect(), row: firstRow.getBoundingClientRect() };
      // Ô NCC của một dòng còn nằm giữa đầu bảng và dòng tổng sau khi cuộn.
      const visible = [...box.querySelectorAll<HTMLElement>("[data-hd-tt-row]")].find((tr) => {
        const r = tr.getBoundingClientRect();
        return r.top >= after.head.bottom && r.bottom <= after.foot.top;
      });
      const nccLeft = visible?.querySelector<HTMLElement>("[data-ncc-cell]")?.getBoundingClientRect().left ?? null;
      box.scrollTop = 0;
      box.scrollLeft = 0;
      return {
        dy, dx,
        contentTop: boxRect.top + box.clientTop, contentLeft: boxRect.left + box.clientLeft,
        headTop: [before.head.top, after.head.top], footBottom: [before.foot.bottom, after.foot.bottom],
        moneyTop: [before.money.top, after.money.top], moneyLeft: [before.money.left, after.money.left],
        rowTop: [before.row.top, after.row.top], nccLeft,
      };
    });
    if (!m) throw new MissingHookError("thiếu hộp data-hd-tt-box hoặc thead / tfoot / data-money-col / data-hd-tt-row trong hộp");
    if (!(m.dy > 0)) failures.push("hộp bảng không cuộn dọc được — không kiểm được đầu bảng và dòng tổng dính");
    if (!(m.dx > 0)) failures.push("hộp bảng không cuộn ngang được — không kiểm được cột NCC dính");
    const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;
    if (m.dy > 0) {
      // Dòng thường dịch đúng dy (cuộn có thật), còn đầu bảng và dòng tổng đứng yên.
      if (!near(m.rowTop[0] - m.dy, m.rowTop[1])) failures.push("dòng thường không dịch theo khi cuộn dọc — phép đo không hợp lệ");
      if (!near(m.headTop[0], m.contentTop) || !near(m.headTop[1], m.contentTop)) failures.push("đầu bảng không giữ mép trên của hộp khi cuộn dọc");
      if (!near(m.moneyTop[0], m.moneyTop[1])) failures.push("đầu cột tiền trôi theo khi cuộn dọc");
      if (!near(m.footBottom[0], m.footBottom[1])) failures.push("dòng tổng không giữ mép dưới khi cuộn dọc");
    }
    if (m.dx > 0) {
      if (!near(m.moneyLeft[0] - m.dx, m.moneyLeft[1])) failures.push("đầu cột tiền không dịch theo khi cuộn ngang — phép đo không hợp lệ");
      if (m.nccLeft === null) failures.push("không tìm được dòng nào nằm trong hộp sau khi cuộn để đo cột NCC");
      else if (!near(m.nccLeft, m.contentLeft)) failures.push("cột NCC không giữ mép trái của hộp khi cuộn ngang");
    }
    notes.push(`hộp bảng: cuộn ${Math.round(m.dy)} px dọc, ${Math.round(m.dx)} px ngang`);
  }

  async function editByAccount() {
    const s = await readHdTt(page);
    const toggle = page.locator("[data-hd-tt-screen] [data-hd-tt-edit-toggle]");
    const inputs = page.locator("[data-hd-tt-screen] input[data-edit-cell]");
    if (account === "read") {
      if (s.canEdit) failures.push("--as read: data-can-edit = true");
      if ((await toggle.count()) !== 0) failures.push("--as read: có nút nhập H / S / X / Z");
      if ((await inputs.count()) !== 0) failures.push("--as read: có ô nhập");
      notes.push("--as read: không có nút nhập, không có ô nhập");
      return;
    }
    if (!s.canEdit) failures.push(`--as ${account}: data-can-edit = false`);
    if ((await toggle.count()) !== 1) {
      failures.push(`--as ${account}: không có nút "Nhập H / S / X / Z"`);
      return;
    }
    if ((await inputs.count()) !== 0) failures.push(`--as ${account}: có ô nhập trước khi bật chế độ nhập`);
    await toggle.click({ timeout: PAGE_TIMEOUT_MS });
    await page.locator('[data-hd-tt-screen][data-editing="true"]').first().waitFor({ state: "attached", timeout: PAGE_TIMEOUT_MS });
    const perRow = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-hd-tt-screen] [data-hd-tt-row]")].map((tr) => ({
        linked: (tr.dataset.linkId ?? "") !== "",
        inputs: tr.querySelectorAll("input[data-edit-cell]").length,
      })),
    );
    const total = perRow.reduce((n, r) => n + r.inputs, 0);
    if (!(total > 0)) failures.push(`--as ${account}: bật chế độ nhập mà không có ô nhập nào`);
    if (perRow.some((r) => r.linked && r.inputs !== 4)) failures.push(`--as ${account}: có dòng có dòng NCC mà không đủ 4 ô nhập`);
    if (perRow.some((r) => !r.linked && r.inputs !== 0)) failures.push(`--as ${account}: có ô nhập ở dòng chưa có dòng NCC`);
    if ((await page.locator("[data-hd-tt-head] [data-money-col]").count()) !== MONEY_COLUMNS) failures.push(`--as ${account}: chế độ nhập làm mất đầu cột tiền`);
    await toggle.click({ timeout: PAGE_TIMEOUT_MS });
    await page.locator('[data-hd-tt-screen][data-editing="false"]').first().waitFor({ state: "attached", timeout: PAGE_TIMEOUT_MS });
    notes.push(`--as ${account}: có nút nhập, bật lên có ${total} ô nhập ở ${perRow.filter((r) => r.linked).length} dòng có dòng NCC (không gõ ô nào)`);
  }

  async function dtTt() {
    await page.goto(url("dt-tt"), { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
    await waitForDtTt(page);
    await page.waitForTimeout(SETTLE_MS);
    const s = await readDtTt(page);
    if (!s.jumpSticky) failures.push("DT-TT: thanh nhảy không dính");
    const parts = Object.values(DT_TT_ANCHORS);
    if (parts.some((a) => !s.jumpTargets.includes(a))) failures.push("DT-TT: thanh nhảy thiếu link tới Phần I / II / III");
    if (parts.some((a) => !s.anchors.includes(a))) failures.push("DT-TT: thiếu neo Phần I / II / III");
    if (s.counterpartyAnchors !== s.phanIIRows) failures.push(`DT-TT: ${s.counterpartyAnchors} neo dm- cho ${s.phanIIRows} dòng Phần II`);
    layoutFailures("DT-TT", await readLayout(page));
    notes.push(`DT-TT: thanh nhảy ${s.jumpTargets.length} link, ${s.counterpartyAnchors} neo đầu mối`);
  }

  /** Chạy một bước, ghi lỗi (kể cả hook thiếu) và kết luận của bước. */
  async function step(name: string, fn: () => Promise<void>): Promise<boolean> {
    const before = failures.length;
    let ok = true;
    try {
      await fn();
    } catch (err) {
      ok = false;
      failures.push(err instanceof MissingHookError ? `${name}: ${err.message}` : `${name}: lỗi khi đo — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }
    notes.push(`${name}: ${failures.length === before ? "đạt" : `${failures.length - before} lỗi`}`);
    return ok;
  }

  try {
    if (await step("cột + bố cục", columnsAndLayout)) {
      await step("tên NCC ≤ 2 dòng", nameLines);
      await step("trục dính", stickyAxes);
      await step(`quyền (${account})`, editByAccount);
    } else {
      failures.push("tên / trục dính / quyền: bỏ qua vì không mở được HĐ-TT");
    }
    await step("DT-TT", dtTt);
  } finally {
    await page.close();
  }
  return { failures, notes };
};
