// Runs the app on port 3001 by default — ports 3000/8080 are taken by Docker.
// An explicit PORT still wins (e2e sets PORT=3333), so this only fills the gap.
import { spawn } from "node:child_process";

process.env.PORT ??= "3001";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("serve.mjs: no command given");
  process.exit(1);
}

const child = spawn(cmd, args, { stdio: "inherit", shell: true, env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
