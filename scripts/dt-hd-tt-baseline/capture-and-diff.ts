/**
 * Chụp trọn một bộ (3 báo cáo × bản in + Excel, Dashboard của công trình đo và công trình đối chứng, thời
 * gian server) vào một thư mục, và so hai bộ đã chụp. Khác biệt về text bản in, số trang PDF, Excel và
 * thẻ Dashboard là lỗi chặn; khác biệt ảnh chỉ được báo, không chặn.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Session } from "../dt-hd-tt-browser-session";
import {
  REPORTS, captureDashboardCards, captureExcel, capturePrint, measureServer, readBuildId, writeJson, type Timing,
} from "./page-capture";

export interface CaptureResult {
  buildId: string | null;
  timings: Record<string, Timing>;
}

export async function captureAll(session: Session, projectId: number, controlId: number, outDir: string): Promise<CaptureResult> {
  const { context, baseUrl } = session;
  const timings: Record<string, Timing> = {};
  let buildId: string | null = null;
  for (const report of REPORTS) {
    const dir = join(outDir, report);
    mkdirSync(dir, { recursive: true });
    const server = await measureServer(context, `${baseUrl}/du-an/${projectId}/dt-hd-tt/${report}`);
    buildId ??= readBuildId(server.html);
    timings[report] = { medianMs: server.medianMs, documentBytes: server.documentBytes };
    const print = await capturePrint(context, baseUrl, projectId, report, dir);
    writeFileSync(join(dir, "print.txt"), print.text, "utf8");
    writeJson(join(dir, "print.json"), { pdfPages: print.pdfPages });
    writeJson(join(dir, "excel.json"), await captureExcel(context, baseUrl, projectId, report));
  }
  const dashDir = join(outDir, "dashboard");
  mkdirSync(dashDir, { recursive: true });
  const dash = await measureServer(context, `${baseUrl}/du-an/${projectId}`);
  timings.dashboard = { medianMs: dash.medianMs, documentBytes: dash.documentBytes };
  for (const id of [projectId, controlId]) {
    writeJson(join(dashDir, `${id}.json`), await captureDashboardCards(context, baseUrl, id));
  }
  writeJson(join(outDir, "timings.json"), timings);
  return { buildId, timings };
}

const readText = (path: string) => readFileSync(path, "utf8");
const readJson = (path: string): unknown => JSON.parse(readText(path));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Dòng đầu tiên khác nhau giữa hai đoạn text, để thông báo chỉ thẳng chỗ lệch. */
function firstDiffLine(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `dòng ${i + 1}`;
  }
  return "độ dài";
}

export interface DiffOptions {
  projectId: number;
  controlId: number;
  /**
   * Thẻ Dashboard của công trình đo được phép đổi có chủ đích: "nhãn" (đổi giá trị) hoặc "nhãn cũ=>nhãn mới"
   * (đổi cả nhãn). Thẻ mới phải có mặt; mọi thẻ khác vẫn phải giống hệt.
   */
  expectChangedCards: string[];
}

export interface DiffResult {
  fatal: string[];
  notes: string[];
}

export function diffCaptures(baseDir: string, targetDir: string, opts: DiffOptions): DiffResult {
  const fatal: string[] = [];
  const notes: string[] = [];
  for (const report of REPORTS) {
    const a = join(baseDir, report);
    const b = join(targetDir, report);
    const textA = readText(join(a, "print.txt"));
    const textB = readText(join(b, "print.txt"));
    if (textA !== textB) fatal.push(`${report}: text bản in khác (${firstDiffLine(textA, textB)})`);
    if (!same(readJson(join(a, "print.json")), readJson(join(b, "print.json")))) fatal.push(`${report}: số trang PDF khác`);
    if (!same(readJson(join(a, "excel.json")), readJson(join(b, "excel.json")))) fatal.push(`${report}: nội dung Excel khác`);
    const shotA = join(a, "print.png");
    const shotB = join(b, "print.png");
    if (existsSync(shotA) && existsSync(shotB) && !readFileSync(shotA).equals(readFileSync(shotB))) notes.push(`${report}: ảnh bản in khác (không chặn)`);
  }
  for (const id of [opts.projectId, opts.controlId]) {
    const cardsA = readJson(join(baseDir, "dashboard", `${id}.json`)) as Record<string, string>;
    const cardsB = readJson(join(targetDir, "dashboard", `${id}.json`)) as Record<string, string>;
    const swaps = (id === opts.projectId ? opts.expectChangedCards : []).map((spec) => {
      const [from, to = from] = spec.split("=>").map((s) => s.trim());
      return { from, to };
    });
    const exempt = new Set(swaps.flatMap((s) => [s.from, s.to]));
    for (const { from, to } of swaps) {
      if (!(to in cardsB)) fatal.push(`Dashboard ${id}: thẻ "${to}" được phép đổi nhưng không có`);
      else notes.push(`Dashboard ${id}: thẻ "${from}" → "${to}" đổi như dự kiến`);
    }
    for (const label of new Set([...Object.keys(cardsA), ...Object.keys(cardsB)])) {
      if (!exempt.has(label) && cardsA[label] !== cardsB[label]) fatal.push(`Dashboard ${id}: thẻ "${label}" khác`);
    }
  }
  return { fatal, notes };
}

/** So thời gian và cỡ tài liệu với baseline: in ra để phase quyết định theo ngưỡng của nó. */
export function timingReport(baseDir: string, targetDir: string): string[] {
  const a = readJson(join(baseDir, "timings.json")) as Record<string, Timing>;
  const b = readJson(join(targetDir, "timings.json")) as Record<string, Timing>;
  return Object.keys(a).map((k) => {
    const ratio = b[k] ? (b[k].documentBytes / a[k].documentBytes).toFixed(2) : "?";
    const delta = b[k] ? b[k].medianMs - a[k].medianMs : NaN;
    return `${k}: server ${a[k].medianMs} → ${b[k]?.medianMs ?? "?"} ms (${delta >= 0 ? "+" : ""}${delta} ms), cỡ tài liệu ×${ratio}`;
  });
}
