import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("module release UI contract", () => {
  it("keeps status controls semantic, labelled, and touch accessible", () => {
    const row = source(
      "app/(app)/admin/permissions/modules/release-status-switch-row.tsx",
    );

    expect(row).toContain('role="switch"');
    expect(row).toContain("aria-checked={ready}");
    expect(row).toContain("aria-label=");
    expect(row).toContain("min-h-11");
  });

  it("uses a full-height mobile dialog with pending and error announcements", () => {
    const card = source(
      "app/(app)/admin/permissions/modules/release-status-card.tsx",
    );

    expect(card).toContain("max-sm:h-dvh");
    expect(card).toContain('aria-live="polite"');
    expect(card).toContain('role="alert"');
    expect(card).toContain("Xác nhận và lưu");
  });

  it("renders only a synthetic inert shell behind the development notice", () => {
    const page = source("app/(app)/dang-phat-trien/page.tsx");

    expect(page).toContain('aria-hidden="true" inert');
    expect(page).toContain("backdrop-blur-md");
    expect(page).toContain("không chứa dữ liệu nghiệp vụ");
    expect(page).not.toMatch(/prisma|findMany|findUnique|fetch\(/);
  });

  it("labels development sidebar items without a shortened status", () => {
    const sidebar = source("components/layout/app-sidebar-client.tsx");

    expect(sidebar).toContain("Đang phát triển");
    expect(sidebar).toContain("min-h-11");
    expect(sidebar).not.toContain(">Dev<");
  });
});
