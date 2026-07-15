import { readFile, readdir } from "fs/promises";
import { join, relative, sep } from "path";
import { RISK_MANIFEST } from "../test/risk-manifest";
import { REQUIRED_P0_TESTS } from "../test/risk-manifest-types";

const root = process.cwd();
const apiRoot = join(root, "app", "api");

async function discoverRoutes(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) routes.push(...await discoverRoutes(absolutePath));
    if (entry.isFile() && entry.name === "route.ts") {
      routes.push(relative(root, absolutePath).split(sep).join("/"));
    }
  }
  return routes.sort();
}

async function discoverServerActions(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const actions: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) actions.push(...await discoverServerActions(absolutePath));
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      const source = await readFile(absolutePath, "utf8");
      if (/^\s*["']use server["'];?/m.test(source)) actions.push(relative(root, absolutePath).split(sep).join("/"));
    }
  }
  return actions.sort();
}

async function main(): Promise<void> {
  const routes = await discoverRoutes(apiRoot);
  const actions = await discoverServerActions(join(root, "app"));
  const apiManifestPaths = new Set(RISK_MANIFEST.filter((record) => record.kind === "api-route").map((record) => record.path));
  const actionManifestPaths = new Set(RISK_MANIFEST.filter((record) => record.kind === "server-action").map((record) => record.path));
  const errors = [
    ...routes.filter((route) => !apiManifestPaths.has(route)).map((route) => `unclassified API route: ${route}`),
    ...actions.filter((action) => !actionManifestPaths.has(action)).map((action) => `unclassified server action: ${action}`),
    ...RISK_MANIFEST.filter((record) => record.kind === "api-route" && !routes.includes(record.path)).map((record) => `stale API route: ${record.path}`),
    ...RISK_MANIFEST.filter((record) => record.kind === "server-action" && !actions.includes(record.path)).map((record) => `stale server action: ${record.path}`),
  ];

  for (const record of RISK_MANIFEST.filter((item) => item.tier === "P0")) {
    if (record.authorization.status !== "defined") errors.push(`P0 authorization policy pending: ${record.id}`);
    for (const test of REQUIRED_P0_TESTS) {
      if (!record.requiredTests.includes(test)) errors.push(`P0 test contract missing ${test}: ${record.id}`);
    }
  }

  if (errors.length > 0) {
    console.error("Risk manifest validation failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Risk manifest covers ${routes.length} API routes and ${actions.length} server-action files.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
