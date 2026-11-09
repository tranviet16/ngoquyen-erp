import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  BundleError,
  bundleDisplayName,
  computeBundleHash,
  decodeBundle,
  encodeBundle,
  type BundleInputFile,
} from "@/lib/import/file-bundle";
import { BUNDLE_MAX_FILES, BUNDLE_MAX_TOTAL_BYTES, bundleSkipReason, normalizeBundlePath } from "@/lib/import/bundle-path";

const enc = (text: string) => new TextEncoder().encode(text);

function sampleFiles(): BundleInputFile[] {
  return [
    { path: "Quản Lý Công Nợ/Quản Lý Công Nợ Vật Tư.xlsx", data: enc("main") },
    { path: "Quản Lý Công Nợ/Tổng công nợ.csv", data: enc("csv") },
    { path: "Quản Lý Công Nợ/Mầm Non TC1/Thép Hiệu Trần.xlsx", data: enc("tracking") },
  ];
}

describe("encodeBundle / decodeBundle", () => {
  it("is deterministic regardless of the order files were picked", () => {
    const a = encodeBundle(sampleFiles());
    const b = encodeBundle([...sampleFiles()].reverse());
    expect(b.bundleHash).toBe(a.bundleHash);
    expect(b.buffer.equals(a.buffer)).toBe(true);
    expect(a.files.map((f) => f.path)).toEqual([...a.files.map((f) => f.path)].sort());
  });

  it("changes the hash when one file's content changes", () => {
    const base = encodeBundle(sampleFiles());
    const edited = sampleFiles();
    edited[1] = { ...edited[1], data: enc("csv!") };
    expect(encodeBundle(edited).bundleHash).not.toBe(base.bundleHash);
  });

  it("hashes the canonical [[path, sha256], …] list", () => {
    const bundle = encodeBundle(sampleFiles());
    const canonical = JSON.stringify(bundle.files.map((f) => [f.path, f.sha256]));
    expect(bundle.bundleHash).toBe(createHash("sha256").update(canonical).digest("hex"));
    expect(computeBundleHash([...bundle.files].reverse())).toBe(bundle.bundleHash);
  });

  it("round-trips through decodeBundle with verified content", () => {
    const bundle = encodeBundle(sampleFiles());
    const decoded = decodeBundle(bundle.buffer);
    expect(decoded.bundleHash).toBe(bundle.bundleHash);
    expect(decoded.files.map((f) => [f.path, f.buffer.toString("utf8")])).toEqual(
      bundle.files.map((f) => [f.path, f.buffer.toString("utf8")]),
    );
  });

  it("normalizes NFD names to NFC", () => {
    const nfd = "Quản Lý/Thép.xlsx".normalize("NFD");
    const bundle = encodeBundle([{ path: nfd, data: enc("x") }]);
    expect(bundle.files[0].path).toBe("Quản Lý/Thép.xlsx".normalize("NFC"));
  });

  it("skips and lists hidden folders, Excel lock files and other extensions", () => {
    const bundle = encodeBundle([
      ...sampleFiles(),
      { path: "Quản Lý Công Nợ/.claude/agent-memory/a.md", data: enc("memo") },
      { path: "Quản Lý Công Nợ/.claude/x.xlsx", data: enc("hidden") },
      { path: "Quản Lý Công Nợ/~$Quản Lý Công Nợ Vật Tư.xlsx", data: enc("lock") },
      { path: "Quản Lý Công Nợ/ghi chú.pdf", data: enc("pdf") },
    ]);
    expect(bundle.files).toHaveLength(3);
    expect(bundle.skipped).toEqual([
      { path: "Quản Lý Công Nợ/.claude/agent-memory/a.md", reason: "Thư mục / file ẩn" },
      { path: "Quản Lý Công Nợ/.claude/x.xlsx", reason: "Thư mục / file ẩn" },
      { path: "Quản Lý Công Nợ/ghi chú.pdf", reason: "Không phải .xlsx / .csv" },
      { path: "Quản Lý Công Nợ/~$Quản Lý Công Nợ Vật Tư.xlsx", reason: "File tạm của Excel" },
    ]);
    // File bị bỏ qua không làm đổi hash.
    expect(bundle.bundleHash).toBe(encodeBundle(sampleFiles()).bundleHash);
  });

  it("rejects parent-directory segments and control characters", () => {
    expect(() => encodeBundle([{ path: "../x.xlsx", data: enc("x") }])).toThrow(BundleError);
    expect(() => encodeBundle([{ path: "a/../x.xlsx", data: enc("x") }])).toThrow(/"\.\."/);
    expect(() => encodeBundle([{ path: "a/b\u0007.xlsx", data: enc("x") }])).toThrow(/ký tự điều khiển/);
    expect(() => encodeBundle([{ path: "a/b\n.csv", data: enc("x") }])).toThrow(BundleError);
  });

  it("rejects absolute, backslash, empty-segment, duplicate and over-long paths", () => {
    expect(() => normalizeBundlePath("/etc/x.xlsx")).toThrow(/tương đối/);
    expect(() => normalizeBundlePath("C:/x.xlsx")).toThrow(/tương đối/);
    expect(() => normalizeBundlePath("a\\b.xlsx")).toThrow(BundleError);
    expect(() => normalizeBundlePath("a//b.xlsx")).toThrow(/đoạn rỗng/);
    expect(() => normalizeBundlePath(`${"a".repeat(256)}.xlsx`)).toThrow(/260/);
    expect(() =>
      encodeBundle([
        { path: "a/b.xlsx", data: enc("1") },
        { path: "a/b.xlsx", data: enc("2") },
      ]),
    ).toThrow(/Trùng/);
  });

  it("fails when limits are exceeded or nothing usable was picked", () => {
    const tooMany = Array.from({ length: BUNDLE_MAX_FILES + 1 }, (_, i) => ({ path: `d/${i}.csv`, data: enc("x") }));
    expect(() => encodeBundle(tooMany)).toThrow(new RegExp(`tối đa ${BUNDLE_MAX_FILES}`));
    const big = new Uint8Array(BUNDLE_MAX_TOTAL_BYTES + 1);
    expect(() => encodeBundle([{ path: "d/big.xlsx", data: big }])).toThrow(/MB/);
    expect(() => encodeBundle([{ path: "d/readme.md", data: enc("x") }])).toThrow(/không có file/);
  });

  it("decodeBundle rejects tampered content, unsorted entries and foreign paths", () => {
    const bundle = encodeBundle(sampleFiles());
    const json = JSON.parse(bundle.buffer.toString("utf8")) as {
      v: number;
      files: { path: string; size: number; sha256: string; data: string }[];
    };

    const tampered = structuredClone(json);
    tampered.files[0].data = Buffer.from("other").toString("base64");
    expect(() => decodeBundle(Buffer.from(JSON.stringify(tampered)))).toThrow(/sha256/);

    const unsorted = structuredClone(json);
    unsorted.files.reverse();
    expect(() => decodeBundle(Buffer.from(JSON.stringify(unsorted)))).toThrow(/thứ tự/);

    const traversal = structuredClone(json);
    traversal.files[0].path = "../evil.xlsx";
    expect(() => decodeBundle(Buffer.from(JSON.stringify(traversal)))).toThrow(BundleError);

    expect(() => decodeBundle(Buffer.from("not json"))).toThrow(/JSON/);
    expect(() => decodeBundle(Buffer.from(JSON.stringify({ v: 2, files: [] })))).toThrow(/cấu trúc/);
  });
});

describe("bundle helpers", () => {
  it("bundleSkipReason accepts .xlsx/.csv case-insensitively", () => {
    expect(bundleSkipReason("a/B.XLSX")).toBeNull();
    expect(bundleSkipReason("a/b.Csv")).toBeNull();
    expect(bundleSkipReason("a/b.xls")).toBe("Không phải .xlsx / .csv");
  });

  it("bundleDisplayName uses the shared root folder", () => {
    expect(bundleDisplayName(encodeBundle(sampleFiles()).files)).toBe("Quản Lý Công Nợ (3 file)");
    expect(bundleDisplayName(encodeBundle([{ path: "a.csv", data: enc("x") }]).files)).toBe("Gói thư mục (1 file)");
  });
});
