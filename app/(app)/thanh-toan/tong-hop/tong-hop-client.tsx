"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AggregateRow, PaymentCategory } from "@/lib/payment/payment-service";

const CATEGORY_LABEL: Record<PaymentCategory, string> = {
  vat_tu: "Vật tư",
  nhan_cong: "Nhân công",
  dich_vu: "Dịch vụ",
  khac: "Khác",
};

const CATEGORIES: PaymentCategory[] = ["vat_tu", "nhan_cong", "dich_vu", "khac"];

interface EntityMeta {
  id: number;
  name: string;
}

// Cell key: `${category}_${entityId}_${'deNghi'|'duyet'}`
type CellKey = string;

interface PivotRow {
  supplierId: number;
  supplierName: string;
  cells: Record<CellKey, number>;
  totals: { deNghi: number; duyet: number };
}

function uniqueEntities(rows: AggregateRow[]): EntityMeta[] {
  const m = new Map<number, string>();
  for (const r of rows) m.set(r.entityId, r.entityName);
  return [...m.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function makeCells(entities: EntityMeta[]): Record<CellKey, number> {
  const result: Record<CellKey, number> = {};
  for (const cat of CATEGORIES) {
    for (const en of entities) {
      result[`${cat}_${en.id}_deNghi`] = 0;
      result[`${cat}_${en.id}_duyet`] = 0;
    }
  }
  return result;
}

function buildPivot(rows: AggregateRow[], entities: EntityMeta[]): PivotRow[] {
  const m = new Map<number, PivotRow>();
  for (const r of rows) {
    let p = m.get(r.supplierId);
    if (!p) {
      p = {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        cells: makeCells(entities),
        totals: { deNghi: 0, duyet: 0 },
      };
      m.set(r.supplierId, p);
    }
    const cat = r.category as PaymentCategory;
    p.cells[`${cat}_${r.entityId}_deNghi`] += r.soDeNghi;
    p.cells[`${cat}_${r.entityId}_duyet`] += r.soDuyet;
    p.totals.deNghi += r.soDeNghi;
    p.totals.duyet += r.soDuyet;
  }
  return [...m.values()].sort((a, b) =>
    a.supplierName.localeCompare(b.supplierName, "vi")
  );
}

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

export function TongHopClient({ month, rows }: { month: string; rows: AggregateRow[] }) {
  const router = useRouter();
  const [m, setM] = useState(month);

  const entities = uniqueEntities(rows);
  const pivot = buildPivot(rows, entities);

  // Grand totals
  const grandCells = makeCells(entities);
  const grandTotals = { deNghi: 0, duyet: 0 };
  for (const p of pivot) {
    for (const cat of CATEGORIES) {
      for (const en of entities) {
        grandCells[`${cat}_${en.id}_deNghi`] += p.cells[`${cat}_${en.id}_deNghi`];
        grandCells[`${cat}_${en.id}_duyet`] += p.cells[`${cat}_${en.id}_duyet`];
      }
    }
    grandTotals.deNghi += p.totals.deNghi;
    grandTotals.duyet += p.totals.duyet;
  }

  function apply() {
    router.push(`/thanh-toan/tong-hop?month=${m}`);
  }

  function exportExcel() {
    window.location.href = `/api/thanh-toan/tong-hop/export?month=${m}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tổng hợp thanh toán tháng</h1>
        <Button onClick={exportExcel} disabled={pivot.length === 0}>
          Export Excel
        </Button>
      </div>

      <div className="flex items-end gap-3 rounded-md border bg-card p-3">
        <div>
          <label className="text-xs text-muted-foreground">Tháng</label>
          <Input type="month" value={m} onChange={(e) => setM(e.target.value)} />
        </div>
        <Button variant="outline" onClick={apply}>
          Xem
        </Button>
      </div>

      {pivot.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">
          Chưa có đợt nào được duyệt trong tháng này.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              {/* Row 1: fixed cols + category groups (each spans N entities × 2 metrics) + Totals */}
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 border bg-muted/50 px-2 py-2 text-left"
                >
                  STT
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-8 border bg-muted/50 px-2 py-2 text-left"
                >
                  Đơn vị TT
                </th>
                {CATEGORIES.map((cat) => (
                  <th
                    key={cat}
                    colSpan={entities.length * 2}
                    className="border px-2 py-2 text-center"
                  >
                    {CATEGORY_LABEL[cat]}
                  </th>
                ))}
                <th colSpan={2} className="border px-2 py-2 text-center">
                  Tổng
                </th>
              </tr>
              {/* Row 2: entity × metric sub-headers per category + Totals sub-headers */}
              <tr>
                {CATEGORIES.map((cat) =>
                  entities.map((en) => (
                    <Fragment key={`${cat}_${en.id}`}>
                      <th className="border px-2 py-1 text-right text-nowrap">
                        {en.name} — Đề nghị
                      </th>
                      <th className="border px-2 py-1 text-right text-nowrap">
                        {en.name} — Duyệt
                      </th>
                    </Fragment>
                  ))
                )}
                <th className="border px-2 py-1 text-right">Đề nghị</th>
                <th className="border px-2 py-1 text-right">Duyệt</th>
              </tr>
            </thead>
            <tbody>
              {pivot.map((p, i) => (
                <tr key={p.supplierId} className="border-t">
                  <td className="sticky left-0 border bg-background px-2 py-2">{i + 1}</td>
                  <td className="sticky left-8 border bg-background px-2 py-2 whitespace-nowrap">
                    {p.supplierName}
                  </td>
                  {CATEGORIES.map((cat) =>
                    entities.map((en) => (
                      <Fragment key={`${cat}_${en.id}`}>
                        <td className="border px-2 py-2 text-right">
                          {fmt(p.cells[`${cat}_${en.id}_deNghi`])}
                        </td>
                        <td className="border px-2 py-2 text-right">
                          {fmt(p.cells[`${cat}_${en.id}_duyet`])}
                        </td>
                      </Fragment>
                    ))
                  )}
                  <td className="border px-2 py-2 text-right font-medium">
                    {fmt(p.totals.deNghi)}
                  </td>
                  <td className="border px-2 py-2 text-right font-medium">
                    {fmt(p.totals.duyet)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-medium">
              <tr>
                <td
                  colSpan={2}
                  className="sticky left-0 border bg-muted/30 px-2 py-2 text-right"
                >
                  Tổng
                </td>
                {CATEGORIES.map((cat) =>
                  entities.map((en) => (
                    <Fragment key={`${cat}_${en.id}`}>
                      <td className="border px-2 py-2 text-right">
                        {fmt(grandCells[`${cat}_${en.id}_deNghi`])}
                      </td>
                      <td className="border px-2 py-2 text-right">
                        {fmt(grandCells[`${cat}_${en.id}_duyet`])}
                      </td>
                    </Fragment>
                  ))
                )}
                <td className="border px-2 py-2 text-right">{fmt(grandTotals.deNghi)}</td>
                <td className="border px-2 py-2 text-right">{fmt(grandTotals.duyet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
