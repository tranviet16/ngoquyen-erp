// Copy static assets + public/ into the standalone output tree.
// Required because `output: "standalone"` does not include them automatically.
// See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
import { cpSync, existsSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) {
  cpSync("public", ".next/standalone/public", { recursive: true });
}
console.log("[post-build] static + public copied into .next/standalone/");
