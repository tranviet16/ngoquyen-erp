"use client";

import { useMemo, useState } from "react";
import type { MappingValue } from "@/lib/import/adapters/adapter-types";
import type { NameKind } from "@/lib/import/adapters/vat-tu-chuyen-doi/mapping-keys";
import type { CatalogView, MappingEntryView } from "@/lib/import/adapters/vat-tu-chuyen-doi/review-payload-types";
import { DataTable, Section, type Column, type DraftProps } from "./cutover-review-ui";

const KIND_LABEL: Record<NameKind, string> = {
  entity: "Chủ thể",
  supplier: "NCC",
  project: "Công trình (Nhập Liệu / Số Dư)",
  "project-csv": "Công trình (CSV)",
  "project-folder": "Công trình (thư mục)",
  "project-label": "Công trình (nhãn / tiểu mục)",
  item: "Vật tư",
};

type CatalogKind = "entity" | "supplier" | "project" | "item";
const catalogKind = (kind: NameKind): CatalogKind =>
  kind === "entity" || kind === "supplier" || kind === "item" ? kind : "project";

const PAGE = 100;

function encode(v: MappingValue | undefined): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  return typeof v === "number" ? `id:${v}` : `s:${v}`;
}

function decode(s: string): MappingValue | undefined {
  if (s === "") return undefined;
  if (s === "null") return null;
  return s.startsWith("id:") ? Number(s.slice(3)) : s.slice(2);
}

/** Tên nguồn để "Tạo mới" (khóa `project:` hiển thị "tên @ Chủ thể"). */
function sourceName(entry: MappingEntryView): string {
  return entry.kind === "project" ? entry.display.split(" @ ")[0] : entry.display;
}

function catalogOptions(catalog: CatalogView, kind: CatalogKind): { id: number; label: string }[] {
  switch (kind) {
    case "entity":
      return catalog.entities.map((e) => ({ id: e.id, label: e.name }));
    case "supplier":
      return catalog.suppliers.map((s) => ({ id: s.id, label: s.name }));
    case "item":
      return catalog.items.map((i) => ({ id: i.id, label: `${i.name} [${i.unit}]` }));
    case "project":
      return catalog.projects.map((p) => ({ id: p.id, label: `${p.name} · ${p.code}${p.entityName ? ` · ${p.entityName}` : " · chưa có Chủ thể"}` }));
  }
}

function TargetPicker({
  entry,
  value,
  catalog,
  labels,
  setValue,
  editable,
}: {
  entry: MappingEntryView;
  value: MappingValue | undefined;
  catalog: CatalogView;
  labels: Map<number, string>;
  setValue: DraftProps["setValue"];
  editable: boolean;
}) {
  const options: { value: string; label: string }[] = [{ value: "", label: "— chưa chọn —" }];
  const seen = new Set<string>([""]);
  const add = (v: string, label: string) => {
    if (seen.has(v)) return;
    seen.add(v);
    options.push({ value: v, label });
  };
  for (const c of entry.candidates) add(`id:${c.id}`, `${c.name} (#${c.id}) · ${Math.round(c.score * 100)}%`);
  if (typeof value === "number") add(`id:${value}`, `${labels.get(value) ?? "?"} (#${value})`);
  add("s:new", `Tạo mới «${sourceName(entry)}»`);
  if (entry.kind !== "project" && catalogKind(entry.kind) === "project") {
    for (const p of catalog.newProjects) add(`s:new:${p.name}`, `Công trình sẽ tạo: ${p.name}${p.entityName ? ` · ${p.entityName}` : ""}`);
  }
  if (typeof value === "string" && value.startsWith("new:")) add(`s:${value}`, `Tạo mới «${value.slice(4)}»`);
  if (entry.allowSplit || (entry.kind === "project" && /cdc/i.test(entry.display))) add("s:split", "Tách CDC theo CSV (J / P)");
  if (entry.allowSkip) add("null", entry.kind === "item" ? "Không gắn vật tư" : "Bỏ qua");
  add("__custom", "Tạo mới với tên khác…");

  const kind = catalogKind(entry.kind);
  return (
    <div className="flex flex-col gap-1 min-w-[16rem]">
      <select
        className="border rounded px-1 py-0.5 bg-background"
        value={encode(value)}
        disabled={!editable}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            const name = window.prompt("Tên bản ghi mới", sourceName(entry))?.trim();
            if (name) setValue(entry.key, `new:${name}`);
            return;
          }
          setValue(entry.key, decode(e.target.value));
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {editable && (
        <input
          className="border rounded px-1 py-0.5 bg-background"
          list={`cutover-dl-${kind}`}
          placeholder="Tìm trong danh mục…"
          onChange={(e) => {
            const m = /#(\d+)$/.exec(e.target.value.trim());
            if (m) {
              setValue(entry.key, Number(m[1]));
              e.target.value = "";
            }
          }}
        />
      )}
    </div>
  );
}

export function MappingSection({ entries, catalog, draft, setValue, editable }: DraftProps & { entries: MappingEntryView[]; catalog: CatalogView }) {
  const [kind, setKind] = useState<NameKind | "all">("all");
  const [onlyTodo, setOnlyTodo] = useState(true);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const labels = useMemo(() => {
    const maps: Record<CatalogKind, Map<number, string>> = { entity: new Map(), supplier: new Map(), project: new Map(), item: new Map() };
    for (const k of ["entity", "supplier", "project", "item"] as const) {
      for (const o of catalogOptions(catalog, k)) maps[k].set(o.id, o.label);
    }
    return maps;
  }, [catalog]);

  const todo = (e: MappingEntryView) => e.issue !== null || draft[e.key] === undefined;
  const q = query.trim().toLowerCase();
  const filtered = entries.filter(
    (e) =>
      (kind === "all" || e.kind === kind) &&
      (!onlyTodo || todo(e)) &&
      (!q || e.display.toLowerCase().includes(q) || e.key.includes(q)),
  );

  const columns: Column<MappingEntryView>[] = [
    { key: "kind", label: "Loại", accessor: (e) => KIND_LABEL[e.kind] },
    {
      key: "display",
      label: "Tên nguồn",
      accessor: (e) => e.display,
      render: (e) => (
        <div>
          <div className="font-medium">{e.display}</div>
          {e.variants.length > 0 && <div className="text-muted-foreground">cũng viết: {e.variants.join("; ")}</div>}
          {e.unit && <div className="text-muted-foreground">ĐVT: {e.unit}</div>}
        </div>
      ),
    },
    { key: "uses", label: "Nơi gặp", kind: "number", accessor: (e) => e.uses, render: (e) => `${e.sources.join(", ")} · ${e.uses}` },
    {
      key: "target",
      label: "Đích",
      accessor: (e) => encode(draft[e.key]),
      render: (e) => (
        <TargetPicker entry={e} value={draft[e.key]} catalog={catalog} labels={labels[catalogKind(e.kind)]} setValue={setValue} editable={editable} />
      ),
    },
    {
      key: "status",
      label: "Trạng thái",
      accessor: (e) => (e.issue ? 0 : e.auto ? 1 : 2),
      render: (e) =>
        e.issue ? (
          <span className="text-red-700 dark:text-red-300">{e.issue}</span>
        ) : e.auto && draft[e.key] === e.effective ? (
          <span className="text-blue-700 dark:text-blue-300">tự điền</span>
        ) : (
          <span className="text-green-700 dark:text-green-300">đã chọn</span>
        ),
    },
  ];

  const todoCount = entries.filter(todo).length;
  return (
    <Section title="3. Ánh xạ tên" count={entries.length}>
      <p className="text-muted-foreground">
        Tự điền chỉ khi tên trùng khít một bản ghi. NCC, công trình, Chủ thể không được bỏ qua. Công trình mới nhận Chủ thể từ dòng Nhập
        Liệu / Số Dư; công trình đã có phải có Chủ thể. Còn {todoCount} khóa cần xử lý.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select className="border rounded px-2 py-1 bg-background" value={kind} onChange={(e) => setKind(e.target.value as NameKind | "all")}>
          <option value="all">Tất cả loại</option>
          {(Object.keys(KIND_LABEL) as NameKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} /> Chỉ khóa cần xử lý
        </label>
        <input className="border rounded px-2 py-1 bg-background" placeholder="Lọc theo tên…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {(["entity", "supplier", "project", "item"] as const).map((k) => (
        <datalist key={k} id={`cutover-dl-${k}`}>
          {catalogOptions(catalog, k).map((o) => (
            <option key={o.id} value={`${o.label} #${o.id}`} />
          ))}
        </datalist>
      ))}
      <DataTable rows={filtered.slice(0, limit)} columns={columns} rowKey={(e) => e.key} empty="Không có khóa nào theo bộ lọc." maxHeight="max-h-[40rem]" />
      {filtered.length > limit && (
        <button type="button" className="text-blue-600 hover:underline" onClick={() => setLimit((n) => n + PAGE)}>
          Hiện thêm ({filtered.length - limit} khóa)
        </button>
      )}
    </Section>
  );
}
