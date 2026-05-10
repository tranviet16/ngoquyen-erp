/**
 * audit-route-guards.ts
 *
 * Walks app/(app)/** recursively. A route segment is considered PROTECTED if:
 *   - Its own layout.tsx contains requireModuleAccess( or requireRole(, OR
 *   - Any ancestor layout.tsx in app/(app)/ contains either guard call.
 *
 * Individual page.tsx files are NOT expected to have guards — guards live in
 * layout.tsx files (Next.js App Router convention). Page files are reported
 * as protected if their nearest layout ancestor is guarded.
 *
 * Outputs a markdown table to stdout and saves to:
 *   plans/260510-van-hanh-acl-refactor/reports/route-guard-audit.md
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/audit-route-guards.ts
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, relative, dirname, sep } from "path";

const APP_APP_ROOT = join(process.cwd(), "app", "(app)");
const REPORT_DIR = join(
  process.cwd(),
  "plans",
  "260510-van-hanh-acl-refactor",
  "reports",
);
const REPORT_PATH = join(REPORT_DIR, "route-guard-audit.md");

// Internal/demo segments to skip entirely
const SKIP_DIRS = new Set(["__demo"]);

// Guard patterns
const GUARD_RE = /requireModuleAccess\(|requireRole\(/;

interface LayoutInfo {
  absPath: string;
  hasGuard: boolean;
  guardType: "requireModuleAccess" | "requireRole" | "none";
}

interface RouteFile {
  /** Relative path from app/(app)/ */
  relPath: string;
  /** Absolute path */
  absPath: string;
  fileType: "layout" | "page";
  ownGuard: boolean;
  ownGuardType: "requireModuleAccess" | "requireRole" | "none";
  /** Protected by own or ancestor layout guard */
  effectivelyProtected: boolean;
  /** Which layout provides the guard (rel path) */
  guardProvidedBy: string | null;
}

async function collectLayouts(dir: string): Promise<Map<string, LayoutInfo>> {
  const map = new Map<string, LayoutInfo>();

  async function walk(d: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(d, { withFileTypes: true, encoding: "utf-8" }) as import("fs").Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      const name = e.name as string;
      const full = join(d, name);
      const seg = name.replace(/^\(.*\)$/, "").replace(/^\[.*\]$/, "[param]");
      if (e.isDirectory() && SKIP_DIRS.has(seg)) continue;
      if (e.isDirectory()) { await walk(full); continue; }
      if (e.isFile() && name === "layout.tsx") {
        const content = await readFile(full, "utf-8");
        const hasModuleAccess = /requireModuleAccess\(/.test(content);
        const hasRequireRole = /requireRole\(/.test(content);
        const hasGuard = hasModuleAccess || hasRequireRole;
        map.set(full, {
          absPath: full,
          hasGuard,
          guardType: hasModuleAccess
            ? "requireModuleAccess"
            : hasRequireRole
            ? "requireRole"
            : "none",
        } as LayoutInfo);
      }
    }
  }

  await walk(dir);
  return map;
}

/**
 * Walks up from fileDir to APP_APP_ROOT looking for a layout with a guard.
 * Returns the first ancestor layout path that has a guard, or null.
 */
function findAncestorGuard(
  fileDir: string,
  layouts: Map<string, LayoutInfo>,
): LayoutInfo | null {
  let cur = fileDir;
  while (true) {
    const candidatePath = join(cur, "layout.tsx");
    const info = layouts.get(candidatePath);
    if (info?.hasGuard) return info;

    // Stop at app/(app)/ parent
    if (cur === APP_APP_ROOT || cur === dirname(APP_APP_ROOT)) break;
    const parent = dirname(cur);
    if (parent === cur) break; // filesystem root
    cur = parent;
  }
  return null;
}

async function collectAllRouteFiles(
  dir: string,
  layouts: Map<string, LayoutInfo>,
): Promise<RouteFile[]> {
  const results: RouteFile[] = [];

  async function walk(d: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(d, { withFileTypes: true, encoding: "utf-8" }) as import("fs").Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      const name = e.name as string;
      const full = join(d, name);
      const seg = name.replace(/^\(.*\)$/, "").replace(/^\[.*\]$/, "[param]");
      if (e.isDirectory() && SKIP_DIRS.has(seg)) continue;
      if (e.isDirectory()) { await walk(full); continue; }

      if (!e.isFile()) continue;
      if (name !== "layout.tsx" && name !== "page.tsx") continue;

      const content = await readFile(full, "utf-8");
      const hasModuleAccess = /requireModuleAccess\(/.test(content);
      const hasRequireRole = /requireRole\(/.test(content);
      const ownGuard = hasModuleAccess || hasRequireRole;
      const ownGuardType: "requireModuleAccess" | "requireRole" | "none" = hasModuleAccess
        ? "requireModuleAccess"
        : hasRequireRole
        ? "requireRole"
        : "none";

      // For layout.tsx: protected if it or ancestor has guard
      // For page.tsx: protected if nearest ancestor layout has guard
      const ancestorGuard = findAncestorGuard(d, layouts);
      const effectivelyProtected = ownGuard || ancestorGuard !== null;
      let guardProvidedBy: string | null = null;
      if (ownGuard) {
        guardProvidedBy = relative(APP_APP_ROOT, full).split(sep).join("/");
      } else if (ancestorGuard) {
        guardProvidedBy = relative(APP_APP_ROOT, ancestorGuard.absPath).split(sep).join("/");
      }

      results.push({
        relPath: relative(APP_APP_ROOT, full).split(sep).join("/"),
        absPath: full,
        fileType: name === "layout.tsx" ? "layout" : "page",
        ownGuard,
        ownGuardType,
        effectivelyProtected,
        guardProvidedBy,
      });
    }
  }

  await walk(dir);
  return results;
}

function buildMarkdownReport(results: RouteFile[]): string {
  const unprotected = results.filter((r) => !r.effectivelyProtected);
  const protected_ = results.filter((r) => r.effectivelyProtected);
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const lines: string[] = [];
  lines.push(`# Route Guard Audit`);
  lines.push(`\nGenerated: ${now}`);
  lines.push(`\nScanned: \`app/(app)/\` (layout.tsx + page.tsx)`);
  lines.push(`\n> **Protection model:** a file is protected if its own layout or any`);
  lines.push(`> ancestor layout in \`app/(app)/\` contains \`requireModuleAccess(\``);
  lines.push(`> or \`requireRole(\`. Pages inherit protection from their layout.\n`);

  lines.push(`## Summary\n`);
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total files scanned | ${results.length} |`);
  lines.push(`| Protected (own or ancestor guard) | ${protected_.length} |`);
  lines.push(`| **Unprotected** | **${unprotected.length}** |`);

  lines.push(`\n## Unprotected Files (${unprotected.length})\n`);
  if (unprotected.length === 0) {
    lines.push(`_All (app) route files are protected by a layout guard._`);
  } else {
    lines.push(`| File | Type |`);
    lines.push(`|------|------|`);
    for (const r of unprotected) {
      lines.push(`| \`${r.relPath}\` | ${r.fileType} |`);
    }
  }

  lines.push(`\n## Protected Files (${protected_.length})\n`);
  lines.push(`| File | Type | Guard Source |`);
  lines.push(`|------|------|-------------|`);
  for (const r of protected_) {
    lines.push(`| \`${r.relPath}\` | ${r.fileType} | \`${r.guardProvidedBy}\` |`);
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  // First pass: collect all layout.tsx files and their guard status
  const layouts = await collectLayouts(APP_APP_ROOT);

  // Second pass: collect all layout.tsx + page.tsx with effective protection
  const results = await collectAllRouteFiles(APP_APP_ROOT, layouts);

  // Sort: unprotected first
  results.sort((a, b) => {
    if (a.effectivelyProtected === b.effectivelyProtected)
      return a.relPath.localeCompare(b.relPath);
    return a.effectivelyProtected ? 1 : -1;
  });

  const unprotected = results.filter((r) => !r.effectivelyProtected);
  const protected_ = results.filter((r) => r.effectivelyProtected);

  console.log(`Scanned ${results.length} files in app/(app)/`);
  console.log(`Protected (own or ancestor guard): ${protected_.length}`);
  console.log(`Unprotected: ${unprotected.length}`);

  if (unprotected.length > 0) {
    console.log("\nUnprotected route files:");
    for (const r of unprotected) {
      console.log(`  WARN  ${r.relPath} [${r.fileType}]`);
    }
  }

  const md = buildMarkdownReport(results);
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, md, "utf-8");
  console.log(`\nReport saved: ${REPORT_PATH}`);

  if (unprotected.length > 0) {
    console.log(`\nACTION REQUIRED: ${unprotected.length} route file(s) missing guards.`);
    process.exit(1);
  } else {
    console.log(`\nAll routes protected.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
