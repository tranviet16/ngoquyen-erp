export interface RiskLaneSelection {
  baseline: true;
  securityContract: boolean;
  /** Runs the whole Playwright suite (CI job `e2e-security`), not only `e2e/security/`. */
  e2eSecurity: boolean;
  reason: string;
}

const P0_PREFIXES = [
  "app/api/",
  "lib/acl/",
  "lib/auth",
  "lib/audit",
  "prisma/schema.prisma",
  "prisma/migrations/",
  "app/(app)/admin/permissions/",
  "app/(app)/admin/nguoi-dung/actions.ts",
  "app/(app)/admin/import/import-actions.ts",
  "app/(app)/thanh-toan/actions.ts",
  ".github/workflows/",
  "scripts/risk-change-classifier.ts",
  "scripts/verify-risk-manifest.ts",
  "test/risk-manifest",
  "test/security/",
  "e2e/security/",
];

/**
 * Screens whose client-side behaviour only the Playwright suite pins (keyboard, focus, saves), plus the suite
 * itself. A change here runs the e2e job without the security-contract job, so a spec added for these screens
 * runs on the PRs that can break it.
 */
const E2E_PREFIXES = [
  "e2e/",
  "playwright.config.ts",
  "app/(app)/du-an/[id]/dt-hd-tt/",
  "components/du-an/dt-hd-tt/",
  "lib/du-an/dt-hd-tt/",
];

export function classifyRiskChange(paths: readonly string[]): RiskLaneSelection {
  const normalized = paths.map((path) => path.replaceAll("\\", "/"));
  const p0Path = normalized.find((path) => P0_PREFIXES.some((prefix) => path.startsWith(prefix)));
  if (p0Path) return { baseline: true, securityContract: true, e2eSecurity: true, reason: `P0 path: ${p0Path}` };

  const unknownServerAction = normalized.find((path) => /(^|\/)[\w-]*actions?\.tsx?$/.test(path));
  if (unknownServerAction) {
    return { baseline: true, securityContract: true, e2eSecurity: true, reason: `unclassified server action: ${unknownServerAction}` };
  }

  const e2ePath = normalized.find((path) => E2E_PREFIXES.some((prefix) => path.startsWith(prefix)));
  if (e2ePath) return { baseline: true, securityContract: false, e2eSecurity: true, reason: `e2e path: ${e2ePath}` };
  return { baseline: true, securityContract: false, e2eSecurity: false, reason: "no P0-like paths" };
}

function main(): void {
  const selection = classifyRiskChange(process.argv.slice(2));
  console.log(JSON.stringify(selection));
}

if (process.argv[1]?.endsWith("risk-change-classifier.ts")) main();
