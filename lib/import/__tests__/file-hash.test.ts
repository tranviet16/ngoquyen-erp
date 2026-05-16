import { describe, it, expect } from "vitest";
import { sha256Hex } from "@/lib/import/file-hash";

describe("sha256Hex", () => {
  it("is deterministic — same buffer yields the same hash", () => {
    const buf = Buffer.from("ngoquyyen-erp import payload");
    expect(sha256Hex(buf)).toBe(sha256Hex(Buffer.from("ngoquyyen-erp import payload")));
  });

  it("is sensitive — a 1-byte change yields a different hash", () => {
    const a = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const b = Buffer.from([0x01, 0x02, 0x03, 0x05]);
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });

  it("returns a 64-char lowercase hex string", () => {
    expect(sha256Hex(Buffer.from("x"))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes an empty buffer to the known SHA-256 empty digest", () => {
    expect(sha256Hex(Buffer.alloc(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
