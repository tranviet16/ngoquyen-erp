/**
 * Form thêm dòng thu gọn được: trạng thái nhớ theo sổ trong `localStorage`; không đọc / ghi được thì
 * form mở như mặc định và nút thu gọn vẫn chạy trong phiên. Server luôn vẽ form mở.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CollapsibleAddForm, readAddFormCollapsed, writeAddFormCollapsed } from "@/components/du-an/dt-hd-tt/collapsible-add-form";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}
const broken = () => {
  throw new Error("SecurityError: localStorage bị chặn");
};

describe("add form collapsed state", () => {
  it("is expanded by default and reads a stored collapsed flag per book", () => {
    const store = memoryStorage({ "dt-hd-tt.add-form-collapsed.sach-a": "1" });
    expect(readAddFormCollapsed("sach-a", () => store)).toBe(true);
    expect(readAddFormCollapsed("sach-b", () => store)).toBe(false);
  });

  it("defaults to expanded when localStorage cannot be read", () => {
    expect(readAddFormCollapsed("sach-c", broken)).toBe(false);
  });

  it("stores the flag and, when storage fails, still toggles within the session", () => {
    const store = memoryStorage();
    writeAddFormCollapsed("sach-d", true, () => store);
    expect(store.data.get("dt-hd-tt.add-form-collapsed.sach-d")).toBe("1");
    expect(readAddFormCollapsed("sach-d", () => store)).toBe(true);

    expect(() => writeAddFormCollapsed("sach-e", true, broken)).not.toThrow();
    expect(readAddFormCollapsed("sach-e", broken)).toBe(true);
    writeAddFormCollapsed("sach-e", false, broken);
    expect(readAddFormCollapsed("sach-e", broken)).toBe(false);
  });

  it("renders expanded on the server, with the two rows, the submit and the toggle hooks", () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleAddForm, {
        name: "hoa-don",
        title: "Thêm dòng hóa đơn",
        onSubmit: () => {},
        submitLabel: "Thêm dòng",
        saving: false,
        firstRow: createElement("span", null, "hàng một"),
        secondRow: createElement("span", null, "hàng hai"),
      }),
    );
    expect(html).toContain('data-add-form="hoa-don"');
    expect(html).toContain('data-collapsed="false"');
    expect(html).toContain("data-add-form-toggle");
    expect(html).toContain("data-add-form-submit");
    expect(html).toContain("hàng một");
    expect(html).toContain("hàng hai");
  });
});
