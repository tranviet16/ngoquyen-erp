/**
 * Lệnh đo `dashboard` (tiêu chí 9), CHỈ ĐỌC:
 *   - công trình `--project` (dùng sổ): Dashboard có đúng một thẻ sổ (`data-book-card`) nhãn
 *     "Thực tế (sổ DT-HĐ-TT)" và không còn thẻ "Thực tế (đã nhập)"; BẤM thẻ thì mở Tổng quan; số của thẻ
 *     (`data-value` và số hiện trên thẻ) bằng số "gxd-actual" của Tổng quan; sắc thái danger đúng khi chênh
 *     "gxd-diff" của Tổng quan < 0, và khi Tổng quan có việc "thực tế nhập chưa gắn đầu mối" / "đầu mối chưa
 *     chốt" thì thẻ không được success và dòng phụ phải nói "chưa đủ";
 *   - công trình đối chứng `--control <id>` (mặc định: đối chứng của baseline, không có thì 1): còn thẻ
 *     "Thực tế (đã nhập)", không có thẻ sổ, và chữ mọi thẻ bằng bản chụp phase 1;
 *   - thời gian server Dashboard của `--project` (trung vị, cùng cách đo với baseline) ≤ baseline + 300 ms.
 * Baseline: `--against <thư mục>` (mặc định test-results/dt-hd-tt-baseline/main). Thiếu hook hoặc baseline → lỗi.
 * Thông báo chỉ in nhãn, sắc thái, thời gian và kết luận — không in số liệu.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { GuardError } from "../dt-hd-tt-baseline/guards";
import type { MeasureCommand } from "../dt-hd-tt-baseline/measure-types";
import { captureDashboardCards, measureServer, type Timing } from "../dt-hd-tt-baseline/page-capture";
import { MissingHookError, PAGE_TIMEOUT_MS, SETTLE_MS } from "../dt-hd-tt-baseline/screen-state-hooks";
import { BOOK_ACTUAL_LABEL, tongQuanPath } from "../../lib/du-an/dt-hd-tt/overview";
import type { TodoId } from "../../lib/du-an/dt-hd-tt/overview-todos";

const OLD_LABEL = "Thực tế (đã nhập)";
const DEFAULT_BASELINE = join("test-results", "dt-hd-tt-baseline", "main");
/** Ngưỡng thời gian server của Dashboard so với baseline (cùng ngưỡng với các màn báo cáo). */
const TIME_BUDGET_MS = 300;
/** Việc của Tổng quan cho biết thực tế của sổ chưa đủ — cùng định nghĩa với `bookActualCard`. */
const INCOMPLETE_TODOS: readonly string[] = ["tt-chua-gan-dau-moi", "dau-moi-chua-chot"] satisfies TodoId[];
const TONES = ["danger", "warning", "success"];

interface Baseline {
  dir: string;
  projectId: number;
  controlId: number;
  dashboardMs: number;
}

const argValue = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

/** Số hiện trên thẻ, bỏ dấu nghìn và ký hiệu tiền: "-1.234 ₫" → "-1234". */
const shownNumber = (s: string | null): string | null => (s === null ? null : s.replace(/[−–]/g, "-").replace(/[^\d-]/g, ""));

function readBaseline(dir: string): Baseline | null {
  const manifestPath = join(dir, "manifest.json");
  const timingsPath = join(dir, "timings.json");
  if (!existsSync(manifestPath) || !existsSync(timingsPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { projectId: number; controlId: number };
  const timings = JSON.parse(readFileSync(timingsPath, "utf8")) as Record<string, Timing>;
  return { dir, projectId: manifest.projectId, controlId: manifest.controlId, dashboardMs: timings.dashboard?.medianMs ?? NaN };
}

/** Mở Dashboard và chờ các thẻ (`p.uppercase` của StatCard, như bản chụp baseline). */
async function openDashboard(page: Page, baseUrl: string, projectId: number): Promise<void> {
  const path = `/du-an/${projectId}`;
  await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
  try {
    await page.locator("p.uppercase").first().waitFor({ timeout: PAGE_TIMEOUT_MS });
  } catch {
    throw new MissingHookError(`không có thẻ số nào ở ${path}`);
  }
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Nhãn mọi thẻ của trang và các thẻ sổ (`data-book-card`): nhãn, số hiện (phần tử ngay sau nhãn trong
 * StatCard), toàn bộ chữ và các hook.
 */
async function readDashboard(page: Page) {
  return page.evaluate(() => {
    return {
      labels: [...document.querySelectorAll("p.uppercase")].map((p) => p.textContent?.trim() ?? ""),
      bookCards: [...document.querySelectorAll<HTMLElement>("[data-book-card]")].map((el) => ({
        label: el.querySelector("p.uppercase")?.textContent?.trim() ?? null,
        shown: el.querySelector("p.uppercase")?.nextElementSibling?.textContent?.trim() ?? null,
        text: el.innerText,
        dataValue: el.getAttribute("data-value"),
        tone: el.getAttribute("data-tone"),
        href: el.closest("a")?.getAttribute("href") ?? el.querySelector("a")?.getAttribute("href") ?? null,
      })),
    };
  });
}

export const run: MeasureCommand = async ({ session, projectId, argv }) => {
  const failures: string[] = [];
  const notes: string[] = [];

  const baselineDir = argValue(argv, "--against") ?? DEFAULT_BASELINE;
  const baseline = readBaseline(baselineDir);
  if (!baseline) failures.push(`chưa có baseline ở ${baselineDir} (thiếu manifest.json hoặc timings.json)`);
  const controlArg = argValue(argv, "--control");
  const controlId = controlArg === undefined ? (baseline?.controlId ?? 1) : Number(controlArg);
  if (!Number.isInteger(controlId) || controlId <= 0) throw new GuardError("Sai --control");
  if (controlId === projectId) throw new GuardError("--control phải là công trình khác --project");

  const page = await session.context.newPage();
  try {
    // 1. Công trình dùng sổ: thẻ sổ, link Tổng quan, số và sắc thái.
    try {
      await openDashboard(page, session.baseUrl, projectId);
      const dash = await readDashboard(page);
      const where = `Dashboard ${projectId}`;
      if (dash.labels.includes(OLD_LABEL)) failures.push(`${where}: còn thẻ "${OLD_LABEL}"`);
      if (dash.bookCards.length !== 1) {
        failures.push(`${where}: cần đúng một thẻ sổ (data-book-card), có ${dash.bookCards.length}`);
      } else {
        const card = dash.bookCards[0];
        if (card.label !== BOOK_ACTUAL_LABEL) failures.push(`${where}: thẻ sổ không mang nhãn "${BOOK_ACTUAL_LABEL}"`);
        if (card.dataValue === null || !/^-?\d+$/.test(card.dataValue)) failures.push(`${where}: thẻ sổ thiếu data-value số đồng`);
        if (!TONES.includes(card.tone ?? "")) failures.push(`${where}: thẻ sổ thiếu data-tone`);
        const tongQuan = tongQuanPath(projectId);
        if (card.href === null || new URL(card.href, session.baseUrl).pathname !== tongQuan) failures.push(`${where}: thẻ sổ không link tới Tổng quan`);

        // Bấm thẻ như người dùng: phải mở Tổng quan, rồi so với số của Tổng quan.
        await page.locator("[data-book-card]").first().click({ timeout: PAGE_TIMEOUT_MS });
        await page.waitForURL((u) => u.pathname === tongQuan, { timeout: PAGE_TIMEOUT_MS });
        try {
          await page.locator("[data-tong-quan]").first().waitFor({ state: "attached", timeout: PAGE_TIMEOUT_MS });
        } catch {
          throw new MissingHookError(`bấm thẻ sổ không mở Tổng quan (data-tong-quan) ở ${tongQuan}`);
        }
        await page.waitForTimeout(SETTLE_MS);
        const tq = await page.evaluate(() => {
          const figure = (id: string) => {
            const el = document.querySelector<HTMLElement>(`[data-tong-quan] [data-figure="${id}"]`);
            const label = el?.querySelector("p.uppercase");
            return el ? { dataValue: el.getAttribute("data-value"), shown: label?.nextElementSibling?.textContent?.trim() ?? null } : null;
          };
          return {
            actual: figure("gxd-actual"),
            diff: figure("gxd-diff"),
            todos: [...document.querySelectorAll<HTMLElement>("[data-tong-quan] [data-todo]")].map((el) => el.dataset.todo ?? ""),
          };
        });
        if (!tq.actual || !tq.diff) {
          failures.push(`Tổng quan ${projectId}: thiếu hook data-figure gxd-actual / gxd-diff`);
        } else {
          if (card.dataValue !== tq.actual.dataValue) failures.push(`${where}: data-value của thẻ sổ khác số gxd-actual của Tổng quan`);
          if (shownNumber(card.shown) === null || shownNumber(card.shown) !== shownNumber(tq.actual.shown)) {
            failures.push(`${where}: số hiện trên thẻ sổ khác số hiện ở Tổng quan`);
          }
          // data-value là chênh đã làm tròn đồng (trống khi thực tế null) — cùng phép so của `bookActualCard`.
          const negative = Number(tq.diff.dataValue ?? "") < 0;
          if ((card.tone === "danger") !== negative) failures.push(`${where}: sắc thái ${card.tone} không khớp dấu chênh của Tổng quan`);
          const incompleteTodos = tq.todos.filter((t) => INCOMPLETE_TODOS.includes(t));
          if (incompleteTodos.length > 0) {
            if (card.tone === "success") failures.push(`${where}: Tổng quan có việc ${incompleteTodos.join(", ")} mà thẻ sổ vẫn success`);
            if (!card.text.includes("chưa đủ")) failures.push(`${where}: Tổng quan có việc ${incompleteTodos.join(", ")} mà dòng phụ không nói "chưa đủ"`);
          } else if (card.tone === "warning") {
            notes.push(`${where}: warning mà Tổng quan không có việc thực tế chưa gắn / chưa chốt (Phần II A và B trống?)`);
          }
          notes.push(`${where}: thẻ sổ ${card.tone}, bằng số Tổng quan, việc làm thiếu thực tế: ${incompleteTodos.join(", ") || "không"}`);
        }
      }
    } catch (err) {
      failures.push(err instanceof MissingHookError ? err.message : `Dashboard ${projectId}: lỗi khi đo — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }

    // 2. Công trình đối chứng (không dùng sổ): thẻ cũ, không thẻ sổ, chữ bằng bản chụp phase 1.
    try {
      const where = `Dashboard ${controlId} (đối chứng)`;
      await openDashboard(page, session.baseUrl, controlId);
      const dash = await readDashboard(page);
      if (!dash.labels.includes(OLD_LABEL)) failures.push(`${where}: thiếu thẻ "${OLD_LABEL}"`);
      if (dash.bookCards.length > 0 || dash.labels.includes(BOOK_ACTUAL_LABEL)) failures.push(`${where}: có thẻ sổ`);
      if (baseline) {
        const capturedPath = join(baseline.dir, "dashboard", `${controlId}.json`);
        if (!existsSync(capturedPath)) {
          failures.push(`${where}: baseline không có bản chụp của công trình này (đối chứng của baseline là ${baseline.controlId})`);
        } else {
          const before = JSON.parse(readFileSync(capturedPath, "utf8")) as Record<string, string>;
          const now = await captureDashboardCards(session.context, session.baseUrl, controlId);
          const changed = [...new Set([...Object.keys(before), ...Object.keys(now)])].filter((label) => before[label] !== now[label]);
          for (const label of changed) failures.push(`${where}: thẻ "${label}" khác bản chụp phase 1`);
          if (changed.length === 0) notes.push(`${where}: ${Object.keys(now).length} thẻ giống bản chụp phase 1`);
        }
      }
    } catch (err) {
      failures.push(err instanceof MissingHookError ? err.message : `Dashboard ${controlId}: lỗi khi đo — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }

    // 3. Thời gian server Dashboard của công trình dùng sổ so với baseline.
    if (baseline) {
      if (baseline.projectId !== projectId) {
        failures.push(`thời gian: baseline chụp công trình ${baseline.projectId}, không phải ${projectId}`);
      } else if (!Number.isFinite(baseline.dashboardMs)) {
        failures.push("thời gian: baseline thiếu số đo Dashboard");
      } else {
        const { medianMs } = await measureServer(session.context, `${session.baseUrl}/du-an/${projectId}`);
        const limit = baseline.dashboardMs + TIME_BUDGET_MS;
        notes.push(`thời gian server Dashboard ${projectId}: ${medianMs} ms (baseline ${baseline.dashboardMs} ms, ngưỡng ${limit} ms)`);
        if (medianMs > limit) failures.push(`thời gian server Dashboard ${projectId} ${medianMs} ms vượt ngưỡng ${limit} ms`);
      }
    }
  } finally {
    await page.close();
  }
  return { failures, notes };
};
