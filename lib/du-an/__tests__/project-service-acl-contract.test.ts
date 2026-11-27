import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceFiles = [
  "acceptance-service.ts",
  "cashflow-service.ts",
  "change-order-service.ts",
  "contract-service.ts",
  "cdt-invoice-service.ts",
  "estimate-service.ts",
  "norm-service.ts",
  "schedule-service.ts",
  "settings-service.ts",
  "transaction-service.ts",
  // Sổ "Đối chiếu DT-HĐ-TT": mọi service ("use server") của thư mục con cũng phải theo hợp đồng này.
  "dt-hd-tt/report-service.ts",
  "dt-hd-tt/invoice-service.ts",
  "dt-hd-tt/receipt-service.ts",
  "dt-hd-tt/payment-service.ts",
  "dt-hd-tt/alias-service.ts",
  "dt-hd-tt/group-code-service.ts",
  "dt-hd-tt/counterparty-service.ts",
];

/** Sổ nhập liệu "Đối chiếu DT-HĐ-TT": thêm cần `create`, sửa / xóa cần `edit`, xem cần `read`. */
const entryServiceFiles = ["dt-hd-tt/invoice-service.ts", "dt-hd-tt/receipt-service.ts", "dt-hd-tt/payment-service.ts"];

/** Màn Ánh xạ / Mã nhóm / Đầu mối: cùng phân quyền; xác nhận hàng loạt cần `edit`. */
const mappingServiceFiles = ["dt-hd-tt/alias-service.ts", "dt-hd-tt/group-code-service.ts", "dt-hd-tt/counterparty-service.ts"];

function requiredLevel(action: string): "create" | "edit" | "read" {
  if (/^create/.test(action)) return "create";
  if (/^(update|softDelete|confirm)/.test(action)) return "edit";
  return "read";
}

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

  it.each(entryServiceFiles)("%s splits create / edit / read and locks the project before writing", (file) => {
    const source = readFileSync(join(process.cwd(), "lib", "du-an", file), "utf8");
    expect(source).not.toMatch(/\.(upsert|updateMany|createMany|deleteMany|delete)\(/);
    expect(source).not.toContain("$executeRaw");
    const actions = exportedActions(source);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      const level = requiredLevel(action.name);
      expect(action.body, `${file}:${action.name} level`).toContain(`minLevel: "${level}"`);
      if (level === "read") {
        expect(action.body, `${file}:${action.name} read-only`).not.toContain("$transaction");
        continue;
      }
      expect(action.body, `${file}:${action.name} project lock`).toContain("lockProjectDtHdTt(tx");
    }
  });

  it.each(mappingServiceFiles)("%s splits create / edit / read, locks the project and returns refusals", (file) => {
    const source = readFileSync(join(process.cwd(), "lib", "du-an", file), "utf8");
    expect(source).not.toMatch(/\.(upsert|createMany|deleteMany|delete)\(/);
    expect(source).not.toContain("$executeRaw");
    // Ghi hàng loạt chỉ khi bỏ audit tự động có chủ đích VÀ ghi tay một dòng audit.
    if (/\.updateMany\(/.test(source)) {
      expect(source).toContain("bypassAudit(");
      expect(source).toContain("auditLog.create(");
    }
    const actions = exportedActions(source);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      const level = requiredLevel(action.name);
      expect(action.body, `${file}:${action.name} level`).toContain(`minLevel: "${level}"`);
      if (level === "read") {
        expect(action.body, `${file}:${action.name} read-only`).not.toContain("$transaction");
        continue;
      }
      expect(action.body, `${file}:${action.name} project lock`).toContain("lockProjectDtHdTt(tx");
      // Bản production ẩn thông điệp lỗi ném từ server action → trả ActionResult.
      expect(action.body, `${file}:${action.name} returns ActionResult`).toMatch(/return run(Entry)?Action\(/);
    }
  });
});
