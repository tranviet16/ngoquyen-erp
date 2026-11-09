/**
 * Parse lại gói theo ánh xạ (thuần): lựa chọn ngày (`date:` → "yyyy-mm-dd") và khóa cặp khử trùng
 * phiếu theo NCC × công trình đã giải (để một phiếu ghi ở hai file — tiểu mục "Cộng Trại Chuối" của
 * file DCX và file thư mục Trại Chuối — chỉ còn một). Tên nguồn không phụ thuộc lựa chọn ngày, nên
 * ánh xạ được giải trên bản parse gốc rồi mới parse lại.
 */

import type { ImportMapping } from "../adapter-types";
import { parseCutoverBundle } from "./cutover-bundle-parser";
import { defaultPairKey, type PairKeyFn } from "./delivery-dedupe";
import { refKey } from "./mapping-keys";
import type { NameResolution } from "./name-resolution";
import type { BundleFile, CutoverBundleParseResult, DateChoices } from "./types";

export function dateChoicesOf(mapping: ImportMapping): DateChoices {
  const choices: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (key.startsWith("date:") && typeof value === "string") choices[key] = value;
  }
  return choices;
}

export function pairKeyFnFor(names: NameResolution): PairKeyFn {
  return (d) => {
    const sRef = names.supplier(d.supplierHint);
    const pRef = d.project.kind === "folder" ? names.projectFolder(d.project.name) : names.projectLabel(d.project.name);
    if (!sRef || !pRef || pRef === "skip") return defaultPairKey(d);
    return `${refKey(sRef)}|${refKey(pRef)}`;
  };
}

/** Khóa ghi nhớ: lựa chọn ngày + đích NCC / công trình của phiếu (thứ duy nhất làm parse đổi). */
export function parseMemoKey(names: NameResolution, mapping: ImportMapping): string {
  const targets = names.entries
    .filter((e) => e.kind === "supplier" || e.kind === "project-folder" || e.kind === "project-label")
    .map((e) => `${e.key}=${String(e.effective)}`)
    .sort();
  return JSON.stringify([Object.entries(dateChoicesOf(mapping)).sort(), targets]);
}

export function parseWithMapping(
  files: readonly BundleFile[],
  names: NameResolution,
  mapping: ImportMapping,
): CutoverBundleParseResult {
  return parseCutoverBundle(files, { dateChoices: dateChoicesOf(mapping), pairKeyOf: pairKeyFnFor(names) });
}
