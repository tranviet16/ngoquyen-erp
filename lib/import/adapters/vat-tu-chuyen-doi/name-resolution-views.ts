/**
 * Dựng phần hiển thị của ánh xạ tên cho màn xem trước: giá trị đã lưu / đang áp dụng, ứng viên
 * gần đúng (chỉ để gợi ý, không bao giờ tự điền), danh mục đầy đủ để chọn. Module thuần.
 */

import type { ImportMapping, MappingValue } from "../adapter-types";
import { normKey } from "./cell-reader";
import { refToValue, type NameKind, type Ref } from "./mapping-keys";
import { dominantUnit, type SourceName } from "./name-collect";
import type { Catalog, NewMasterData } from "./plan-types";
import type { CandidateView, CatalogView, MappingEntryView } from "./review-payload-types";

export interface EntryState {
  entry: SourceName;
  ref: Ref | null;
  split: boolean;
  skip: boolean;
  /** Giá trị đang áp dụng là tự điền. */
  auto: boolean;
  issue: string | null;
}

const MAX_CANDIDATES = 5;

function tokens(text: string): Set<string> {
  return new Set(normKey(text).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean));
}

/** Điểm trùng từ (bỏ dấu) 0..1 — chỉ để xếp gợi ý. */
export function tokenScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits += 1;
  const denom = Math.max(ta.size, tb.size);
  return denom === 0 ? 0 : hits / denom;
}

function candidatesFor(text: string, list: readonly { id: number; name: string }[]): CandidateView[] {
  return list
    .map((r) => ({ id: r.id, name: r.name, score: Math.round(tokenScore(text, r.name) * 100) / 100 }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "vi"))
    .slice(0, MAX_CANDIDATES);
}

function catalogFor(kind: NameKind, catalog: Catalog): readonly { id: number; name: string }[] {
  if (kind === "entity") return catalog.entities;
  if (kind === "supplier") return catalog.suppliers;
  if (kind === "item") return catalog.items;
  return catalog.projects;
}

function effectiveValue(state: EntryState): MappingValue | undefined {
  const display = state.entry.kind === "project" ? (state.entry.projectName ?? state.entry.display) : state.entry.display;
  if (state.split) return "split";
  if (state.skip) return null;
  return state.ref ? refToValue(state.ref, display) : undefined;
}

export function buildEntryViews(
  states: ReadonlyMap<string, EntryState>,
  catalog: Catalog,
  mapping: ImportMapping,
): MappingEntryView[] {
  const views: MappingEntryView[] = [];
  for (const state of states.values()) {
    const { entry } = state;
    const searchText = entry.kind === "project" ? (entry.projectName ?? entry.display) : entry.display;
    views.push({
      key: entry.key,
      kind: entry.kind,
      display: entry.display,
      variants: entry.variants,
      sources: entry.sources,
      uses: entry.uses,
      stored: Object.hasOwn(mapping, entry.key) ? mapping[entry.key] : undefined,
      effective: effectiveValue(state),
      auto: state.auto,
      allowSkip: entry.kind === "item" || entry.kind === "project-csv" || entry.kind === "project-label",
      allowSplit: entry.kind === "project" && state.split,
      entityName: entry.entityName,
      unit: entry.kind === "item" ? dominantUnit(entry) : null,
      candidates: candidatesFor(searchText, catalogFor(entry.kind, catalog)),
      issue: state.issue,
    });
  }
  return views;
}

export function catalogView(
  catalog: Catalog,
  newMaster: NewMasterData,
  projectEntityName: (ref: Ref) => string | null,
): CatalogView {
  const entityName = new Map(catalog.entities.map((e) => [e.id, e.name]));
  return {
    entities: catalog.entities.map(({ id, name }) => ({ id, name })),
    suppliers: catalog.suppliers.map(({ id, name }) => ({ id, name })),
    projects: catalog.projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      entityName: p.entityId != null ? (entityName.get(p.entityId) ?? null) : null,
    })),
    items: catalog.items.map(({ id, name, unit }) => ({ id, name, unit })),
    newProjects: newMaster.projects.map((p) => ({ name: p.name, entityName: projectEntityName(p.ref) })),
  };
}
