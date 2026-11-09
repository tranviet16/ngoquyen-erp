/**
 * Giải ánh xạ tên → bản ghi ERP (có sẵn hoặc tạo mới) theo `mapping` và danh mục đã đọc.
 *
 * - Khóa chưa chọn: tự điền khi đúng một bản ghi trùng tên chuẩn hóa; vật tư của phiếu mặc định tạo
 *   mới theo tên, vật tư chỉ có ở Nhập Liệu mặc định không gắn; công trình "CDC" mặc định tách. NCC,
 *   công trình, Chủ thể không có "bỏ qua".
 * - Cấm tạo trùng tên đang có. Nhiều tên nguồn về cùng một đích là hợp lệ (cộng dồn); tạo mới cùng
 *   tên trong một lần chạy là một bản ghi.
 * - Công trình mới nhận Chủ thể từ khóa `project:<tên>@<Chủ thể>`, hoặc từ dòng CDC của Số Dư khi
 *   là đích tách CDC. Công trình đã có mà chưa có Chủ thể, hoặc khác Chủ thể của dòng nguồn → chặn.
 * Module thuần.
 */

import type { ImportMapping } from "../adapter-types";
import { normKey } from "./cell-reader";
import {
  cdcDecisionKey,
  idRef,
  nameKey,
  newRef,
  normName,
  projectKey,
  readNameValue,
  refKey,
  sameRef,
  type NameKind,
  type Ref,
} from "./mapping-keys";
import { dominantUnit, isCdcLabel, type SourceName } from "./name-collect";
import { buildEntryViews, catalogView, type EntryState } from "./name-resolution-views";
import type { Catalog, NewMasterData, NewProjectSpec } from "./plan-types";
import type { CatalogView, MappingEntryView } from "./review-payload-types";
import type { CutoverBundleParseResult } from "./types";

export type ProjectTarget = { kind: "ref"; ref: Ref } | { kind: "split" };

export interface NameResolution {
  entries: MappingEntryView[];
  /** Tên chưa ánh xạ / ánh xạ sai. */
  mappingBlocking: string[];
  /** Công trình chưa có Chủ thể / lệch Chủ thể. */
  entityBlocking: string[];
  entity(name: string): Ref | null;
  supplier(name: string): Ref | null;
  project(projectName: string, entityName: string): ProjectTarget | null;
  projectCsv(label: string): Ref | "skip" | null;
  projectFolder(folder: string): Ref | null;
  projectLabel(label: string): Ref | "skip" | null;
  item(name: string): Ref | "none" | null;
  /** Chủ thể của công trình (có sẵn: entityId; mới: theo khóa / CDC). */
  projectEntity(ref: Ref): Ref | null;
  label(kind: "entity" | "supplier" | "project" | "item", ref: Ref): string;
  newMaster: NewMasterData;
  catalogView: CatalogView;
}

interface Named {
  id: number;
  name: string;
}

function indexByNorm<T extends Named>(list: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of list) {
    const k = normName(row.name);
    const cur = map.get(k);
    if (cur) cur.push(row);
    else map.set(k, [row]);
  }
  return map;
}

const KIND_CATALOG: Record<NameKind, keyof Catalog> = {
  entity: "entities",
  supplier: "suppliers",
  item: "items",
  project: "projects",
  "project-csv": "projects",
  "project-folder": "projects",
  "project-label": "projects",
};

const PROJECT_KINDS: readonly NameKind[] = ["project-csv", "project-folder", "project-label"];

function allowSkip(kind: NameKind): boolean {
  return kind === "item" || kind === "project-csv" || kind === "project-label";
}

/** Tên nguồn để tạo mới / so trùng (khóa `project:` dùng tên công trình, không gồm Chủ thể). */
function sourceDisplay(entry: SourceName): string {
  return entry.kind === "project" ? (entry.projectName ?? entry.display) : entry.display;
}

export function resolveNames(
  names: ReadonlyMap<string, SourceName>,
  parse: CutoverBundleParseResult,
  mapping: ImportMapping,
  catalog: Catalog,
): NameResolution {
  const byNorm = {
    entities: indexByNorm(catalog.entities),
    suppliers: indexByNorm(catalog.suppliers),
    projects: indexByNorm(catalog.projects),
    items: indexByNorm(catalog.items),
  };
  const byId = {
    entities: new Map(catalog.entities.map((r) => [r.id, r])),
    suppliers: new Map(catalog.suppliers.map((r) => [r.id, r])),
    projects: new Map(catalog.projects.map((r) => [r.id, r])),
    items: new Map(catalog.items.map((r) => [r.id, r])),
  };
  const states = new Map<string, EntryState>();
  const newProjects = new Map<string, { spec: NewProjectSpec; hints: Map<string, Ref> }>();
  const mappingBlocking: string[] = [];
  const entityBlocking: string[] = [];

  function registerNewProject(ref: Ref, hint: Ref | null): void {
    if (ref.kind !== "new") return;
    let cur = newProjects.get(ref.norm);
    if (!cur) {
      const dup = byNorm.projects.get(ref.norm);
      if (dup?.length) {
        mappingBlocking.push(`Công trình mới «${ref.name}» trùng công trình đang có (#${dup[0].id}) — chọn công trình đó thay vì tạo mới`);
        return;
      }
      newProjects.set(ref.norm, (cur = { spec: { ref, name: ref.name, entityRef: null }, hints: new Map() }));
    }
    if (hint) cur.hints.set(refKey(hint), hint);
  }

  /** Đọc giá trị đã lưu của một khóa (chưa xét tự điền). */
  function explicit(entry: SourceName): EntryState {
    const table = KIND_CATALOG[entry.kind];
    const value = readNameValue(mapping[entry.key]);
    const base: EntryState = { entry, ref: null, split: false, skip: false, auto: false, issue: null };
    switch (value.kind) {
      case "id":
        if (!byId[table].has(value.id)) return { ...base, issue: `#${value.id} không tồn tại hoặc đã xóa` };
        return { ...base, ref: idRef(value.id) };
      case "new": {
        const ref = newRef(value.name ?? sourceDisplay(entry));
        const dup = byNorm[table].get(ref.norm);
        if (dup?.length) {
          return { ...base, issue: `Tên «${ref.name}» trùng bản ghi đang có (#${dup[0].id}) — chọn bản ghi đó thay vì tạo mới` };
        }
        return { ...base, ref };
      }
      case "split":
        return entry.kind === "project" && isCdcLabel(entry.projectName)
          ? { ...base, split: true }
          : { ...base, issue: "Chỉ công trình CDC của Số Dư mới tách được" };
      case "skip":
        return allowSkip(entry.kind) ? { ...base, skip: true } : { ...base, issue: "Không được bỏ qua — bỏ qua là mất nợ" };
      case "unset":
        return base;
    }
  }

  /** Tự điền khi chưa chọn: trùng tên khít trong danh mục; mặc định theo loại. */
  function auto(state: EntryState, extraNew: ReadonlyMap<string, Ref> | null): EntryState {
    if (state.ref || state.split || state.skip || state.issue) return state;
    const { entry } = state;
    const exact = byNorm[KIND_CATALOG[entry.kind]].get(normName(sourceDisplay(entry))) ?? [];
    if (exact.length === 1) return { ...state, ref: idRef(exact[0].id), auto: true };
    // Vật tư chỉ có ở Nhập Liệu là tùy chọn: trùng nhiều bản ghi thì mặc định không gắn.
    if (exact.length > 1 && entry.kind === "item" && !entry.requiredItem) return { ...state, skip: true, auto: true };
    if (exact.length > 1) return { ...state, issue: `Có ${exact.length} bản ghi trùng tên — chọn một` };
    const pendingNew = extraNew?.get(normName(sourceDisplay(entry)));
    if (pendingNew) return { ...state, ref: pendingNew, auto: true };
    if (entry.kind === "item") {
      return entry.requiredItem
        ? { ...state, ref: newRef(entry.display), auto: true }
        : { ...state, skip: true, auto: true };
    }
    if (entry.kind === "project" && isCdcLabel(entry.projectName)) return { ...state, split: true, auto: true };
    return { ...state, issue: "Chưa ánh xạ" };
  }

  // 1. Chủ thể, NCC, vật tư.
  for (const entry of names.values()) {
    if (entry.kind === "entity" || entry.kind === "supplier" || entry.kind === "item") {
      states.set(entry.key, auto(explicit(entry), null));
    }
  }
  const lookup = (key: string): Ref | null => states.get(key)?.ref ?? null;
  const entityOf = (name: string) => lookup(nameKey("entity", name));
  const supplierOf = (name: string) => lookup(nameKey("supplier", name));

  // 2. Công trình theo Chủ thể (Nhập Liệu / Số Dư).
  for (const entry of names.values()) {
    if (entry.kind !== "project") continue;
    const state = auto(explicit(entry), null);
    states.set(entry.key, state);
    if (state.ref) registerNewProject(state.ref, entityOf(entry.entityName ?? ""));
  }

  // 3. Công trình CSV / thư mục / nhãn có giá trị đã lưu.
  for (const entry of names.values()) {
    if (!PROJECT_KINDS.includes(entry.kind)) continue;
    const state = explicit(entry);
    states.set(entry.key, state);
    if (state.ref) registerNewProject(state.ref, null);
  }

  // 4. Đích tách CDC nhận Chủ thể của dòng CDC (dòng CSV CDC cùng NCC + quyết định cdc:). Chạy lại sau
  // bước tự điền để đích tự điền cũng nhận Chủ thể (gợi ý là tập theo khóa nên chạy hai lần vô hại).
  const applyCdcHints = () => {
    for (const row of parse.mainFile?.openingBalances ?? []) {
      if (!states.get(projectKey(row.projectName, row.entityName))?.split) continue;
      const sRef = supplierOf(row.supplierName);
      const eRef = entityOf(row.entityName);
      if (!sRef || !eRef) continue;
      for (const csv of parse.csv?.rows ?? []) {
        if (!isCdcLabel(csv.projectName) || !sameRef(supplierOf(csv.supplierName), sRef)) continue;
        const target = states.get(nameKey("project-csv", csv.projectName ?? ""))?.ref;
        if (target) registerNewProject(target, eRef);
      }
      const decision = readNameValue(mapping[cdcDecisionKey(sRef, row.entityName)]);
      if (decision.kind === "new" && decision.name) registerNewProject(newRef(decision.name), eRef);
    }
  };
  applyCdcHints();

  // 5. Tự điền CSV / thư mục / nhãn: trùng tên công trình có sẵn hoặc công trình sẽ tạo.
  const pendingByName = new Map([...newProjects.values()].map((p) => [p.spec.ref.kind === "new" ? p.spec.ref.norm : "", p.spec.ref]));
  for (const entry of names.values()) {
    if (PROJECT_KINDS.includes(entry.kind)) states.set(entry.key, auto(states.get(entry.key) as EntryState, pendingByName));
  }
  applyCdcHints();

  // 6. Chủ thể của công trình mới.
  for (const { spec, hints } of newProjects.values()) {
    const list = [...hints.values()];
    if (list.length === 1) spec.entityRef = list[0];
    else if (list.length === 0) {
      entityBlocking.push(`Công trình mới «${spec.name}» chưa có Chủ thể — tạo qua dòng Nhập Liệu / Số Dư có Chủ thể, hoặc tạo trong Master data > Công trình`);
    } else {
      entityBlocking.push(`Công trình mới «${spec.name}» nhận ${list.length} Chủ thể khác nhau từ các dòng nguồn — tách thành công trình khác tên`);
    }
  }

  const projectEntity = (ref: Ref): Ref | null => {
    if (ref.kind === "new") return newProjects.get(ref.norm)?.spec.entityRef ?? null;
    const p = byId.projects.get(ref.id);
    return p?.entityId != null ? idRef(p.entityId) : null;
  };

  // 7. Công trình có sẵn: phải có Chủ thể; khóa `project:` phải cùng Chủ thể với dòng nguồn.
  const missingEntityReported = new Set<number>();
  for (const state of states.values()) {
    const { entry, ref } = state;
    if (!ref || ref.kind !== "id" || KIND_CATALOG[entry.kind] !== "projects") continue;
    const project = byId.projects.get(ref.id);
    if (!project) continue;
    if (project.entityId == null) {
      if (!missingEntityReported.has(project.id)) {
        missingEntityReported.add(project.id);
        entityBlocking.push(`Công trình «${project.name}» (#${project.id}) chưa có Chủ thể — gán ở Master data > Công trình rồi Lưu & tính lại`);
      }
      continue;
    }
    if (entry.kind !== "project") continue;
    const eRef = entityOf(entry.entityName ?? "");
    if (eRef && (eRef.kind !== "id" || eRef.id !== project.entityId)) {
      const want = byId.entities.get(project.entityId)?.name ?? `#${project.entityId}`;
      entityBlocking.push(`Công trình «${project.name}» thuộc Chủ thể «${want}», nhưng dòng nguồn «${entry.display}» ghi Chủ thể khác`);
    }
  }

  for (const state of states.values()) {
    if (state.issue) mappingBlocking.push(`${state.entry.key}: ${state.issue}`);
  }

  const get = (key: string) => states.get(key);
  const label = (kind: "entity" | "supplier" | "project" | "item", ref: Ref): string => {
    if (ref.kind === "new") return `${ref.name} (mới)`;
    const table = KIND_CATALOG[kind];
    return byId[table].get(ref.id)?.name ?? `#${ref.id}`;
  };

  const newMaster: NewMasterData = { entities: [], suppliers: [], projects: [...newProjects.values()].map((p) => p.spec), items: [] };
  const seen = new Set<string>();
  for (const state of states.values()) {
    const { ref, entry } = state;
    if (!ref || ref.kind !== "new" || seen.has(`${entry.kind}:${ref.norm}`)) continue;
    seen.add(`${entry.kind}:${ref.norm}`);
    if (entry.kind === "entity") {
      newMaster.entities.push({ ref, name: ref.name, type: normKey(ref.name).includes("cong ty") ? "company" : "person" });
    } else if (entry.kind === "supplier") {
      newMaster.suppliers.push({ ref, name: ref.name });
    } else if (entry.kind === "item") {
      const unit = dominantUnit(entry) ?? "-";
      newMaster.items.push({ ref, name: ref.name, unit, type: normKey(unit) === "ca" ? "machine" : "material" });
    }
  }

  return {
    entries: buildEntryViews(states, catalog, mapping),
    mappingBlocking,
    entityBlocking,
    entity: entityOf,
    supplier: supplierOf,
    project: (projectName, entityName) => {
      const s = get(projectKey(projectName, entityName));
      if (!s) return null;
      if (s.split) return { kind: "split" };
      return s.ref ? { kind: "ref", ref: s.ref } : null;
    },
    projectCsv: (labelName) => {
      const s = get(nameKey("project-csv", labelName));
      return s?.skip ? "skip" : (s?.ref ?? null);
    },
    projectFolder: (folder) => get(nameKey("project-folder", folder))?.ref ?? null,
    projectLabel: (labelName) => {
      const s = get(nameKey("project-label", labelName));
      return s?.skip ? "skip" : (s?.ref ?? null);
    },
    item: (itemName) => {
      const s = get(nameKey("item", itemName));
      return s?.skip ? "none" : (s?.ref ?? null);
    },
    projectEntity,
    label,
    newMaster,
    catalogView: catalogView(catalog, newMaster, (ref) => {
      const e = projectEntity(ref);
      return e ? label("entity", e) : null;
    }),
  };
}
