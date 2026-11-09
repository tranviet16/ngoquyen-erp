/**
 * Phần dùng chung của preview và commit: tùy chọn transaction dài, tra adapter, parse lại nguồn
 * đã lưu (`ImportRun.sourceFile`) có kiểm hash.
 */

import type { Prisma } from "@prisma/client";
import { sha256Hex } from "./file-hash";
import { getAdapter } from "./adapters/adapter-registry";
import type { ParsedData, RegisteredImportAdapter } from "./adapters/adapter-types";
import { decodeBundle } from "./file-bundle";
import { ImportError } from "./import-errors";

/** Commit/review chạy thử có thể ghi hàng nghìn dòng; maxWait giới hạn thời gian chờ kết nối. */
export const LONG_TX_OPTIONS = { timeout: 300_000, maxWait: 10_000 } as const;

export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function requireAdapter(name: string): RegisteredImportAdapter {
  const adapter = getAdapter(name);
  if (!adapter) throw new ImportError(`Adapter không tồn tại: ${name}`);
  return adapter;
}

/** Parse lại nguồn đã lưu, kiểm hash khớp run (gói: kiểm cả sha256 từng file). */
export async function parseRunSource(
  adapter: RegisteredImportAdapter,
  source: Buffer,
  run: { fileName: string; fileHash: string },
): Promise<ParsedData> {
  if (adapter.acceptsBundle) {
    const bundle = decodeBundle(source);
    if (bundle.bundleHash !== run.fileHash) throw new ImportError("Gói nguồn đã lưu không khớp hash của run");
    return adapter.parse(source, { fileName: run.fileName, bundle });
  }
  if (sha256Hex(source) !== run.fileHash) throw new ImportError("File nguồn đã lưu không khớp hash của run");
  return adapter.parse(source, { fileName: run.fileName });
}

