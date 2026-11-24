// Chạy server standalone của một checkout đã build, chỉ trên loopback, trỏ vào CSDL bản sao dev (cổng 5434,
// container `ngoquyen-dev-pg`), cho phép so baseline / đo UI của tab "Đối chiếu DT-HĐ-TT". Từ 11/2026 VIETPC chạy
// production: CSDL 5433 và app 3001 là production, script này từ chối cả hai.
//
//   node scripts/serve-local-build.mjs --port 3002 --checkout ..\nq-baseline --env-file <app.env> --env-file <host.env>
//   node scripts/serve-local-build.mjs --port 3003 --env-file <app.env> --env-file <host.env>
//
// Vì sao cần:
// - `next build` chỉ chép .env / .env.production vào output standalone, nên server không tự đọc file env nào khác;
// - Better Auth chỉ tin origin nằm trong BETTER_AUTH_URL;
// - server mặc định nghe 0.0.0.0;
// - .env.local của bản chính trỏ CSDL dev, không phải CSDL bản sao.
// Script nạp các file --env-file theo thứ tự (file sau ghi đè file trước; mặc định <checkout>/.env.local), từ chối
// chạy nếu DATABASE_URL không phải CSDL bản sao dev trên loopback cổng 5434, ép HOSTNAME=127.0.0.1, đặt PORT và
// BETTER_AUTH_URL theo cổng, từ chối cổng 3001 (app production), rồi chạy server.js của checkout.
// Không in giá trị biến môi trường. Chạy `npm run build` và `node scripts/post-build.mjs` trong checkout trước.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function args(name) {
  return process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []));
}

function stop(message) {
  console.error(`Dừng: ${message}`);
  process.exit(4);
}

const port = Number(arg("--port"));
if (!Number.isInteger(port) || port < 1024 || port > 65535) stop("Thiếu hoặc sai --port.");
if (port === 3001) stop("Cổng 3001 là app production trên VIETPC — dùng 3002 (baseline) hoặc 3003 (nhánh).");

const checkout = resolve(arg("--checkout") ?? process.cwd());
const serverFile = join(checkout, ".next", "standalone", "server.js");
if (!existsSync(serverFile)) stop(`Checkout ${checkout} chưa build (thiếu server standalone) — chạy npm run build và post-build.`);

const envFiles = args("--env-file");
for (const file of envFiles.length ? envFiles : [join(checkout, ".env.local")]) {
  if (!existsSync(file)) stop(`Không thấy file env ${file}.`);
  Object.assign(process.env, parseEnv(readFileSync(file, "utf8")));
}

let db;
try {
  db = new URL(process.env.DATABASE_URL ?? "");
} catch {
  stop("DATABASE_URL thiếu hoặc không đọc được.");
}
if (db.port === "5433") stop("DATABASE_URL trỏ CSDL production (cổng 5433) — dùng file env của bản sao dev (cổng 5434).");
if (!["127.0.0.1", "localhost"].includes(db.hostname) || db.port !== "5434") {
  stop("DATABASE_URL không phải CSDL bản sao dev trên 127.0.0.1:5434 — truyền file env của bản dev bằng --env-file.");
}

process.env.HOSTNAME = "127.0.0.1";
process.env.PORT = String(port);
process.env.BETTER_AUTH_URL = `http://127.0.0.1:${port}`;
console.log(`[serve-local-build] ${checkout} → http://127.0.0.1:${port} (CSDL bản sao dev, cổng 5434)`);

await import(pathToFileURL(serverFile).href);
