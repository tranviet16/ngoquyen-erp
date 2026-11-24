/**
 * Baseline bản in / Excel / Dashboard của tab "Đối chiếu DT-HĐ-TT" và phép so với nhánh đang làm.
 *
 *   capture   --base-url http://127.0.0.1:3002 --checkout ..\nq-baseline --project 4 --control <id> --out <dir>
 *   capture   --recheck --base-url http://127.0.0.1:3002 --out <dir>
 *   compare   --base-url http://127.0.0.1:3003 --against <dir> [--checkout .] [--expect-changed-card "<nhãn>"]...
 *
 * Chạy bằng `npx tsx --env-file=.env.local ...` (đọc DATABASE_URL của CSDL bản sao, cổng 5433).
 * Mã thoát: 0 đạt; 1 có khác biệt chặn; 2 "cùng bản build"; 3 "dữ liệu đã đổi"; 4 lỗi dùng / chốt an toàn.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openSession } from "./dt-hd-tt-browser-session";
import { captureAll, diffCaptures, timingReport } from "./dt-hd-tt-baseline/capture-and-diff";
import { computeFingerprint, openCopyDb, type Fingerprint } from "./dt-hd-tt-baseline/fingerprint";
import { GuardError, requireLoopbackBaseUrl } from "./dt-hd-tt-baseline/guards";
import { measureServer, readBuildId, writeJson } from "./dt-hd-tt-baseline/page-capture";

const EXPECTED_PROJECT_CODE = "MNTC-GD1";

interface Manifest {
  schema: 1;
  sha: string;
  buildId: string;
  buildIdMethod: "html" | "checkout";
  projectId: number;
  controlId: number;
  capturedAt: string;
  fingerprint: Fingerprint;
}

class ExitError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
  }
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const values = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
function intArg(name: string): number {
  const n = Number(value(name));
  if (!Number.isInteger(n) || n <= 0) throw new GuardError(`Thiếu hoặc sai ${name}`);
  return n;
}

/** Build id của server: đọc trong HTML; nếu có checkout thì đối chiếu với .next/BUILD_ID của nó. */
async function serverBuildId(html: string, checkout: string | undefined): Promise<{ id: string; method: Manifest["buildIdMethod"] }> {
  const fromHtml = readBuildId(html);
  const buildIdFile = checkout ? join(resolve(checkout), ".next", "BUILD_ID") : undefined;
  const fromCheckout = buildIdFile && existsSync(buildIdFile) ? readFileSync(buildIdFile, "utf8").trim() : null;
  if (fromHtml && fromCheckout && fromHtml !== fromCheckout) {
    throw new GuardError("Build id trong HTML khác .next/BUILD_ID của checkout — server chưa khởi động lại sau khi build?");
  }
  const id = fromHtml ?? fromCheckout;
  if (!id) throw new GuardError("Không đọc được build id (HTML không có, cũng không có --checkout).");
  return { id, method: fromHtml ? "html" : "checkout" };
}

async function fingerprintOf(projectId: number, controlId: number): Promise<Fingerprint> {
  const { db, close } = openCopyDb();
  try {
    return await computeFingerprint(db, projectId, controlId);
  } finally {
    await close();
  }
}

async function capture(): Promise<void> {
  requireLoopbackBaseUrl(value("--base-url"));
  const out = value("--out");
  if (!out) throw new GuardError("Thiếu --out");
  const recheck = flag("--recheck");
  const previous = recheck ? readManifest(out) : null;
  const projectId = previous?.projectId ?? intArg("--project");
  const controlId = previous?.controlId ?? intArg("--control");
  const fingerprint = await fingerprintOf(projectId, controlId);
  if (fingerprint.projectCode !== EXPECTED_PROJECT_CODE) throw new GuardError(`Công trình ${projectId} không phải ${EXPECTED_PROJECT_CODE} — dừng.`);

  const session = await openSession(value("--base-url"), "admin");
  try {
    const target = recheck ? `${out}-recheck` : out;
    const { buildId: htmlId } = await captureAll(session, projectId, controlId, target);
    const probe = await measureServer(session.context, `${session.baseUrl}/du-an/${projectId}/dt-hd-tt/dt-hd`);
    const build = await serverBuildId(probe.html, value("--checkout"));
    if (htmlId && htmlId !== build.id) throw new GuardError("Build id đổi giữa lúc chụp — server bị khởi động lại?");
    if (previous) {
      if (build.id !== previous.buildId) throw new ExitError("recheck: không phải cùng server / bản build với baseline", 1);
      if (fingerprint.project !== previous.fingerprint.project || fingerprint.control !== previous.fingerprint.control) throw new ExitError("recheck: dữ liệu đã đổi", 3);
      const { fatal } = diffCaptures(out, target, { projectId, controlId, expectChangedCards: [] });
      if (fatal.length) throw new ExitError(`recheck không ổn định:\n  ${fatal.join("\n  ")}`, 1);
      console.log("recheck: ổn định — hai lần chụp liên tiếp giống nhau.");
      return;
    }
    const checkout = value("--checkout");
    if (!checkout) throw new GuardError("capture cần --checkout <thư mục worktree origin/main> để ghi SHA");
    const sha = execFileSync("git", ["-C", resolve(checkout), "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const manifest: Manifest = { schema: 1, sha, buildId: build.id, buildIdMethod: build.method, projectId, controlId, capturedAt: new Date().toISOString(), fingerprint };
    writeJson(join(out, "manifest.json"), manifest);
    console.log(`Đã chụp baseline: SHA ${sha.slice(0, 12)}, build ${build.id}, công trình ${projectId}, đối chứng ${controlId}.`);
  } finally {
    await session.close();
  }
}

function readManifest(dir: string): Manifest {
  const path = join(dir, "manifest.json");
  if (!existsSync(path)) throw new GuardError(`Chưa có baseline ở ${dir} (thiếu manifest.json) — chạy capture trước.`);
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

async function compare(): Promise<void> {
  requireLoopbackBaseUrl(value("--base-url")); // chốt đầu tiên: chỉ server trên máy này, không phải 3001
  const against = value("--against");
  if (!against) throw new GuardError("Thiếu --against <thư mục baseline>");
  const manifest = readManifest(against);
  const session = await openSession(value("--base-url"), "admin");
  try {
    const probe = await measureServer(session.context, `${session.baseUrl}/du-an/${manifest.projectId}/dt-hd-tt/dt-hd`);
    const build = await serverBuildId(probe.html, value("--checkout"));
    if (build.id === manifest.buildId) throw new ExitError("cùng bản build — server đang chạy chính bản baseline, không so được nhánh", 2);
    const fingerprint = await fingerprintOf(manifest.projectId, manifest.controlId);
    if (fingerprint.project !== manifest.fingerprint.project || fingerprint.control !== manifest.fingerprint.control) {
      throw new ExitError("dữ liệu đã đổi — chụp lại baseline từ SHA trong manifest rồi so lại; không kết luận về code", 3);
    }
    const target = join("test-results", "dt-hd-tt-baseline", "runs", new Date().toISOString().replace(/[:.]/g, "-"));
    await captureAll(session, manifest.projectId, manifest.controlId, target);
    const { fatal, notes } = diffCaptures(against, target, { projectId: manifest.projectId, controlId: manifest.controlId, expectChangedCards: values("--expect-changed-card") });
    for (const line of [...timingReport(against, target), ...notes]) console.log(`  ${line}`);
    if (fatal.length) throw new ExitError(`Khác baseline:\n  ${fatal.join("\n  ")}`, 1);
    console.log(`Đạt: bản in, số trang PDF, Excel và Dashboard giống baseline (build ${build.id}, bản chụp ở ${target}).`);
  } finally {
    await session.close();
  }
}

async function main() {
  const command = args[0];
  if (command === "capture") return capture();
  if (command === "compare") return compare();
  throw new GuardError("Dùng: capture | capture --recheck | compare (xem đầu file)");
}

main().catch((err) => {
  if (err instanceof ExitError) {
    console.error(err.message);
    process.exit(err.code);
  }
  console.error(err instanceof GuardError ? `Dừng: ${err.message}` : err);
  process.exit(4);
});
