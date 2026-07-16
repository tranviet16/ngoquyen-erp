import type { RiskManifestRecord, RiskTier } from "./risk-manifest-types";

const recovery = {
  killSwitch: "disable affected action in deployment configuration",
  runbook: "docs/operations/risk-register.md",
} as const;

function action(
  id: string,
  path: string,
  tier: RiskTier,
  business: RiskManifestRecord["owners"]["business"],
  authorization: RiskManifestRecord["authorization"],
): RiskManifestRecord {
  return {
    id,
    kind: "server-action",
    path,
    operation: "SERVER",
    tier,
    dataClassification: tier === "P0" ? "restricted" : "internal",
    owners: { technical: "application", business, release: "release" },
    authorization,
    requiredTests: tier === "P0"
      ? ["allow", "deny", "cross-scope", "audit", "recovery"]
      : ["allow", "deny", "cross-scope"],
    recovery,
  };
}

const defined = (reference: string) => ({ reference, status: "defined" as const });

export const SERVER_ACTION_RISK_MANIFEST: readonly RiskManifestRecord[] = [
  action("action-payment", "app/(app)/thanh-toan/actions.ts", "P0", "finance", defined("payment role, approval separation, and resource scope")),
  action("action-import", "app/(app)/admin/import/import-actions.ts", "P0", "administration", defined("authorized administrator import, rollback, and audit policy")),
  action("action-permissions", "app/(app)/admin/permissions/actions.ts", "P0", "administration", defined("authorized administrator module and project grant policy")),
  action("action-module-availability", "app/(app)/admin/permissions/modules/availability-actions.ts", "P0", "administration", defined("active administrator, protected core module, atomic availability update, and audit policy")),
  action("action-role-permissions", "app/(app)/admin/permissions/roles/actions.ts", "P0", "administration", defined("authorized administrator role definition, module grant, and audit policy")),
  action("action-user-grants", "app/(app)/admin/nguoi-dung/actions.ts", "P0", "administration", defined("authorized administrator user and department grant policy")),
  action("action-finance-pr-sync", "app/(app)/tai-chinh/phai-thu-tra/actions.ts", "P0", "finance", defined("finance module edit or administrator policy with audited sync, override, exclusion, and recovery operations")),
  action("action-task-attachments", "app/(app)/van-hanh/cong-viec/attachments-actions.ts", "P0", "operations", defined("task viewer download and task editor delete within resource scope")),
  action("action-task-comments", "app/(app)/van-hanh/cong-viec/comments-actions.ts", "P1", "operations", defined("task collaborator policy")),
  action("action-task-subtasks", "app/(app)/van-hanh/cong-viec/subtasks-actions.ts", "P1", "operations", defined("task collaborator policy")),
  action("action-task-workflow", "app/(app)/van-hanh/cong-viec/actions.ts", "P1", "operations", defined("task workflow policy")),
  action("action-document-profile", "app/(app)/ho-so/actions.ts", "P1", "administration", defined("employee profile access policy")),
  action("action-departments", "app/(app)/admin/phong-ban/actions.ts", "P1", "administration", defined("department administration policy")),
  action("action-notifications", "app/(app)/thong-bao/actions.ts", "P1", "product", defined("current-user notification policy")),
  action("action-progress", "app/(app)/sl-dt/tien-do-nop-tien/actions.ts", "P1", "operations", defined("SL-DT module access policy")),
  action("action-month-input", "app/(app)/sl-dt/nhap-thang-moi/actions.ts", "P1", "operations", defined("SL-DT module access policy")),
  action("action-coordination", "app/(app)/van-hanh/phieu-phoi-hop/actions.ts", "P1", "operations", defined("coordination form policy")),
  action("action-targets", "app/(app)/sl-dt/chi-tieu/actions.ts", "P1", "operations", defined("SL-DT module access policy")),
  action("action-configuration", "app/(app)/sl-dt/cau-hinh/actions.ts", "P1", "operations", defined("SL-DT configuration policy")),
  action("action-lot-catalog", "app/(app)/sl-dt/danh-muc-lo/actions.ts", "P1", "operations", defined("SL-DT administrator lot catalog policy")),
];
