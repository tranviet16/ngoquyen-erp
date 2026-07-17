import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { SERVER_ACTION_RISK_MANIFEST } from "@/test/risk-manifest-server-actions";

const ACTION_MODULES = {
  "app/(app)/thanh-toan/actions.ts": "thanh-toan.ke-hoach",
  "app/(app)/admin/import/import-actions.ts": "admin.import",
  "app/(app)/admin/permissions/actions.ts": "admin.permissions",
  "app/(app)/admin/permissions/modules/availability-actions.ts": "admin.permissions",
  "app/(app)/admin/permissions/roles/actions.ts": "admin.permissions",
  "app/(app)/admin/nguoi-dung/actions.ts": "admin.nguoi-dung",
  "app/(app)/tai-chinh/phai-thu-tra/actions.ts": "tai-chinh",
  "app/(app)/van-hanh/cong-viec/attachments-actions.ts": "van-hanh.cong-viec",
  "app/(app)/van-hanh/cong-viec/comments-actions.ts": "van-hanh.cong-viec",
  "app/(app)/van-hanh/cong-viec/subtasks-actions.ts": "van-hanh.cong-viec",
  "app/(app)/van-hanh/cong-viec/actions.ts": "van-hanh.cong-viec",
  "app/(app)/admin/phong-ban/actions.ts": "admin.phong-ban",
  "app/(app)/thong-bao/actions.ts": "thong-bao",
  "app/(app)/sl-dt/tien-do-nop-tien/actions.ts": "sl-dt",
  "app/(app)/sl-dt/nhap-thang-moi/actions.ts": "sl-dt",
  "app/(app)/van-hanh/phieu-phoi-hop/actions.ts": "van-hanh.phieu-phoi-hop",
  "app/(app)/sl-dt/chi-tieu/actions.ts": "sl-dt",
  "app/(app)/sl-dt/cau-hinh/actions.ts": "sl-dt",
  "app/(app)/sl-dt/danh-muc-lo/actions.ts": "sl-dt",
} as const;

const API_MODULES = {
  "app/api/notifications/route.ts": "thong-bao",
  "app/api/notifications/stream/route.ts": "thong-bao",
  "app/api/tasks/[id]/attachments/[attId]/route.ts": "van-hanh.cong-viec",
} as const;

const PAYMENT_LAYOUT_MODULES = {
  "app/(app)/thanh-toan/ke-hoach/layout.tsx": "thanh-toan.ke-hoach",
  "app/(app)/thanh-toan/tong-hop/layout.tsx": "thanh-toan.tong-hop",
} as const;

const PROJECT_PAGE_FILES = [
  "app/(app)/du-an/[id]/page.tsx",
  "app/(app)/du-an/[id]/cai-dat/page.tsx",
  "app/(app)/du-an/[id]/cong-no/page.tsx",
  "app/(app)/du-an/[id]/dinh-muc/page.tsx",
  "app/(app)/du-an/[id]/dong-tien-3-ben/page.tsx",
  "app/(app)/du-an/[id]/du-toan/page.tsx",
  "app/(app)/du-an/[id]/du-toan-dieu-chinh/page.tsx",
  "app/(app)/du-an/[id]/giao-dich/page.tsx",
  "app/(app)/du-an/[id]/hop-dong/page.tsx",
  "app/(app)/du-an/[id]/nghiem-thu/page.tsx",
  "app/(app)/du-an/[id]/phat-sinh/page.tsx",
  "app/(app)/du-an/[id]/tien-do/page.tsx",
] as const;

const LIB_MODULE_PREFIXES = {
  "lib/cong-no-nc/": "cong-no-nc",
  "lib/cong-no-vt/": "cong-no-vt",
  "lib/du-an/": "du-an",
  "lib/master-data/": "master-data",
  "lib/tai-chinh/": "tai-chinh",
  "lib/vat-tu-ncc/": "vat-tu-ncc",
} as const;

const EXCLUDED_ACTIONS = ["app/(app)/ho-so/actions.ts"] as const;
const RELEASE_IMPORT =
  /from\s+["']@\/lib\/acl(?:\/module-availability|\/released-module-request)?["'];/;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function trackedLibServerActions(): string[] {
  return execFileSync("git", ["ls-files", "--", "lib/**/*.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((path) => /^\s*["']use server["'];/.test(source(path)))
    .filter((path) => /export\s+async\s+function\s+/.test(source(path)));
}

function moduleForLibAction(path: string): string | undefined {
  const match = Object.entries(LIB_MODULE_PREFIXES).find(([prefix]) => path.startsWith(prefix));
  return match?.[1];
}

function exportedAsyncSegments(content: string): string[] {
  const matches = [...content.matchAll(/export\s+async\s+function\s+[A-Za-z0-9_]+/g)];
  return matches.map((match, index) =>
    content.slice(match.index, matches[index + 1]?.index ?? content.length));
}

describe("module release entrypoint contract", () => {
  it("maps every risk-manifest action except the out-of-catalog profile action", () => {
    const manifestPaths = SERVER_ACTION_RISK_MANIFEST.map(({ path }) => path).sort();
    const mappedPaths = [...Object.keys(ACTION_MODULES), ...EXCLUDED_ACTIONS].sort();

    expect(mappedPaths).toEqual(manifestPaths);
    expect(EXCLUDED_ACTIONS).toEqual(["app/(app)/ho-so/actions.ts"]);
  });

  it.each(Object.entries({ ...ACTION_MODULES, ...API_MODULES }))(
    "%s guards every exported async entrypoint with %s",
    (path, moduleKey) => {
      const content = source(path);
      const exportedEntrypoints = content.match(/export\s+async\s+function\s+/g) ?? [];
      const releaseGuards = content.match(
        new RegExp(
          "await\\s+(?:assertModuleReleased|requireReleasedModuleRequest)\\(",
          "g",
        ),
      ) ?? [];

      expect(content).toMatch(RELEASE_IMPORT);
      expect(content).toContain(`"${moduleKey}"`);
      expect(exportedEntrypoints.length).toBeGreaterThan(0);
      expect(releaseGuards).toHaveLength(exportedEntrypoints.length);
    },
  );

  it.each(Object.entries(PAYMENT_LAYOUT_MODULES))(
    "%s requires page access for %s",
    (path, moduleKey) => {
      const content = source(path);

      expect(content).toContain('import { requireModuleAccess } from "@/lib/acl/guards";');
      expect(content).toContain(`await requireModuleAccess("${moduleKey}", {`);
    },
  );

  it("discovers and rollout-guards every tracked lib server action", () => {
    const files = trackedLibServerActions();

    expect(files.length).toBeGreaterThan(0);
    for (const path of files) {
      const moduleKey = moduleForLibAction(path);
      expect(moduleKey, `Missing module mapping for ${path}`).toBeTruthy();
      const escapedKey = moduleKey!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const directGuard = new RegExp(
        `await\\s+(?:assertModuleReleased|requireReleasedModuleRequest)\\(\\s*["']${escapedKey}["']`,
      );
      const sharedGuard = new RegExp(
        `await\\s+requireRoleModuleAccess\\([^;]*["']${escapedKey}["']`,
        "s",
      );

      for (const segment of exportedAsyncSegments(source(path))) {
        const functionName = segment.match(/function\s+([A-Za-z0-9_]+)/)?.[1];
        const directMatch = segment.match(directGuard);
        expect(
          directMatch !== null || sharedGuard.test(segment),
          `Missing rollout guard in ${path}: ${functionName}`,
        ).toBe(true);
        // ID-based mutations may first load the target solely to derive its
        // immutable authorization scope before the rollout guard is invoked.
      }
    }
  });

  it("keeps cross-module query helpers outside the server-action trust boundary", () => {
    expect(source("lib/cong-no-vt/balance-report-service.ts")).not.toMatch(
      /^\s*["']use server["'];/,
    );
    expect(source("lib/master-data/project-query.ts")).not.toMatch(
      /^\s*["']use server["'];/,
    );
    expect(source("lib/cong-no-vt/material-detail-report-service.ts")).toContain(
      'requireReleasedModuleRequest("cong-no-vt")',
    );
    expect(source("lib/cong-no-nc/balance-report-service.ts")).toContain(
      'requireReleasedModuleRequest("cong-no-nc")',
    );
    expect(source("lib/master-data/project-service.ts")).toContain(
      'requireReleasedModuleRequest("master-data")',
    );
    for (const path of [
      "lib/du-an/dashboard-service.ts",
      "app/(app)/du-an/[id]/layout.tsx",
      "app/(app)/du-an/[id]/du-toan/page.tsx",
      "app/(app)/du-an/[id]/tien-do/page.tsx",
      "app/(app)/du-an/[id]/phat-sinh/page.tsx",
      "app/(app)/du-an/[id]/nghiem-thu/page.tsx",
      "app/(app)/du-an/[id]/giao-dich/page.tsx",
    ]) {
      expect(source(path), path).toContain("queryProjectById(projectId)");
    }
  });

  it.each(PROJECT_PAGE_FILES)("%s checks project scope before loading business data", (path) => {
    const content = source(path);
    const guard = 'await requireModuleAccess("du-an", {';
    const projectScope = 'scope: { kind: "project", projectId }';

    expect(content).toContain(guard);
    expect(content).toContain(projectScope);
    expect(content.indexOf(guard)).toBeLessThan(content.indexOf(projectScope));
    expect(content.indexOf(projectScope)).toBeLessThan(content.indexOf("await ", content.indexOf(projectScope) + projectScope.length));
  });
});
