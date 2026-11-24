/**
 * Đo giao diện mới của module Dự án trên server đang chạy (chỉ loopback, phiên đã lưu ở phase 1).
 *
 *   npx tsx scripts/dt-hd-tt-ui-measure.ts <lệnh|all> --base-url http://127.0.0.1:3003 --project 4 [--as admin]
 *
 * `<lệnh>` chạy scripts/dt-hd-tt-ui-measure/<lệnh>.ts; `all` chạy mọi file trong thư mục đó. Lệnh không
 * tồn tại thì thoát khác 0. Mã thoát: 0 đạt; 1 có lỗi đo; 4 lỗi dùng / chốt an toàn.
 */

import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openSession } from "./dt-hd-tt-browser-session";
import { GuardError } from "./dt-hd-tt-baseline/guards";
import type { MeasureCommand, MeasureResult } from "./dt-hd-tt-baseline/measure-types";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const COMMAND_DIR = join(dirname(resolve(process.argv[1])), "dt-hd-tt-ui-measure");
const NAME_PATTERN = /^[a-z0-9-]+$/;

function commandNames(requested: string): string[] {
  const available = existsSync(COMMAND_DIR) ? readdirSync(COMMAND_DIR).filter((f) => f.endsWith(".ts")).map((f) => basename(f, ".ts")).sort() : [];
  if (requested === "all") return available;
  if (!NAME_PATTERN.test(requested) || !available.includes(requested)) {
    throw new GuardError(`Không có lệnh đo "${requested}". Có: ${available.join(", ") || "(chưa có)"}.`);
  }
  return [requested];
}

async function main() {
  const requested = args[0];
  if (!requested || requested.startsWith("--")) throw new GuardError("Dùng: <lệnh|all> --base-url http://127.0.0.1:<cổng> --project <id>");
  const names = commandNames(requested);
  const projectId = Number(value("--project"));
  if (!Number.isInteger(projectId) || projectId <= 0) throw new GuardError("Thiếu hoặc sai --project");

  const session = await openSession(value("--base-url"), value("--as") ?? "admin");
  let failed = false;
  try {
    for (const name of names) {
      const mod = (await import(pathToFileURL(join(COMMAND_DIR, `${name}.ts`)).href)) as { run?: MeasureCommand; default?: { run?: MeasureCommand } };
      const run = mod.run ?? mod.default?.run;
      if (!run) throw new GuardError(`Lệnh đo "${name}" không xuất hàm run`);
      const result: MeasureResult = await run({ session, projectId, argv: args });
      for (const note of result.notes) console.log(`  [${name}] ${note}`);
      for (const failure of result.failures) console.error(`  [${name}] LỖI: ${failure}`);
      console.log(`${name}: ${result.failures.length === 0 ? "ĐẠT" : `KHÔNG ĐẠT (${result.failures.length} lỗi)`}`);
      failed ||= result.failures.length > 0;
    }
  } finally {
    await session.close();
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof GuardError ? `Dừng: ${err.message}` : err);
  process.exit(4);
});
