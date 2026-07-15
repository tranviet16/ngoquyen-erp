export const RISK_TIERS = ["P0", "P1", "P2"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const REQUIRED_P0_TESTS = [
  "allow",
  "deny",
  "cross-scope",
  "audit",
  "recovery",
] as const;
export type RequiredTest = (typeof REQUIRED_P0_TESTS)[number];

export interface RiskOwners {
  technical: "platform" | "security" | "application";
  business: "finance" | "operations" | "administration" | "product";
  release: "release";
}

export interface AuthorizationPolicy {
  reference: string;
  status: "defined" | "pending";
}

export interface RiskRecovery {
  killSwitch: string;
  runbook: string;
}

export interface RiskManifestRecord {
  id: string;
  kind: "api-route" | "server-action";
  path: string;
  operation: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL" | "SERVER";
  tier: RiskTier;
  dataClassification: "public" | "internal" | "confidential" | "restricted";
  owners: RiskOwners;
  authorization: AuthorizationPolicy;
  requiredTests: readonly RequiredTest[];
  recovery: RiskRecovery;
}
