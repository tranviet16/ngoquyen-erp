import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceFiles = [
  "acceptance-service.ts",
  "cashflow-service.ts",
  "change-order-service.ts",
  "contract-service.ts",
  "estimate-service.ts",
  "norm-service.ts",
  "schedule-service.ts",
  "settings-service.ts",
  "supplier-debt-service.ts",
  "transaction-service.ts",
];

function exportedActions(source: string): Array<{ name: string; body: string }> {
  const matches = [...source.matchAll(/export async function (\w+)\s*\(/g)];
  return matches.map((match, index) => ({
    name: match[1],
    body: source.slice(match.index, matches[index + 1]?.index ?? source.length),
  }));
}

describe("project service ACL contract", () => {
  it.each(serviceFiles)("scopes every %s action to its project", (file) => {
    const source = readFileSync(join(process.cwd(), "lib", "du-an", file), "utf8");
    for (const action of exportedActions(source)) {
      expect(action.body, `${file}:${action.name} release guard`).toContain(
        'requireReleasedModuleRequest("du-an"',
      );
      expect(action.body, `${file}:${action.name} project scope`).toMatch(
        /scope:\s*\{\s*kind:\s*"project",\s*projectId(?::\s*[^}\n]+)?\s*\}/,
      );
    }
  });

  it("binds id-based mutations to the record's project before updating", () => {
    for (const file of serviceFiles) {
      const source = readFileSync(join(process.cwd(), "lib", "du-an", file), "utf8");
      for (const action of exportedActions(source)) {
        if (!/^(update|adminPatch|softDelete)/.test(action.name)) continue;
        expect(action.body, `${file}:${action.name} record lookup`).toContain("findUnique");
        expect(action.body, `${file}:${action.name} project match`).toMatch(
          /existing\.projectId\s*!==/,
        );
      }
    }
  });
});
