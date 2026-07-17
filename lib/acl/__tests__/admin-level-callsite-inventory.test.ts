/**
 * Regression inventory for the approved access hierarchy.
 *
 * `admin` is a system role, never a module access level. Record creation is
 * deliberately distinct from editing and deletion.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

type Disposition = "normal-delete-to-edit" | "raw-override-exact-admin" | "admin-only-exact-admin";
type Guard = readonly [file: string, fn: string, disposition: Disposition];
type MutationBaseline = readonly [file: string, fn: string, currentContract: string];

const ADMIN_GUARDS: readonly Guard[] = [
  ["app/(app)/admin/phong-ban/actions.ts", "requireAdmin", "admin-only-exact-admin"],
  ["app/(app)/admin/permissions/actions.ts", "assertAdmin", "admin-only-exact-admin"],
  ["app/(app)/admin/permissions/roles/actions.ts", "assertPermissionsAdmin", "admin-only-exact-admin"],
  ["app/(app)/sl-dt/danh-muc-lo/actions.ts", "assertAdmin", "admin-only-exact-admin"],
  ["app/(app)/sl-dt/chi-tieu/actions.ts", "adminPatchChiTieuRow", "admin-only-exact-admin"],
  ["app/(app)/sl-dt/chi-tieu/actions.ts", "cascadeRecomputeLuyKe", "admin-only-exact-admin"],
  ["app/(app)/sl-dt/chi-tieu/actions.ts", "calculateMonthlyTargets", "admin-only-exact-admin"],
  ["app/(app)/sl-dt/chi-tieu/actions.ts", "setSubtotalLabel", "admin-only-exact-admin"],
  ["app/(app)/sl-dt/nhap-thang-moi/actions.ts", "adminPatchMonthlyInputCell", "admin-only-exact-admin"],
  ["lib/vat-tu-ncc/delivery-service.ts", "softDeleteDelivery", "normal-delete-to-edit"],
  ["lib/vat-tu-ncc/reconciliation-service.ts", "softDeleteReconciliation", "normal-delete-to-edit"],
  ["lib/cong-no-vt/material-ledger-service.ts", "softDeleteMaterialTransaction", "normal-delete-to-edit"],
  ["lib/cong-no-vt/material-ledger-service.ts", "softDeleteMaterialTransactions", "normal-delete-to-edit"],
  ["lib/cong-no-vt/material-ledger-service.ts", "deleteMaterialOpeningBalance", "normal-delete-to-edit"],
  ["lib/cong-no-vt/material-ledger-service.ts", "deleteMaterialOpeningBalances", "normal-delete-to-edit"],
  ["lib/cong-no-vt/material-ledger-service.ts", "adminPatchMaterialTransaction", "raw-override-exact-admin"],
  ["lib/cong-no-nc/labor-ledger-service.ts", "softDeleteLaborTransaction", "normal-delete-to-edit"],
  ["lib/cong-no-nc/labor-ledger-service.ts", "softDeleteLaborTransactions", "normal-delete-to-edit"],
  ["lib/cong-no-nc/labor-ledger-service.ts", "deleteLaborOpeningBalance", "normal-delete-to-edit"],
  ["lib/cong-no-nc/labor-ledger-service.ts", "deleteLaborOpeningBalances", "normal-delete-to-edit"],
  ["lib/cong-no-nc/labor-ledger-service.ts", "adminPatchLaborTransaction", "raw-override-exact-admin"],
  ["lib/du-an/change-order-service.ts", "softDeleteChangeOrder", "normal-delete-to-edit"],
  ["lib/du-an/change-order-service.ts", "adminPatchChangeOrder", "raw-override-exact-admin"],
  ["lib/du-an/estimate-service.ts", "softDeleteEstimate", "normal-delete-to-edit"],
  ["lib/du-an/estimate-service.ts", "adminPatchEstimate", "raw-override-exact-admin"],
  ["lib/du-an/cashflow-service.ts", "softDeleteCashflow", "normal-delete-to-edit"],
  ["lib/du-an/cashflow-service.ts", "adminPatchCashflow", "raw-override-exact-admin"],
  ["lib/du-an/acceptance-service.ts", "softDeleteAcceptance", "normal-delete-to-edit"],
  ["lib/du-an/acceptance-service.ts", "adminPatchAcceptance", "raw-override-exact-admin"],
  ["lib/du-an/contract-service.ts", "softDeleteContract", "normal-delete-to-edit"],
  ["lib/du-an/schedule-service.ts", "softDeleteSchedule", "normal-delete-to-edit"],
  ["lib/du-an/schedule-service.ts", "adminPatchSchedule", "raw-override-exact-admin"],
  ["lib/du-an/transaction-service.ts", "softDeleteTransaction", "normal-delete-to-edit"],
  ["lib/du-an/transaction-service.ts", "adminPatchTransaction", "raw-override-exact-admin"],
  ["lib/master-data/supplier-service.ts", "softDeleteSupplier", "admin-only-exact-admin"],
  ["lib/master-data/item-service.ts", "softDeleteItem", "admin-only-exact-admin"],
  ["lib/master-data/entity-service.ts", "softDeleteEntity", "admin-only-exact-admin"],
  ["lib/master-data/contractor-service.ts", "softDeleteContractor", "admin-only-exact-admin"],
  ["lib/master-data/project-service.ts", "softDeleteProject", "admin-only-exact-admin"],
  ["lib/master-data/project-service.ts", "softDeleteCategory", "admin-only-exact-admin"],
  ["lib/tai-chinh/journal-service.ts", "softDeleteJournalEntry", "admin-only-exact-admin"],
  ["lib/tai-chinh/journal-service.ts", "softDeleteJournalEntries", "admin-only-exact-admin"],
  ["lib/tai-chinh/cash-account-service.ts", "softDeleteCashAccount", "admin-only-exact-admin"],
  ["lib/tai-chinh/expense-category-service.ts", "softDeleteExpenseCategory", "admin-only-exact-admin"],
  ["lib/tai-chinh/loan-service.ts", "softDeleteLoanContract", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-adjustment-service.ts", "softDeletePrAdjustment", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-adjustment-service.ts", "softDeleteImportedPrAdjustments", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-sync-service.ts", "listPayableSyncEntityOptions", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-sync-service.ts", "syncPayablesFromLedgers", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-sync-service.ts", "syncReceivablesFromSlDt", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-sync-service.ts", "undoLatestFinancePrSync", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-sync-service.ts", "excludeFinancePrLine", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-sync-service.ts", "excludeFinancePrLineEntity", "admin-only-exact-admin"],
  ["lib/tai-chinh/pr-sync-service.ts", "deleteFinancePrRows", "admin-only-exact-admin"],
  ["lib/tai-chinh/state-obligation-service.ts", "softDeleteObligationTypes", "admin-only-exact-admin"],
];

const MUTATION_BASELINE: readonly MutationBaseline[] = [
  ["lib/du-an/transaction-service.ts", "createTransaction", "\"create\""],
  ["lib/du-an/transaction-service.ts", "updateTransaction", "\"edit\""],
  ["lib/du-an/transaction-service.ts", "softDeleteTransaction", "\"edit\""],
  ["lib/du-an/transaction-service.ts", "adminPatchTransaction", "requireActiveAdmin"],
  ["lib/cong-no-vt/material-ledger-service.ts", "bulkUpsertMaterialTransactions", "\"edit\""],
  ["app/(app)/thanh-toan/actions.ts", "submitRoundAction", "svc.submitRound"],
];

const root = resolve(process.cwd());
const key = (file: string, fn: string) => `${file}#${fn}`;

function functionBody(source: string, fn: string): string {
  const start = source.indexOf(`function ${fn}(`);
  if (start < 0) return "";
  const next = source.indexOf("export ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function productionAdminGuardKeys(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return productionAdminGuardKeys(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.includes(".test.")) return [];

    const file = relative(root, path).replaceAll("\\", "/");
    const lines = readFileSync(path, "utf8").split("\n");
    return lines.flatMap((line, lineIndex) => {
      if (!/requireRoleModuleAccess\([^\n]*["']admin["']/.test(line)) return [];
      for (let index = lineIndex; index >= 0; index -= 1) {
        const match = lines[index].match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
        if (match) return [key(file, match[1])];
      }
      return [key(file, "<unclassified>")];
    });
  });
}

describe("Phase 1 admin-level callsite inventory", () => {
  it("has removed every production requireRoleModuleAccess(..., admin) callsite", () => {
    const observed = [...productionAdminGuardKeys(join(root, "lib")), ...productionAdminGuardKeys(join(root, "app"))];

    expect(observed).toEqual([]);
    expect(ADMIN_GUARDS).toHaveLength(55);
    expect(ADMIN_GUARDS.filter(([, , d]) => d === "normal-delete-to-edit")).not.toHaveLength(0);
    expect(ADMIN_GUARDS.filter(([, , d]) => d === "raw-override-exact-admin")).not.toHaveLength(0);
    expect(ADMIN_GUARDS.filter(([, , d]) => d === "admin-only-exact-admin")).not.toHaveLength(0);
  });

  it("does not expose admin as a module access level", () => {
    const source = readFileSync(join(root, "lib/acl/modules.ts"), "utf8");
    const accessLevels = source.match(/ACCESS_LEVELS\s*=\s*\[([^\]]+)\]/)?.[1] ?? "";
    expect(accessLevels).not.toMatch(/["']admin["']/);
  });

  it("routes creates to create and mutations to edit", () => {
    for (const [file, fn, currentContract] of MUTATION_BASELINE) {
      const source = functionBody(readFileSync(join(root, file), "utf8"), fn);
      expect(source, key(file, fn)).not.toBe("");
      expect(source, key(file, fn)).toContain(currentContract);
    }
  });
});
