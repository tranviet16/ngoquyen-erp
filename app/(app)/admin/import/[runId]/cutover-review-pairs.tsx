"use client";

import { useState } from "react";
import type { CatalogView, CdcView, CsvUnusedView, PairView } from "@/lib/import/adapters/vat-tu-chuyen-doi/review-payload-types";
import { AckBox, DataTable, fmt, moneyColumn, Section, type Column, type DraftProps } from "./cutover-review-ui";

function projectChoice(value: unknown): string {
  if (typeof value === "number") return `id:${value}`;
  return typeof value === "string" ? `s:${value}` : "";
}

export function CdcSection({ rows, catalog, ...draftProps }: DraftProps & { rows: CdcView[]; catalog: CatalogView }) {
  const { draft, setValue, editable } = draftProps;
  if (rows.length === 0) return null;
  return (
    <Section title="4. Tách CDC" count={rows.length}>
      <p className="text-muted-foreground">
        Dòng Số Dư &quot;CDC&quot; của từng (Chủ thể, NCC) tách sang Tân Lộc CDC / ĐVP-CDC theo số còn nợ của CSV (J cho TT, P cho HĐ). Tổng tách lệch
        hoặc CSV thiếu thì chọn công trình nhận phần chênh và xác nhận.
      </p>
      {rows.map((c) => (
        <div key={c.sourceKey} className="border rounded p-3 space-y-2">
          <div className="font-medium">
            {c.supplierName} @ {c.entityName} ({c.sourceKey}) — Số Dư TT {fmt(c.balance.tt)} / HĐ {fmt(c.balance.hd)}
          </div>
          <ul className="list-disc pl-5">
            {c.targets.map((t) => (
              <li key={t.projectName}>
                {t.projectName} {t.csvLabel && <span className="text-muted-foreground">(CSV: {t.csvLabel})</span>}: TT {fmt(t.tt)} / HĐ {fmt(t.hd)}
              </li>
            ))}
          </ul>
          {c.reason && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-amber-700 dark:text-amber-300">
                {c.reason === "missing-csv" ? "CSV không có dòng CDC của NCC." : `Tổng tách lệch Số Dư: TT ${fmt(c.diff.tt)}, HĐ ${fmt(c.diff.hd)}.`}
              </span>
              <label className="inline-flex items-center gap-1">
                Dồn vào
                <select
                  className="border rounded px-1 py-0.5 bg-background"
                  disabled={!editable}
                  value={projectChoice(draft[c.decisionKey])}
                  onChange={(e) => {
                    const v = e.target.value;
                    setValue(c.decisionKey, v === "" ? undefined : v.startsWith("id:") ? Number(v.slice(3)) : v.slice(2));
                  }}
                >
                  <option value="">— chọn công trình —</option>
                  {catalog.newProjects.map((p) => (
                    <option key={p.name} value={`s:new:${p.name}`}>
                      {p.name} (sẽ tạo)
                    </option>
                  ))}
                  {catalog.projects.map((p) => (
                    <option key={p.id} value={`id:${p.id}`}>
                      {p.name} · {p.code}
                    </option>
                  ))}
                </select>
              </label>
              {c.ackCode && <AckBox code={c.ackCode} {...draftProps} />}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

function DecisionRadio({ pair, draft, setValue, editable }: DraftProps & { pair: PairView }) {
  const stored = draft[pair.decisionKey];
  const value = stored === 0 || stored === 1 ? stored : pair.defaultDecision;
  const locked = pair.lockReasons.length > 0;
  return (
    <div className="flex gap-3 whitespace-nowrap">
      {([1, 0] as const).map((v) => (
        <label key={v} className="inline-flex items-center gap-1">
          <input
            type="radio"
            name={pair.decisionKey}
            checked={value === v}
            disabled={!editable || (v === 1 && locked)}
            onChange={() => setValue(pair.decisionKey, v)}
          />
          {v === 1 ? "Lũy kế" : "Ròng"}
        </label>
      ))}
    </div>
  );
}

export function PairsSection({ pairs, csvUnused, ...draftProps }: DraftProps & { pairs: PairView[]; csvUnused: CsvUnusedView[] }) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const differs = (p: PairView) => !p.matchTt || !p.matchHd || p.lockReasons.length > 0 || p.decision !== p.defaultDecision;
  const rows = onlyDiff ? pairs.filter(differs) : pairs;
  const columns: Column<PairView>[] = [
    { key: "supplier", label: "NCC", accessor: (p) => p.supplierName },
    { key: "project", label: "Công trình", accessor: (p) => p.projectName, render: (p) => <>{p.projectName}<div className="text-muted-foreground">{p.entityName ?? "chưa có Chủ thể"}</div></> },
    moneyColumn("sTt", "Số Dư TT", (p) => p.s.tt),
    moneyColumn("sHd", "Số Dư HĐ", (p) => p.s.hd),
    {
      key: "csv",
      label: "CSV G / H+I / M / N",
      accessor: (p) => p.csv?.lhTt ?? null,
      render: (p) =>
        p.csv ? (
          <div className="tabular-nums">
            {fmt(p.csv.lhTt)} / {fmt(p.csv.paidTt)}
            <br />
            {fmt(p.csv.lhHd)} / {fmt(p.csv.paidHd)}
          </div>
        ) : (
          <span className="text-muted-foreground">không có</span>
        ),
    },
    {
      key: "nl",
      label: "NL 2026 LH / Trả",
      accessor: (p) => p.nl2026.lhTt,
      render: (p) => <div className="tabular-nums">{fmt(p.nl2026.lhTt)} / {fmt(p.nl2026.paidTt)}</div>,
    },
    moneyColumn("diffTt", "Lệch TT", (p) => p.diff?.tt),
    moneyColumn("diffHd", "Lệch HĐ", (p) => p.diff?.hd),
    { key: "default", label: "Mặc định", accessor: (p) => p.defaultDecision, render: (p) => (p.defaultDecision === 1 ? "Lũy kế" : "Ròng") },
    { key: "decision", label: "Chọn", accessor: (p) => p.decision, render: (p) => <DecisionRadio pair={p} {...draftProps} /> },
    {
      key: "note",
      label: "Khóa / hậu quả",
      accessor: (p) => p.lockReasons.join("; ") || p.consequence || "",
      render: (p) => (
        <div className="space-y-1">
          {p.lockReasons.map((r) => (
            <div key={r} className="text-muted-foreground">{r}</div>
          ))}
          {p.decision === 1 && p.consequence && <div className="text-amber-700 dark:text-amber-300">{p.consequence}</div>}
          {p.ackCode && <AckBox code={p.ackCode} {...draftProps} />}
        </div>
      ),
    },
  ];
  const csvOnly = pairs.filter((p) => p.csv && !p.hasOpeningRow);
  const sdOnly = pairs.filter((p) => p.hasOpeningRow && !p.csv && (p.s.tt !== 0 || p.s.hd !== 0));
  return (
    <Section title="5. Duyệt từng cặp" count={pairs.length}>
      <p className="text-muted-foreground">
        Kiểm (G − LH26) − (H+I − Trả26) = Số Dư (±1 đồng), HĐ tương tự. Lũy kế: 2 dòng ngày 26/12/2025; ròng: số dư asOf 31/12/2025.
        CSV xuất trước giờ đóng băng làm nhiều cặp lệch — xuất lại CSV đúng giờ đóng băng.
      </p>
      <label className="inline-flex items-center gap-1">
        <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Chỉ dòng lệch
      </label>
      <DataTable rows={rows} columns={columns} rowKey={(p) => p.key} />
      <details>
        <summary className="cursor-pointer">Cặp CSV không có trong Số Dư ({csvOnly.length}) · Cặp có Số Dư mà CSV không có ({sdOnly.length}) · Dòng CSV không dùng ({csvUnused.length})</summary>
        <ul className="list-disc pl-5 mt-2 space-y-0.5">
          {csvOnly.map((p) => (
            <li key={`c-${p.key}`}>CSV không có Số Dư: {p.supplierName} × {p.projectName} (J {fmt((p.csv?.lhTt ?? 0) - (p.csv?.paidTt ?? 0))})</li>
          ))}
          {sdOnly.map((p) => (
            <li key={`s-${p.key}`}>Số Dư không có CSV: {p.supplierName} × {p.projectName} (TT {fmt(p.s.tt)} / HĐ {fmt(p.s.hd)})</li>
          ))}
          {csvUnused.map((c) => (
            <li key={c.sourceKey}>
              {c.sourceKey} {c.supplierName} × {c.projectName ?? "?"} (J {fmt(c.debt.tt)} / P {fmt(c.debt.hd)}): {c.reason}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}
