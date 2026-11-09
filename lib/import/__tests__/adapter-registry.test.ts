import { describe, it, expect } from "vitest";
import { getAdapter, listAdapters } from "@/lib/import/adapters/adapter-registry";

const KNOWN = [
  "bang-can-doi-vat-tu",
  "du-toan-tong-hop-vt",
  "cong-no-nhan-cong",
  "du-an-xay-dung",
  "tai-chinh-nq",
  "sl-dt",
  "vat-tu-chuyen-doi",
];

/** Adapter nhận cả thư mục (gói .xlsx/.csv). */
const BUNDLE_ADAPTERS = ["vat-tu-chuyen-doi"];

/** Gỡ vì ghi sổ / phiếu vật tư không có công trình (vi phạm CHECK bắt buộc công trình). */
const REMOVED = ["cong-no-vat-tu", "gach-nam-huong", "quang-minh"];

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

  it("no longer registers the adapters that wrote material rows without a project", () => {
    for (const name of REMOVED) expect(getAdapter(name), name).toBeUndefined();
  });

  it("single-file adapters do not accept folder bundles", () => {
    for (const adapter of listAdapters().filter((a) => !BUNDLE_ADAPTERS.includes(a.name))) {
      expect(adapter.acceptsBundle, adapter.name).toBe(false);
    }
  });

  it("the cutover adapter accepts the whole folder, supports rollback and has its own mapping schema", () => {
    expect(listAdapters().find((a) => a.name === "vat-tu-chuyen-doi")).toMatchObject({ acceptsBundle: true, supportsRollback: true });
    expect(getAdapter("vat-tu-chuyen-doi")?.mappingSchema).toBeDefined();
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
