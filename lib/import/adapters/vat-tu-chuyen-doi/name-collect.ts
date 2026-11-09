/**
 * Gom mọi tên nguồn cần ánh xạ từ kết quả parse: Chủ thể, NCC, công trình (Nhập Liệu / Số Dư theo
 * Chủ thể, CSV, thư mục, tiểu mục / nhãn gộp của khối neo) và vật tư. Mỗi khóa (tên chuẩn hóa) giữ
 * tên hiển thị đầu tiên, các cách viết khác, nơi xuất hiện, số lần dùng. Module thuần.
 */

import { anchorLabelMembers, selectAnchorBlock } from "./anchor-blocks";
import { normKey } from "./cell-reader";
import { nameKey, projectKey, type NameKind } from "./mapping-keys";
import type { CutoverBundleParseResult, TrackingDelivery } from "./types";

export type NameSource = "Nhập Liệu" | "Số Dư" | "CSV" | "File theo dõi" | "Neo V1";

export interface SourceName {
  key: string;
  kind: NameKind;
  display: string;
  variants: string[];
  sources: NameSource[];
  uses: number;
  /** Khóa `project:` — tên công trình và Chủ thể của dòng nguồn. */
  projectName: string | null;
  entityName: string | null;
  /** Vật tư: đếm ĐVT theo phiếu (khóa chữ thường → [hiển thị, số lần]). */
  units: Map<string, [string, number]>;
  /** Vật tư xuất hiện trong phiếu của file theo dõi (bắt buộc có vật tư). */
  requiredItem: boolean;
}

/** Nhãn công trình kiểu CDC ("CDC", "Tân lộc CDC", "ĐVP -CDC", "ĐVP CDC"). */
export function isCdcLabel(name: string | null | undefined): boolean {
  const tokens = normKey(name).replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  return tokens.includes("cdc");
}

class NameCollector {
  readonly names = new Map<string, SourceName>();

  add(kind: NameKind, key: string, display: string, source: NameSource): SourceName {
    let entry = this.names.get(key);
    if (!entry) {
      entry = {
        key,
        kind,
        display,
        variants: [],
        sources: [],
        uses: 0,
        projectName: null,
        entityName: null,
        units: new Map(),
        requiredItem: false,
      };
      this.names.set(key, entry);
    } else if (display !== entry.display && !entry.variants.includes(display)) {
      entry.variants.push(display);
    }
    entry.uses += 1;
    if (!entry.sources.includes(source)) entry.sources.push(source);
    return entry;
  }

  simple(kind: NameKind, name: string | null | undefined, source: NameSource): SourceName | null {
    if (!name || !name.trim()) return null;
    return this.add(kind, nameKey(kind, name), name, source);
  }

  project(projectName: string, entityName: string, source: NameSource): void {
    const entry = this.add("project", projectKey(projectName, entityName), `${projectName} @ ${entityName}`, source);
    entry.projectName ??= projectName;
    entry.entityName ??= entityName;
  }

  delivery(d: TrackingDelivery): void {
    this.simple("supplier", d.supplierHint, "File theo dõi");
    this.simple(d.project.kind === "folder" ? "project-folder" : "project-label", d.project.name, "File theo dõi");
    const item = this.simple("item", d.itemName, "File theo dõi");
    if (!item) return;
    item.requiredItem = true;
    if (d.unit) {
      const unitKey = d.unit.trim().toLowerCase();
      const cur = item.units.get(unitKey);
      item.units.set(unitKey, [cur?.[0] ?? d.unit.trim(), (cur?.[1] ?? 0) + 1]);
    }
  }
}

export function collectSourceNames(parse: CutoverBundleParseResult): Map<string, SourceName> {
  const c = new NameCollector();
  for (const row of parse.mainFile?.nhapLieu.rows ?? []) {
    c.simple("entity", row.entityName, "Nhập Liệu");
    c.simple("supplier", row.supplierName, "Nhập Liệu");
    if (row.projectName) c.project(row.projectName, row.entityName, "Nhập Liệu");
    c.simple("item", row.itemName, "Nhập Liệu");
  }
  for (const row of parse.mainFile?.openingBalances ?? []) {
    c.simple("entity", row.entityName, "Số Dư");
    c.simple("supplier", row.supplierName, "Số Dư");
    c.project(row.projectName, row.entityName, "Số Dư");
  }
  for (const row of parse.csv?.rows ?? []) {
    c.simple("supplier", row.supplierName, "CSV");
    c.simple("project-csv", row.projectName, "CSV");
  }
  for (const file of parse.trackingFiles) {
    c.simple("supplier", file.supplierHint, "File theo dõi");
    if (file.folder) c.simple("project-folder", file.folder, "File theo dõi");
    for (const d of file.deliveries) c.delivery(d);
    for (const d of file.dailyRows) c.delivery(d);
    const anchor = selectAnchorBlock(file);
    const members = anchor ? anchorLabelMembers(anchor) : null;
    for (const member of members ?? []) c.simple("project-label", member, "Neo V1");
  }
  return c.names;
}

/** ĐVT dùng nhiều nhất của vật tư (null khi không có phiếu). */
export function dominantUnit(entry: SourceName): string | null {
  let best: [string, number] | null = null;
  for (const v of entry.units.values()) if (!best || v[1] > best[1]) best = v;
  return best?.[0] ?? null;
}
