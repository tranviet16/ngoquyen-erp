import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SortHeader } from "@/components/data-table/sort-header";

function render(currentDir?: "asc" | "desc") {
  return renderToStaticMarkup(createElement(SortHeader, {
    colKey: "amount",
    header: "Số tiền",
    sortable: true,
    currentCol: currentDir ? "amount" : undefined,
    currentDir,
    onSortChange: () => undefined,
  }));
}

describe("SortHeader accessibility", () => {
  it("renders a neutral sortable column", () => {
    const markup = render();
    expect(markup).toContain('aria-sort="none"');
    expect(markup).toContain("Thứ tự mặc định");
    expect(markup).toContain("tăng dần");
    expect(markup).toContain('class="hidden print:inline"');
  });

  it.each([
    ["asc", "ascending", "giảm dần"],
    ["desc", "descending", "thứ tự mặc định"],
  ] as const)("renders %s state", (dir, ariaSort, nextLabel) => {
    const markup = render(dir);
    expect(markup).toContain(`aria-sort="${ariaSort}"`);
    expect(markup).toContain(nextLabel);
  });
});
