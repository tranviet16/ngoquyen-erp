import { describe, it, expect } from "vitest";
import { getAdapter, listAdapters } from "@/lib/import/adapters/adapter-registry";

const KNOWN = [
  "cong-no-vat-tu",
  "du-an-xay-dung",
  "tai-chinh-nq",
  "gach-nam-huong",
  "quang-minh",
  "sl-dt",
];

describe("adapter-registry", () => {
  it("resolves each known adapter name to an adapter whose own name matches", () => {
    for (const name of KNOWN) {
      const adapter = getAdapter(name);
      expect(adapter, name).toBeDefined();
      expect(adapter!.name).toBe(name);
      expect(typeof adapter!.parse).toBe("function");
      expect(typeof adapter!.validate).toBe("function");
      expect(typeof adapter!.apply).toBe("function");
    }
  });

  it("returns undefined for an unknown adapter name", () => {
    expect(getAdapter("does-not-exist")).toBeUndefined();
    expect(getAdapter("")).toBeUndefined();
  });

  it("listAdapters reports exactly the registered adapters", () => {
    const listed = listAdapters();
    expect(listed.map((a) => a.name).sort()).toEqual([...KNOWN].sort());
    expect(listed.every((a) => typeof a.label === "string" && a.label.length > 0)).toBe(true);
  });
});
