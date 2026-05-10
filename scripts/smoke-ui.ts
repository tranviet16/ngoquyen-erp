/**
 * Playwright UI smoke for /van-hanh/cong-viec + /thong-bao.
 *
 * Logs in via better-auth /sign-in/email POST then drives Chromium to render
 * the kanban + notification pages, captures screenshots + console errors.
 *
 * Run: npx tsx --env-file=.env scripts/smoke-ui.ts
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const EMAIL = "smoke-aleader@nq.local";
const PASSWORD = "changeme123";
const SHOTS = "scripts/.smoke-shots";

if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`=== UI smoke @ ${BASE} ===`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });

  // Sign in via API (better-auth)
  const signInRes = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: EMAIL, password: PASSWORD },
    headers: { "Content-Type": "application/json" },
  });
  check(`sign-in 200`, signInRes.ok(), `status=${signInRes.status()}`);
  if (!signInRes.ok()) {
    console.log("    body:", (await signInRes.text()).slice(0, 200));
    await browser.close();
    process.exit(1);
  }

  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  // /van-hanh/cong-viec
  const r1 = await page.goto(`${BASE}/van-hanh/cong-viec`, { waitUntil: "networkidle", timeout: 30000 });
  check(`/van-hanh/cong-viec status`, r1?.ok() ?? false, `status=${r1?.status()}`);
  await page.screenshot({ path: `${SHOTS}/cong-viec.png`, fullPage: true });
  // Verify kanban columns rendered
  const colsCount = await page.locator("text=/Cần làm|Đang làm|Chờ duyệt|Hoàn thành/").count();
  check(`/van-hanh/cong-viec renders ≥4 column headers`, colsCount >= 4, `found ${colsCount}`);

  // /thong-bao
  const r2 = await page.goto(`${BASE}/thong-bao`, { waitUntil: "networkidle", timeout: 30000 });
  check(`/thong-bao status`, r2?.ok() ?? false, `status=${r2?.status()}`);
  await page.screenshot({ path: `${SHOTS}/thong-bao.png`, fullPage: true });
  const heading = await page.locator("h1:has-text('Thông báo')").count();
  check(`/thong-bao heading`, heading > 0);

  // Bell visible on topbar
  const bell = await page.locator('button[aria-label="Thông báo"]').count();
  check(`notification bell present in topbar`, bell > 0);

  check(`zero console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  console.log(`Screenshots: ${SHOTS}/`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
