/**
 * Chụp những gì người dùng nhận được từ ba báo cáo DT-HĐ-TT và Dashboard: text bản in, số trang PDF A4
 * ngang, ảnh bản in, nội dung file Excel, thẻ Dashboard, cỡ tài liệu và thời gian server.
 *
 * Bản in đi đúng đường thật: bấm nút "In" (đặt class print-export-active và @page) với window.print đã
 * được thay bằng hàm rỗng, rồi giả lập media print. Không tự gắn class bằng tay.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext } from "playwright";
import * as XLSX from "xlsx";

export const REPORTS = ["dt-hd", "dt-tt", "hd-tt"] as const;
export type ReportSlug = (typeof REPORTS)[number];

const WARM_REQUESTS = 5;
/** Trang DT-HĐ thật có ~780 dòng; app giữ kết nối mở nên không bao giờ "networkidle" — chờ "load" + phần tử. */
const PAGE_TIMEOUT_MS = 90_000;
const PRINT_CLICK_ATTEMPTS = 15;
const PRINT_CLICK_WAIT_MS = 2_000;

export interface Timing {
  /** Trung vị thời gian server (ms) của 5 lần gọi sau một lần làm nóng bỏ đi. */
  medianMs: number;
  /** Cỡ tài liệu HTML đã giải nén (byte), lấy từ lần gọi cuối. */
  documentBytes: number;
}

/** Build id Next 16 nhúng trong flight payload (trường `b`) khi không cấu hình deployment id. */
export function readBuildId(html: string): string | null {
  const escaped = html.match(/\\"b\\":\\"([A-Za-z0-9_-]+)\\"/);
  if (escaped) return escaped[1];
  const plain = html.match(/"b":"([A-Za-z0-9_-]+)"/);
  return plain ? plain[1] : null;
}

/** Trung vị thời gian phản hồi và cỡ HTML của một trang, đo bằng request có cùng cookie phiên. */
export async function measureServer(context: BrowserContext, url: string): Promise<Timing & { html: string }> {
  await context.request.get(url); // làm nóng, bỏ kết quả
  const samples: number[] = [];
  let html = "";
  for (let i = 0; i < WARM_REQUESTS; i++) {
    const started = performance.now();
    const res = await context.request.get(url);
    html = await res.text();
    samples.push(performance.now() - started);
    if (!res.ok()) throw new Error(`${url} trả ${res.status()}`);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: Math.round(samples[Math.floor(samples.length / 2)]), documentBytes: Buffer.byteLength(html, "utf8"), html };
}

/** Số trang của một PDF: đếm đối tượng /Type /Page (không tính /Pages). */
export function countPdfPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

export interface PrintCapture {
  text: string;
  pdfPages: number;
}

/** Mở báo cáo, bấm "In" thật, giả lập media print; lưu text, số trang PDF và ảnh bản in vào outDir. */
export async function capturePrint(context: BrowserContext, baseUrl: string, projectId: number, report: ReportSlug, outDir: string): Promise<PrintCapture> {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/du-an/${projectId}/dt-hd-tt/${report}`, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
    const printButton = page.getByRole("button", { name: "In", exact: true });
    await printButton.waitFor({ timeout: PAGE_TIMEOUT_MS });
    await page.evaluate(() => {
      window.print = () => undefined;
    });
    // Trang nặng (màn hình DT-HĐ nạp cả báo cáo) có thể chưa hydrate xong khi nút đã hiện: bấm lúc đó không
    // có tác dụng. Bấm lại tới khi nút thật sự bật chế độ in, vẫn là đúng đường người dùng đi.
    let printing = false;
    for (let attempt = 0; attempt < PRINT_CLICK_ATTEMPTS && !printing; attempt++) {
      await printButton.click();
      printing = await page
        .waitForFunction(() => document.body.classList.contains("print-export-active"), undefined, { timeout: PRINT_CLICK_WAIT_MS })
        .then(() => true, () => false);
    }
    if (!printing) throw new Error(`${report}: bấm "In" ${PRINT_CLICK_ATTEMPTS} lần mà chế độ in không bật`);
    await page.emulateMedia({ media: "print" });
    const text = await page.evaluate(() => document.body.innerText);
    mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: join(outDir, "print.png"), fullPage: true });
    const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
    return { text, pdfPages: countPdfPages(pdf) };
  } finally {
    await page.close();
  }
}

export interface ExcelCapture {
  rows: unknown[][];
  merges: unknown;
  cols: unknown;
}

/** Tải file Excel của báo cáo; bỏ dòng "xuất ngày" (đổi theo ngày chạy). */
export async function captureExcel(context: BrowserContext, baseUrl: string, projectId: number, report: ReportSlug): Promise<ExcelCapture> {
  const res = await context.request.get(`${baseUrl}/api/du-an/${projectId}/dt-hd-tt/export?report=${report}`);
  if (!res.ok()) throw new Error(`Xuất Excel ${report} trả ${res.status()}`);
  const wb = XLSX.read(await res.body(), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]).filter(
    (r) => !r.some((c) => typeof c === "string" && c.includes("xuất ngày")),
  );
  return { rows, merges: ws["!merges"] ?? null, cols: ws["!cols"] ?? null };
}

/** Thẻ số của Dashboard dự án, theo nhãn. Khối cảnh báo hợp đồng không phải thẻ nên không bị lấy. */
export async function captureDashboardCards(context: BrowserContext, baseUrl: string, projectId: number): Promise<Record<string, string>> {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/du-an/${projectId}`, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });
    await page.locator("p.uppercase").first().waitFor({ timeout: PAGE_TIMEOUT_MS });
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll("p.uppercase")].map((p) => [p.textContent?.trim() ?? "", (p.parentElement as HTMLElement | null)?.innerText.trim() ?? ""]),
    );
    return Object.fromEntries(cards.sort(([a], [b]) => a.localeCompare(b)));
  } finally {
    await page.close();
  }
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}
