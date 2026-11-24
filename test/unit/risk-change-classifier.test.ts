import { describe, expect, it } from "vitest";
import { classifyRiskChange } from "@/scripts/risk-change-classifier";

describe("risk change classifier", () => {
  it("selects strict lanes for API, ACL, schema, and permission changes", () => {
    for (const path of ["app/api/export/excel/route.ts", "lib/acl/effective.ts", "prisma/schema.prisma", "app/(app)/admin/permissions/actions.ts", ".github/workflows/test.yml", "scripts/verify-risk-manifest.ts", "test/risk-manifest.ts", "e2e/security/authz-matrix.spec.ts"]) {
      expect(classifyRiskChange([path])).toMatchObject({ securityContract: true, e2eSecurity: true });
    }
  });

  it("selects strict lanes for an unknown server action", () => {
    expect(classifyRiskChange(["app/(app)/new-domain/actions.ts"])).toMatchObject({ securityContract: true, e2eSecurity: true });
  });

  it("runs the e2e suite without the security contract for screens only e2e specs pin", () => {
    for (const path of ["e2e/du-an-hd-tt-edit.spec.ts", "e2e/fixtures/db.ts", "playwright.config.ts", "components/du-an/dt-hd-tt/hd-tt-screen.tsx", "lib/du-an/dt-hd-tt/hd-tt-edit-model.ts", "app/(app)/du-an/[id]/dt-hd-tt/hd-tt/page.tsx"]) {
      expect(classifyRiskChange([path])).toEqual({ baseline: true, securityContract: false, e2eSecurity: true, reason: `e2e path: ${path}` });
    }
  });

  it("keeps the strict lanes when an e2e path comes with a P0 path", () => {
    expect(classifyRiskChange(["components/du-an/dt-hd-tt/hd-tt-screen.tsx", "lib/acl/effective.ts"])).toMatchObject({ securityContract: true, e2eSecurity: true });
  });

  it("keeps ordinary UI-only changes on the baseline lane", () => {
    expect(classifyRiskChange(["components/button.tsx"])).toEqual({
      baseline: true,
      securityContract: false,
      e2eSecurity: false,
      reason: "no P0-like paths",
    });
  });
});
