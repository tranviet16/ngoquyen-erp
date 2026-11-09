import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { ImportMapping, RegisteredImportAdapter } from "@/lib/import/adapters/adapter-types";
import {
  autoFillMapping,
  mergeAcks,
  missingAcks,
  normalizeAdapterReview,
  parseStoredReview,
  readStoredMapping,
  validateMapping,
} from "@/lib/import/import-review";
import { ImportError } from "@/lib/import/import-errors";

function adapterWith(mappingSchema?: z.ZodType<ImportMapping>): RegisteredImportAdapter {
  return {
    name: "fake",
    label: "Fake",
    mappingSchema,
    parse: async () => ({ rows: [], conflicts: [], meta: {} }),
    validate: () => ({ valid: true, errors: [] }),
    apply: async () => ({ rowsTotal: 0, rowsImported: 0, rowsSkipped: 0, errors: [] }),
  };
}

describe("validateMapping", () => {
  it("accepts positive ids / null with the default schema", () => {
    expect(validateMapping(adapterWith(), { "contractor:Đội X": 7, "entity:Cty": null })).toEqual({
      "contractor:Đội X": 7,
      "entity:Cty": null,
    });
  });

  it("rejects strings, non-integers and non-objects with the default schema", () => {
    expect(() => validateMapping(adapterWith(), { "contractor:Đội X": "7" })).toThrow(ImportError);
    expect(() => validateMapping(adapterWith(), { "contractor:Đội X": 1.5 })).toThrow(/Ánh xạ không hợp lệ/);
    expect(() => validateMapping(adapterWith(), { "contractor:Đội X": -1 })).toThrow(ImportError);
    expect(() => validateMapping(adapterWith(), [1, 2])).toThrow(ImportError);
    expect(() => validateMapping(adapterWith(), "x")).toThrow(ImportError);
  });

  it("uses the adapter's own schema (keys and value types)", () => {
    const schema = z.record(
      z.string().regex(/^(supplier|date|ack):/),
      z.union([z.number().int().positive(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
    );
    const adapter = adapterWith(schema);
    expect(validateMapping(adapter, { "date:a.xlsx:S!A1": "2026-10-20", "supplier:x": 3 })).toEqual({
      "date:a.xlsx:S!A1": "2026-10-20",
      "supplier:x": 3,
    });
    expect(() => validateMapping(adapter, { "item:x": 1 })).toThrow(ImportError);
    expect(() => validateMapping(adapter, { "date:a": "20/10/2026" })).toThrow(ImportError);
  });

  it("only allows 1 or null for ack keys", () => {
    expect(validateMapping(adapterWith(), { "ack:v1": 1, "ack:v2": null })).toEqual({ "ack:v1": 1, "ack:v2": null });
    expect(() => validateMapping(adapterWith(), { "ack:v1": 2 })).toThrow(/chỉ nhận 1/);
    expect(() => validateMapping(adapterWith(), { "ack:": 1 })).toThrow(/thiếu mã/);
  });

  it("caps key length", () => {
    expect(() => validateMapping(adapterWith(), { ["k".repeat(501)]: 1 })).toThrow(ImportError);
  });
});

describe("autoFillMapping", () => {
  it("fills only when exactly one candidate matches the normalized name exactly", () => {
    const mapping = autoFillMapping([
      { sourceName: "  Đội   Xây Tô ", entityType: "contractor", candidates: [{ id: 4, name: "đội xây tô", score: 1 }] },
      { sourceName: "Đội A", entityType: "contractor", candidates: [{ id: 5, name: "Đội A B", score: 0.5 }] },
      {
        sourceName: "Cty",
        entityType: "entity",
        candidates: [
          { id: 1, name: "Cty", score: 1 },
          { id: 2, name: "cty", score: 1 },
        ],
      },
      { sourceName: "Thep", entityType: "supplier", candidates: [{ id: 9, name: "Thép", score: 0.9 }] },
    ]);
    expect(mapping).toEqual({ "contractor:  Đội   Xây Tô ": 4 });
  });
});

describe("mergeAcks", () => {
  const now = new Date("2026-11-06T03:00:00.000Z");

  it("records who/when for new acks, keeps earlier ones, drops acks no longer required", () => {
    const previous = { "v1:a": { ackedBy: "u-old", ackedAt: "2026-11-05T01:00:00.000Z" } };
    const result = mergeAcks(
      { "supplier:x": 3, "ack:v1:a": 1, "ack:v1:b": 1, "ack:gone": 1, "ack:unchecked": null },
      ["v1:a", "v1:b", "unchecked"],
      previous,
      "u-new",
      now,
    );
    expect(result.mapping).toEqual({ "supplier:x": 3, "ack:v1:a": 1, "ack:v1:b": 1 });
    expect(result.acks).toEqual({
      "v1:a": previous["v1:a"],
      "v1:b": { ackedBy: "u-new", ackedAt: now.toISOString() },
    });
    expect(missingAcks({ requiredAcks: ["v1:a", "v1:b", "unchecked"], acks: result.acks })).toEqual(["unchecked"]);
  });
});

describe("normalizeAdapterReview", () => {
  it("dedupes/trims messages and round-trips payload through JSON", () => {
    const review = normalizeAdapterReview({
      payload: { when: new Date("2026-10-26T00:00:00.000Z"), skip: undefined },
      blocking: [" Lỗi A ", "Lỗi A", ""],
      requiredAcks: ["x", "x"],
    });
    expect(review).toEqual({ payload: { when: "2026-10-26T00:00:00.000Z" }, blocking: ["Lỗi A"], requiredAcks: ["x"] });
  });

  it("rejects malformed reviews", () => {
    expect(() =>
      normalizeAdapterReview({ payload: null, blocking: "x" as unknown as string[], requiredAcks: [] }),
    ).toThrow(/blocking/);
    expect(() => normalizeAdapterReview({ payload: BigInt(10), blocking: [], requiredAcks: [] })).toThrow(/JSON/);
    expect(() => normalizeAdapterReview({ payload: null, blocking: [], requiredAcks: ["c".repeat(301)] })).toThrow(
      /Mã xác nhận/,
    );
  });
});

describe("parseStoredReview / readStoredMapping", () => {
  it("returns null for legacy runs and fills defaults", () => {
    expect(parseStoredReview(null)).toBeNull();
    expect(parseStoredReview("x")).toBeNull();
    expect(parseStoredReview({ payload: { a: 1 } })).toEqual({ payload: { a: 1 }, blocking: [], requiredAcks: [], acks: {} });
  });

  it("keeps bundle info and expected", () => {
    const stored = parseStoredReview({
      payload: null,
      blocking: [],
      requiredAcks: [],
      acks: {},
      bundle: { files: [{ path: "a.csv", size: 1, sha256: "f".repeat(64) }], skipped: [] },
      expected: { cutoverDate: "2026-10-26" },
    });
    expect(stored?.bundle?.files[0].path).toBe("a.csv");
    expect(stored?.expected).toEqual({ cutoverDate: "2026-10-26" });
  });

  it("readStoredMapping drops non-scalar values", () => {
    expect(readStoredMapping({ a: 1, b: "x", c: null, d: { e: 1 }, f: [1] })).toEqual({ a: 1, b: "x", c: null });
    expect(readStoredMapping(null)).toEqual({});
  });
});
