/**
 * Lệnh đo `todos` (tiêu chí 2 và 3, phần Tổng quan), CHỈ ĐỌC, trên công trình `--project`:
 *   - /du-an/{id}/dt-hd-tt mở Tổng quan (`data-tong-quan`) và mục "Tổng quan" của thanh mục con đang mở;
 *     không có Tổng quan → lỗi;
 *   - đủ chín thẻ số `data-figure` có `data-value` (số nguyên đồng; chỉ ô chênh được trống) — thiếu → lỗi;
 *   - mỗi việc `data-todo` có đúng một link, `data-todo-count` (nếu có) là số dương;
 *   - BẤM từng link của Tổng quan (số, đầu mối, việc, kiểm tổng, Mở báo cáo; bỏ Xuất Excel), mỗi href một
 *     lần: đích đã sẵn sàng → trạng thái `data-*` của màn = tham số của link và ≥ 1 dòng; đích chưa sẵn
 *     sàng → link và trang mở ra đều là trang trần (tong-quan-landing.ts);
 *   - việc / số có bộ lọc mà đích đã sẵn sàng lại mở trang không lọc → lỗi; ngoại lệ duy nhất là Cài đặt.
 * Mọi giá trị đọc từ trang; thông báo chỉ in mã số / mã việc / đích / kết luận, không in số liệu hay tên.
 */

import type { MeasureCommand } from "../dt-hd-tt-baseline/measure-types";
import { MissingHookError, PAGE_TIMEOUT_MS, SETTLE_MS } from "../dt-hd-tt-baseline/screen-state-hooks";
import { checkLanding, isFiltered, parseLink, type ParsedLink } from "../dt-hd-tt-baseline/tong-quan-landing";
import { FIGURE_IDS, type FigureId } from "../../lib/du-an/dt-hd-tt/overview";
import { screenPath } from "../../lib/du-an/dt-hd-tt/screen-links";

/** Số mang neo / bộ lọc (Phần III, Σ U, Σ Y); các số còn lại mở trang báo cáo trần theo thiết kế. */
const FILTERED_FIGURES: readonly string[] = ["gxd-estimate", "gxd-actual", "gxd-diff", "sigma-u", "sigma-y"] satisfies FigureId[];
/** Ô chênh trống khi thực tế null — số duy nhất được phép không có giá trị. */
const MAY_BE_EMPTY: readonly string[] = ["gxd-diff"] satisfies FigureId[];

interface FoundLink {
  href: string;
  /** "số" / "việc" / khối của trang (data-section). */
  kind: string;
  id: string;
}

export const run: MeasureCommand = async ({ session, projectId }) => {
  const failures: string[] = [];
  const notes: string[] = [];
  const page = await session.context.newPage();
  const overviewPath = `/du-an/${projectId}/dt-hd-tt`;

  async function openOverview(): Promise<void> {
    await page.goto(`${session.baseUrl}${overviewPath}`, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
    try {
      await page.locator("[data-tong-quan]").first().waitFor({ state: "attached", timeout: PAGE_TIMEOUT_MS });
    } catch {
      throw new MissingHookError(`không có Tổng quan (data-tong-quan) ở ${overviewPath}`);
    }
    await page.waitForTimeout(SETTLE_MS);
    // Mở mọi <details> (xem thêm đầu mối, kiểm tổng) để link bên trong bấm được.
    await page.evaluate(() => document.querySelectorAll("[data-tong-quan] details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
  }

  /** Hook của chính trang Tổng quan: mục con đang mở, chín số, việc cần làm. Trả về các link để bấm. */
  async function readOverview(): Promise<FoundLink[]> {
    await openOverview();
    const s = await page.evaluate(() => {
      const root = document.querySelector("[data-tong-quan]")!;
      const current = document.querySelector<HTMLAnchorElement>('[data-nav-row="dt-hd-tt"] a[aria-current="page"]');
      return {
        currentNav: current ? new URL(current.href).pathname : null,
        figures: [...root.querySelectorAll<HTMLElement>("[data-figure]")].map((el) => ({ id: el.dataset.figure ?? "", value: el.getAttribute("data-value") })),
        todos: [...root.querySelectorAll<HTMLElement>("[data-todo]")].map((el) => ({
          id: el.dataset.todo ?? "", count: el.getAttribute("data-todo-count"), links: el.querySelectorAll("a[href]").length,
        })),
        links: [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => ({
          href: a.getAttribute("href") ?? "",
          figure: a.getAttribute("data-figure"),
          todo: a.closest<HTMLElement>("[data-todo]")?.dataset.todo ?? null,
          section: a.closest<HTMLElement>("[data-section]")?.dataset.section ?? "khac",
        })),
      };
    });

    if (s.currentNav !== overviewPath) failures.push("thanh mục con: mục Tổng quan không phải mục đang mở");
    for (const id of FIGURE_IDS) {
      const found = s.figures.filter((f) => f.id === id);
      if (found.length !== 1) failures.push(`số ${id}: thiếu hook data-figure (hoặc lặp ${found.length} lần)`);
      else if (found[0].value === null) failures.push(`số ${id}: thiếu data-value`);
      else if (!/^-?\d+$/.test(found[0].value) && !(found[0].value === "" && MAY_BE_EMPTY.includes(id))) failures.push(`số ${id}: data-value không phải số đồng`);
    }
    for (const t of s.todos) {
      if (t.links !== 1) failures.push(`việc ${t.id}: cần đúng một link, có ${t.links}`);
      if (t.count !== null && !/^[1-9]\d*$/.test(t.count)) failures.push(`việc ${t.id}: data-todo-count không phải số dương`);
    }
    notes.push(`Tổng quan: ${s.figures.length} số, ${s.todos.length} việc cần làm, ${s.links.length} link`);
    return s.links.map((l) => ({
      href: l.href,
      kind: l.figure ? "số" : l.todo ? "việc" : l.section,
      id: l.figure ?? l.todo ?? l.section,
    }));
  }

  /** Bấm link từ Tổng quan (như người dùng) rồi kiểm trang mở ra. */
  async function clickAndCheck(link: FoundLink, parsed: ParsedLink, where: string): Promise<void> {
    await openOverview();
    const anchor = page.locator(`[data-tong-quan] a[href="${link.href}"]`).first();
    await anchor.click({ timeout: PAGE_TIMEOUT_MS });
    const path = screenPath(projectId, parsed.target);
    await page.waitForURL((u) => u.pathname === path, { timeout: PAGE_TIMEOUT_MS });
    failures.push(...(await checkLanding(page, parsed, where)));
  }

  try {
    const links = await readOverview();
    const seen = new Set<string>();
    let clicked = 0;
    let skipped = 0;
    for (const link of links) {
      const parsed = parseLink(projectId, link.href);
      if (!parsed) {
        skipped++; // Xuất Excel (tải file) và link ngoài các màn của công trình
        continue;
      }
      const where = `${link.kind} ${link.id} → ${parsed.target}`;
      const state = parsed.ready ? (isFiltered(parsed) ? "lọc" : "trang trần") : "trang trần, đích chưa sẵn sàng";
      if (link.kind === "số" || link.kind === "việc") notes.push(`${where}: ${state}`);
      if (parsed.ready && !isFiltered(parsed)) {
        if (link.kind === "việc" && parsed.target !== "cai-dat") failures.push(`${where}: đích đã sẵn sàng nhưng link không lọc`);
        if (link.kind === "số" && FILTERED_FIGURES.includes(link.id)) failures.push(`${where}: đích đã sẵn sàng nhưng link không mang neo / bộ lọc`);
      }
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      try {
        await clickAndCheck(link, parsed, where);
        clicked++;
      } catch (err) {
        failures.push(err instanceof MissingHookError ? `${where}: ${err.message}` : `${where}: lỗi khi bấm / đo — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    notes.push(`đã bấm ${clicked} link khác nhau, bỏ qua ${skipped} link không phải màn công trình (Xuất Excel)`);
  } catch (err) {
    failures.push(err instanceof MissingHookError ? err.message : `lỗi khi đo — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  } finally {
    await page.close();
  }
  return { failures, notes };
};
