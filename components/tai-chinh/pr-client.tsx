"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Save, SlidersHorizontal, Trash2, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { createPrAdjustment } from "@/lib/tai-chinh/pr-adjustment-service";
import {
  deleteAllPrRowsAction,
  deleteImportedPrAdjustmentsAction,
  deletePrRowsAction,
  excludePrLineAction,
  excludePrLineEntityAction,
  listPayableSyncEntityOptionsAction,
  syncPayablesAction,
  syncReceivablesAction,
  undoSyncAction,
  updateOverrideAction,
} from "@/app/(app)/tai-chinh/phai-thu-tra/actions";

interface ConsolidatedRow {
  id: string;
  source: "material_ledger" | "labor_ledger" | "sl_dt" | "manual";
  sourceLineId: number | null;
  partyName: string;
  partyType: string;
  entityId: number | null;
  entityName: string | null;
  type: "payable" | "receivable";
  amountVnd: string;
  sourceAmountVnd: string | null;
  overrideAmountVnd: string | null;
  periodYear: number | null;
  periodMonth: number | null;
  dueDate: string | null;
  status: string;
  note: string | null;
  isStale: boolean;
}

interface Props {
  rows: ConsolidatedRow[];
}

interface PayableSyncOption {
  entityId: number;
  entityName: string;
  rowCount: number;
  amountVnd: string;
  sourceModules: Array<"material_ledger" | "labor_ledger">;
}

const VND = new Intl.NumberFormat("vi-VN");
const SOURCE_LABELS: Record<string, string> = {
  material_ledger: "Công nợ VT",
  labor_ledger: "Công nợ NC",
  sl_dt: "SL-DT",
  manual: "Điều chỉnh",
};

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  partyType: "other" as "supplier" | "contractor" | "other",
  partyName: "",
  type: "payable" as "payable" | "receivable",
  amountVnd: "",
  dueDate: "",
  note: "",
};

function money(value: string | number | null) {
  return `${VND.format(Number(value ?? 0))} đ`;
}

function periodLabel(period?: { year: number; month: number } | null) {
  return period ? `${period.month}/${period.year}` : "";
}

export function PrClient({ rows }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [filterType, setFilterType] = useState<"" | "payable" | "receivable">("");
  const period = { year: "1", month: "1" };
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [payableSyncOpen, setPayableSyncOpen] = useState(false);
  const [payableSyncOptions, setPayableSyncOptions] = useState<PayableSyncOption[]>([]);
  const [excludedEntityIds, setExcludedEntityIds] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();

  const filtered = filterType ? rows.filter((r) => r.type === filterType) : rows;
  const totals = useMemo(() => ({
    payable: rows.filter((r) => r.type === "payable").reduce((s, r) => s + Number(r.amountVnd), 0),
    receivable: rows.filter((r) => r.type === "receivable").reduce((s, r) => s + Number(r.amountVnd), 0),
    overrideCount: rows.filter((r) => r.overrideAmountVnd != null).length,
  }), [rows]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function runSync(kind: "payable" | "receivable") {
    const y = Number(period.year);
    const m = Number(period.month);
    startTransition(async () => {
      try {
        const result = kind === "payable" ? await syncPayablesAction(y, m) : await syncReceivablesAction(y, m);
        const sourcePeriod = "period" in result
          ? periodLabel(result.period)
          : Object.entries(result.periods).map(([source, p]) => `${source}: ${periodLabel(p)}`).join(", ");
        toast.success(`Đã sync ${result.upserted} dòng từ kỳ gần nhất ${sourcePeriod}${"excluded" in result ? `, loại trừ ${result.excluded}` : ""}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function openPayableSyncDialog() {
    const y = Number(period.year);
    const m = Number(period.month);
    if (!y || !m || m < 1 || m > 12) {
      toast.error("Kỳ sync không hợp lệ");
      return;
    }
    startTransition(async () => {
      try {
        const options = await listPayableSyncEntityOptionsAction();
        setPayableSyncOptions(options);
        setExcludedEntityIds([]);
        setPayableSyncOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function toggleExcludedEntity(entityId: number) {
    setExcludedEntityIds((current) =>
      current.includes(entityId) ? current.filter((id) => id !== entityId) : [...current, entityId],
    );
  }

  function syncPayables() {
    const y = Number(period.year);
    const m = Number(period.month);
    startTransition(async () => {
      try {
        const result = await syncPayablesAction(y, m, excludedEntityIds);
        const sourcePeriod = Object.entries(result.periods).map(([source, p]) => `${source}: ${periodLabel(p)}`).join(", ");
        toast.success(`Đã sync ${result.upserted} dòng từ kỳ gần nhất ${sourcePeriod}${result.excluded ? `, loại trừ ${result.excluded}` : ""}`);
        setPayableSyncOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function undoSync(kind: "payable" | "receivable") {
    startTransition(async () => {
      try {
        const result = await undoSyncAction(kind);
        toast.success(`Đã undo ${result.deleted} dòng sync gần nhất`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function deleteImportedRows() {
    if (!window.confirm("Xóa tất cả dòng Phải thu/Phải trả được lưu từ import? Dòng tạo tay và dòng sync sẽ được giữ lại.")) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await deleteImportedPrAdjustmentsAction();
        toast.success(`Đã xóa ${result.deleted} dòng import`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function deleteAllRows() {
    if (!window.confirm("Xóa toàn bộ các dòng đang hiển thị trong Phải thu/Phải trả? Dòng sync đã xóa sẽ được loại trừ ở các lần sync sau.")) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await deleteAllPrRowsAction();
        toast.success(`Đã xóa ${result.deleted} dòng`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function deleteRow(rowId: string) {
    if (!window.confirm("Xóa dòng Phải thu/Phải trả này?")) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await deletePrRowsAction([rowId]);
        toast.success(`Đã xóa ${result.deleted} dòng`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partyName || !form.amountVnd) {
      toast.error("Nhập đầy đủ thông tin");
      return;
    }
    startTransition(async () => {
      try {
        await createPrAdjustment({ ...form, dueDate: form.dueDate || null, note: form.note || null });
        toast.success("Đã thêm điều chỉnh");
        setDialogOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function saveOverride(lineId: number) {
    const value = overrides[lineId] ?? "";
    startTransition(async () => {
      try {
        await updateOverrideAction(lineId, value.trim() === "" ? null : value);
        toast.success(value.trim() === "" ? "Đã bỏ override" : "Đã lưu override");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function excludeLine(lineId: number) {
    startTransition(async () => {
      try {
        await excludePrLineAction(lineId);
        toast.success("Đã loại trừ khỏi sync");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function excludeEntity(lineId: number) {
    startTransition(async () => {
      try {
        await excludePrLineEntityAction(lineId);
        toast.success("Đã loại trừ chủ thể khỏi sync");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Phải thu / Phải trả</h1>
          <p className="text-sm text-muted-foreground">Snapshot sync theo kỳ, override thủ công luôn được giữ lại.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={openPayableSyncDialog} disabled={isPending}>
            <RefreshCw className="size-4" /> Sync phải trả
          </Button>
          <Button variant="ghost" size="icon" onClick={() => undoSync("payable")} disabled={isPending} title="Undo sync phải trả gần nhất">
            <Undo2 className="size-4" />
          </Button>
          <Button size="sm" onClick={() => runSync("receivable")} disabled={isPending}>
            <RefreshCw className="size-4" /> Sync phải thu
          </Button>
          <Button variant="ghost" size="icon" onClick={() => undoSync("receivable")} disabled={isPending} title="Undo sync phải thu gần nhất">
            <Undo2 className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={deleteImportedRows} disabled={isPending}>
            Xóa dòng import
          </Button>
          <Button variant="destructive" size="sm" onClick={deleteAllRows} disabled={isPending || rows.length === 0}>
            <Trash2 className="size-4" /> Xóa toàn bộ
          </Button>
          <Button onClick={() => setDialogOpen(true)} size="sm">Thêm điều chỉnh</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-xs text-muted-foreground">Tổng phải trả</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{money(totals.payable)}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-500/30 dark:bg-green-500/10">
          <p className="text-xs text-muted-foreground">Tổng phải thu</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{money(totals.receivable)}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Dòng đã override</p>
          <p className="text-xl font-bold">{totals.overrideCount}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(["", "payable", "receivable"] as const).map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${filterType === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}>
            {t === "" ? "Tất cả" : t === "payable" ? "Phải trả" : "Phải thu"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left">Nguồn</th>
              <th className="px-3 py-2 text-left">Chủ thể</th>
              <th className="px-3 py-2 text-left">Đối tác / lô</th>
              <th className="px-3 py-2 text-left">Loại</th>
              <th className="px-3 py-2 text-right">Source</th>
              <th className="px-3 py-2 text-right">Hiệu lực</th>
              <th className="px-3 py-2 text-left">Override</th>
              <th className="px-3 py-2 text-left">Kỳ</th>
              <th className="px-3 py-2 text-left">Ghi chú</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Không có dữ liệu</td></tr>
            ) : filtered.map((r) => {
              const lineId = r.sourceLineId;
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{SOURCE_LABELS[r.source]}{r.isStale ? " · stale" : ""}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.entityName ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{r.partyName}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${r.type === "payable" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"}`}>
                      {r.type === "payable" ? "Phải trả" : "Phải thu"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{r.sourceAmountVnd ? money(r.sourceAmountVnd) : "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{money(r.amountVnd)}</td>
                  <td className="px-3 py-2">
                    {lineId ? (
                      <div className="flex items-center gap-1">
                        <Input className="h-8 w-32" type="number" placeholder={r.overrideAmountVnd ?? "Source"} value={overrides[lineId] ?? ""} onChange={(e) => setOverrides((m) => ({ ...m, [lineId]: e.target.value }))} />
                        <Button size="icon" variant="ghost" onClick={() => saveOverride(lineId)} disabled={isPending} title="Lưu override">
                          <Save className="size-4" />
                        </Button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Manual</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.periodMonth && r.periodYear ? `${r.periodMonth}/${r.periodYear}` : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {lineId && r.source !== "sl_dt" && r.entityId ? (
                        <Button size="icon" variant="ghost" onClick={() => excludeEntity(lineId)} disabled={isPending} title="Loại trừ chủ thể">
                          <SlidersHorizontal className="size-4" />
                        </Button>
                      ) : null}
                      {lineId && r.source !== "sl_dt" ? (
                        <Button size="icon" variant="ghost" onClick={() => excludeLine(lineId)} disabled={isPending} title="Loại trừ NCC/đội">
                          <XCircle className="size-4" />
                        </Button>
                      ) : null}
                      <Button size="icon" variant="ghost" onClick={() => deleteRow(r.id)} disabled={isPending} title="Xóa dòng">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CrudDialog title="Thêm điều chỉnh phải thu/trả" open={dialogOpen} onOpenChange={setDialogOpen}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ngày *</Label><DateInput value={form.date} onChange={(v) => set("date", v)} required /></div>
            <div>
              <Label>Loại *</Label>
              <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={form.type} onChange={(e) => set("type", e.target.value as typeof form.type)}>
                <option value="payable">Phải trả</option>
                <option value="receivable">Phải thu</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Loại đối tác</Label>
              <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={form.partyType} onChange={(e) => set("partyType", e.target.value as typeof form.partyType)}>
                <option value="supplier">Nhà cung cấp</option>
                <option value="contractor">Nhà thầu</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div><Label>Tên đối tác *</Label><Input value={form.partyName} onChange={(e) => set("partyName", e.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Số tiền (VND) *</Label><Input type="number" min="0" value={form.amountVnd} onChange={(e) => set("amountVnd", e.target.value)} required /></div>
            <div><Label>Ngày hạn</Label><DateInput value={form.dueDate} onChange={(v) => set("dueDate", v)} /></div>
          </div>
          <div><Label>Ghi chú</Label><Input value={form.note} onChange={(e) => set("note", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>Hủy</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu"}</Button>
          </div>
        </form>
      </CrudDialog>

      <CrudDialog title="Chọn chủ thể loại trừ khi sync phải trả" open={payableSyncOpen} onOpenChange={setPayableSyncOpen}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Chọn chủ thể không đưa vào Phải trả cho lần sync này. Nếu không chọn ai, toàn bộ số dư phải trả sẽ được đồng bộ.
          </p>
          <div className="max-h-[360px] overflow-y-auto rounded-lg border">
            {payableSyncOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Không có số dư phải trả để đồng bộ.</div>
            ) : payableSyncOptions.map((option) => (
              <label key={option.entityId} className="flex cursor-pointer items-start gap-3 border-b px-3 py-2 last:border-0 hover:bg-muted/30">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={excludedEntityIds.includes(option.entityId)}
                  onChange={() => toggleExcludedEntity(option.entityId)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{option.entityName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {option.rowCount} dòng · {money(option.amountVnd)} · {option.sourceModules.map((source) => SOURCE_LABELS[source]).join(", ")}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-muted-foreground">Đang chọn loại trừ {excludedEntityIds.length} chủ thể</span>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPayableSyncOpen(false)} disabled={isPending}>Hủy</Button>
              <Button type="button" onClick={syncPayables} disabled={isPending || payableSyncOptions.length === 0}>
                {isPending ? "Đang sync..." : "Sync phải trả"}
              </Button>
            </div>
          </div>
        </div>
      </CrudDialog>
    </div>
  );
}
