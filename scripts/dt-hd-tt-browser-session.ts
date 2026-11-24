/**
 * Phiên đăng nhập cho các script baseline / đo của tab "Đối chiếu DT-HĐ-TT".
 *
 * Không script nào biết mật khẩu: `sign-in` mở trình duyệt có giao diện, người dùng tự đăng nhập, script
 * chỉ lưu Playwright storageState vào test-results/ (đã gitignore). Các script khác mở phiên từ file đó
 * qua `openSession` và lưu lại sau mỗi lần chạy để phiên 7 ngày không hết hạn giữa các phase.
 *
 *   npx tsx scripts/dt-hd-tt-browser-session.ts sign-in --base-url http://127.0.0.1:3002 --as admin
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { GuardError, requireLoopbackBaseUrl } from "./dt-hd-tt-baseline/guards";

const AUTH_DIR = join("test-results", "dt-hd-tt-baseline", "auth");
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
const ACCOUNT_PATTERN = /^[a-z0-9-]{1,32}$/;

export const VIEWPORT = { width: 1440, height: 900 };

export function authStatePath(account: string): string {
  if (!ACCOUNT_PATTERN.test(account)) throw new GuardError(`Tên tài khoản phiên không hợp lệ: ${account}`);
  return join(AUTH_DIR, `${account}.json`);
}

export interface Session {
  browser: Browser;
  context: BrowserContext;
  baseUrl: string;
  /** Lưu lại storageState (gia hạn phiên) rồi đóng trình duyệt. */
  close: () => Promise<void>;
}

/** Mở phiên headless từ storageState đã lưu. Trang bị đẩy về /login nghĩa là phiên hết hạn. */
export async function openSession(rawBaseUrl: string | undefined, account: string): Promise<Session> {
  const baseUrl = requireLoopbackBaseUrl(rawBaseUrl);
  const statePath = authStatePath(account);
  if (!existsSync(statePath)) throw new GuardError(`Chưa có phiên "${account}". Chạy: npx tsx scripts/dt-hd-tt-browser-session.ts sign-in --base-url ${baseUrl} --as ${account}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: statePath, viewport: VIEWPORT });
  const probe = await context.newPage();
  await probe.goto(`${baseUrl}/du-an`, { waitUntil: "domcontentloaded" });
  const expired = new URL(probe.url()).pathname.startsWith("/login");
  await probe.close();
  if (expired) {
    await browser.close();
    throw new GuardError(`Phiên "${account}" đã hết hạn. Chạy lại sign-in.`);
  }
  return {
    browser, context, baseUrl,
    close: async () => {
      await context.storageState({ path: statePath });
      await browser.close();
    },
  };
}

/** Mở trình duyệt có giao diện ở trang đăng nhập; chờ người dùng đăng nhập xong rồi lưu storageState. */
async function signIn(rawBaseUrl: string | undefined, account: string): Promise<void> {
  const baseUrl = requireLoopbackBaseUrl(rawBaseUrl);
  const statePath = authStatePath(account);
  mkdirSync(dirname(statePath), { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  console.log(`Đăng nhập tài khoản "${account}" trong cửa sổ trình duyệt vừa mở (tối đa 5 phút)...`);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: SIGN_IN_TIMEOUT_MS });
  await context.storageState({ path: statePath });
  await browser.close();
  console.log(`Đã lưu phiên vào ${statePath} (không lưu mật khẩu).`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  if (command !== "sign-in") throw new GuardError("Dùng: sign-in --base-url http://127.0.0.1:<cổng> --as <tài khoản>");
  await signIn(arg("--base-url"), arg("--as") ?? "admin");
}

// Chạy như CLI khi được gọi trực tiếp; khi được import (openSession) thì không làm gì.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/dt-hd-tt-browser-session.ts")) {
  main().catch((err) => {
    console.error(err instanceof GuardError ? `Dừng: ${err.message}` : err);
    process.exit(1);
  });
}
