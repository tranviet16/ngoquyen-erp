"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { vndFormatter } from "@/lib/format";
import { setInvoiceOverride } from "@/lib/du-an/can-doi-service";
import {
  BUCKET_LABELS,
  type CanDoiBucket,
  type CanDoiData,
  type CanDoiGroup,
  type CanDoiRow,
  type CanDoiSubtotal,
  type WorklistItem,
} from "@/lib/du-an/can-doi-metrics";

type Mode = "hd" | "tt-dt" | "tt-hd";

const MODE_LABELS: Record<Mode, string> = {
  hd: "Lấy hóa đơn",
  "tt-dt": "Thi công vs DT",
  "tt-hd": "TT vs HĐ",
};

const BUCKET_STYLES: Record<CanDoiBucket, string> = {
  chua_lay: "bg-zinc-100 text-zinc-700",
  thieu: "bg-amber-100 text-amber-800",
  du: "bg-emerald-100 text-emerald-800",
  vuot: "bg-red-100 text-red-800",
  ngoai_dt: "bg-sky-100 text-sky-800",
};

function fmt(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return vndFormatter(Math.round(n));
}

function qtyFmt(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function pctFmt(p: number | null | undefined): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

function diffClass(n: number | null | undefined): string {
  if (n == null || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-red-600" : "text-emerald-600";
}

function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

function BucketBadge({ bucket }: { bucket: CanDoiBucket }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${BUCKET_STYLES[bucket]}`}>
      {BUCKET_LABELS[bucket]}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const width = Math.min(100, Math.max(0, pct * 100));
  return (
    <div className="mt-1 h-1.5 w-full rounded bg-muted">
      <div
        className={`h-1.5 rounded ${pct > 1 ? "bg-amber-500" : "bg-emerald-500"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function OverrideCell({
  projectId,
  row,
  canEdit,
}: {
  projectId: number;
  row: CanDoiRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  // Enter disables the input → native blur fires → onBlur would commit a 2nd time
  const committedRef = useRef(false);

  const commit = (raw: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const cleaned = raw.replace(/[.\s,]/g, "");
    const parsed = cleaned === "" ? null : Number(cleaned);
    if (parsed != null && !Number.isFinite(parsed)) {
      toast.error("Giá trị không hợp lệ");
      committedRef.current = false;
      return;
    }
    startTransition(async () => {
      try {
        await setInvoiceOverride(row.estimateId!, projectId, parsed);
        toast.success(parsed == null ? "Đã trở về giá trị tự tính" : "Đã ghi đè Còn phải lấy HĐ");
        setEditing(false);
        router.refresh();
      } catch {
        toast.error("Không lưu được — kiểm tra quyền sửa");
        committedRef.current = false;
      }
    });
  };

  if (!canEdit || row.kind !== "estimate") {
    return (
      <span className={row.kind === "invoice-only" ? "italic text-muted-foreground" : ""}>
        {fmt(row.remainingInvoiceVnd)}
        {row.remainingIsOverride && <span title="Giá trị ghi đè thủ công"> ✎</span>}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        disabled={isPending}
        defaultValue={row.remainingIsOverride ? String(Math.round(row.remainingInvoiceVnd)) : ""}
        placeholder="Trống = tự tính"
        className="w-32 rounded border px-1 py-0.5 text-right text-sm"
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(value || (e.target as HTMLInputElement).value);
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="cursor-pointer underline-offset-2 hover:underline"
      title={
        row.remainingIsOverride
          ? "Giá trị ghi đè thủ công — bấm để sửa (xóa trống để trở về tự tính)"
          : "Tự tính = Dự toán − Hóa đơn. Bấm để ghi đè."
      }
      onClick={() => {
        committedRef.current = false;
        setEditing(true);
      }}
    >
      {fmt(row.remainingInvoiceVnd)}
      {row.remainingIsOverride && <span> ✎</span>}
    </button>
  );
}

function StatCard({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {children}
    </div>
  );
}

interface ColumnDef {
  header: string;
  className?: string;
  render: (row: CanDoiRow, ctx: { projectId: number; canEdit: boolean }) => React.ReactNode;
}

const HD_COLUMNS: ColumnDef[] = [
  { header: "DT SL", className: "text-right", render: (r) => qtyFmt(r.estimateQty) },
  {
    header: "Dự toán",
    className: "text-right",
    render: (r) => (
      <span title={r.estimateAdjustedTotalVnd !== r.estimateTotalVnd ? `Gốc: ${fmt(r.estimateTotalVnd)}` : undefined}>
        {fmt(r.estimateAdjustedTotalVnd)}
      </span>
    ),
  },
  { header: "HĐ SL", className: "text-right", render: (r) => (r.unitMismatch ? "—" : qtyFmt(r.qtyHd)) },
  { header: "Hóa đơn đã lấy", className: "text-right", render: (r) => fmt(r.invoiceAmountVnd) },
  {
    header: "%HĐ",
    className: "text-right",
    render: (r) => (
      <div className="min-w-[70px]">
        <span>{pctFmt(r.pctHdMoney)}</span>
        <ProgressBar pct={r.pctHdMoney} />
      </div>
    ),
  },
  {
    header: "Còn phải lấy HĐ",
    className: "text-right",
    render: (r, ctx) => <OverrideCell projectId={ctx.projectId} row={r} canEdit={ctx.canEdit} />,
  },
];

const TT_DT_COLUMNS: ColumnDef[] = [
  { header: "DT SL", className: "text-right", render: (r) => qtyFmt(r.estimateQty) },
  { header: "TT SL", className: "text-right", render: (r) => qtyFmt(r.qtyTt) },
  {
    header: "%SL",
    className: "text-right",
    render: (r) => (
      <span className={r.pctTtQty != null && r.pctTtQty > 1 ? "font-medium text-red-600" : ""}>
        {pctFmt(r.pctTtQty)}
        {r.pctTtQty != null && r.pctTtQty > 1 && " ⚠"}
      </span>
    ),
  },
  { header: "Giá DT", className: "text-right", render: (r) => fmt(r.estimateUnitPrice) },
  { header: "Giá bq TT", className: "text-right", render: (r) => fmt(r.avgPriceTt) },
  {
    header: "Chênh giá",
    className: "text-right",
    render: (r) =>
      r.priceDiffTtDt == null ? (
        "—"
      ) : (
        <span className={diffClass(r.priceDiffTtDt)}>
          {fmt(r.priceDiffTtDt)} ({pctFmt(r.priceDiffTtDtPct)})
        </span>
      ),
  },
  {
    header: "Tác động giá",
    className: "text-right",
    render: (r) => <span className={diffClass(r.priceImpactTt)}>{fmt(r.priceImpactTt)}</span>,
  },
];

const TT_HD_COLUMNS: ColumnDef[] = [
  { header: "TT SL", className: "text-right", render: (r) => qtyFmt(r.qtyTt) },
  { header: "HĐ SL", className: "text-right", render: (r) => qtyFmt(r.qtyHd) },
  {
    header: "Chênh SL",
    className: "text-right",
    render: (r) => (r.qtyDiffTtHd == null ? "—" : <span className={diffClass(r.qtyDiffTtHd)}>{qtyFmt(r.qtyDiffTtHd) === "—" ? "0" : qtyFmt(r.qtyDiffTtHd)}</span>),
  },
  { header: "Giá bq HĐ", className: "text-right", render: (r) => fmt(r.avgPriceHd) },
  { header: "Giá bq TT", className: "text-right", render: (r) => fmt(r.avgPriceTt) },
  {
    header: "Chênh giá",
    className: "text-right",
    render: (r) =>
      r.priceDiffTtHd == null ? "—" : <span className={diffClass(r.priceDiffTtHd)}>{fmt(r.priceDiffTtHd)}</span>,
  },
  {
    header: "Chênh tiền TT−HĐ",
    className: "text-right",
    render: (r) => <span className={diffClass(r.diffActualVsInvoiceVnd)}>{fmt(r.diffActualVsInvoiceVnd)}</span>,
  },
];

const MODE_COLUMNS: Record<Mode, ColumnDef[]> = {
  hd: HD_COLUMNS,
  "tt-dt": TT_DT_COLUMNS,
  "tt-hd": TT_HD_COLUMNS,
};

function SubtotalRow({
  label,
  sub,
  mode,
  colCount,
  strong,
  sticky,
}: {
  label: string;
  sub: CanDoiSubtotal;
  mode: Mode;
  colCount: number;
  strong?: boolean;
  sticky?: boolean;
}) {
  const cls = `${strong ? "bg-muted font-bold" : "bg-muted/50 font-semibold"}${sticky ? " sticky bottom-0" : ""}`;
  if (mode !== "hd") {
    return (
      <tr className={cls}>
        <td colSpan={colCount} className="px-2 py-1.5">
          {label} — Dự toán: {fmt(sub.estimateAdjustedTotalVnd)} · Thực tế: {fmt(sub.actualAmountVnd)} · Chênh TT−HĐ:{" "}
          <span className={diffClass(sub.diffActualVsInvoiceVnd)}>{fmt(sub.diffActualVsInvoiceVnd)}</span>
        </td>
      </tr>
    );
  }
  return (
    <tr className={cls}>
      <td colSpan={4} className="px-2 py-1.5">{label}</td>
      <td className="px-2 py-1.5 text-right" />
      <td className="px-2 py-1.5 text-right">{fmt(sub.estimateAdjustedTotalVnd)}</td>
      <td className="px-2 py-1.5 text-right" />
      <td className="px-2 py-1.5 text-right">{fmt(sub.invoiceAmountVnd)}</td>
      <td className="px-2 py-1.5 text-right">{pctFmt(sub.pctHdMoney)}</td>
      <td className="px-2 py-1.5 text-right">{fmt(sub.remainingInvoiceVnd)}</td>
    </tr>
  );
}

interface Props {
  projectId: number;
  data: CanDoiData;
  canEdit: boolean;
}

export function CanDoiVatTuClient({ projectId, data, canEdit }: Props) {
  const [mode, setMode] = useState<Mode>("hd");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [buckets, setBuckets] = useState<Set<CanDoiBucket>>(new Set());
  const [overrideOnly, setOverrideOnly] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const storageKey = `candoi-${projectId}`;
  // Persist chỉ chạy SAU khi restore xong — nếu không, effect persist đầu tiên
  // (mode/expanded còn là mặc định) sẽ ghi đè giá trị vừa đọc từ sessionStorage.
  const restoredRef = useRef(false);

  useEffect(() => {
    // setTimeout để tránh setState đồng bộ trong effect (pattern như theme-toggle)
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as { mode?: Mode; expanded?: number[] };
          if (saved.mode && MODE_LABELS[saved.mode]) setMode(saved.mode);
          if (Array.isArray(saved.expanded)) setExpanded(new Set(saved.expanded));
        }
      } catch {
        /* sessionStorage bị chặn → dùng mặc định */
      }
      restoredRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ mode, expanded: [...expanded] }));
    } catch {
      /* ignore */
    }
  }, [storageKey, mode, expanded]);

  const filterActive = search.trim() !== "" || buckets.size > 0 || overrideOnly;
  const filteredGroups = useMemo(() => {
    if (!filterActive) return data.groups;
    const q = normalizeSearch(search.trim());
    const result: CanDoiGroup[] = [];
    for (const g of data.groups) {
      const rows = g.rows.filter((r) => {
        if (q && !normalizeSearch(`${r.itemCode} ${r.itemName}`).includes(q)) return false;
        if (buckets.size > 0 && !buckets.has(r.bucket)) return false;
        if (overrideOnly && !r.remainingIsOverride) return false;
        return true;
      });
      if (rows.length > 0) result.push({ ...g, rows });
    }
    return result;
  }, [data.groups, filterActive, search, buckets, overrideOnly]);

  const columns = MODE_COLUMNS[mode];
  const colCount = 4 + columns.length;
  const ttEmpty = data.total.ttRowCount === 0;

  const toggleGroup = (categoryId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const handleJump = (item: WorklistItem) => {
    setExpanded((prev) => new Set(prev).add(item.categoryId));
    setHighlightId(item.rowId);
    setTimeout(() => {
      document.getElementById(`candoi-${item.rowId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
    setTimeout(() => setHighlightId(null), 2500);
  };

  const toggleBucket = (b: CanDoiBucket) => {
    setBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  };

  const total = data.total;
  const openCount = total.bucketCounts.chua_lay + total.bucketCounts.thieu;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cân Đối Vật Tư</h2>
          <p className="text-xs text-muted-foreground">
            Thực tế = 0 nghĩa là chưa nhập số phát sinh. Nhập/sửa số thực tế tại tab Giao Dịch (cột ĐG TT, SL).
          </p>
        </div>
        <a
          href={`/api/du-an/${projectId}/can-doi/export`}
          download
          className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          ⬇ Xuất Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Tổng dự toán (điều chỉnh)"
          value={fmt(total.estimateAdjustedTotalVnd)}
          sub={
            total.estimateAdjustedTotalVnd !== total.estimateTotalVnd
              ? `Gốc: ${fmt(total.estimateTotalVnd)}`
              : `${total.rowCount} dòng`
          }
        />
        <StatCard label="Đã lấy HĐ" value={fmt(total.invoiceAmountVnd)} sub={pctFmt(total.pctHdMoney)}>
          <ProgressBar pct={total.pctHdMoney} />
        </StatCard>
        <StatCard
          label="Còn phải lấy HĐ"
          value={fmt(total.remainingPositiveVnd)}
          sub={`${openCount} dòng chưa đủ hóa đơn`}
        />
        <StatCard
          label="Thực tế đã nhập"
          value={total.actualAmountVnd === 0 ? "0 ₫" : fmt(total.actualAmountVnd)}
          sub={`${total.ttRowCount}/${total.rowCount} dòng có TT`}
        />
      </div>

      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Top 10 cần đi lấy hóa đơn</p>
        {data.worklist.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không còn hóa đơn cần lấy 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.worklist.map((w, i) => (
                <tr
                  key={w.rowId}
                  className="cursor-pointer border-t first:border-t-0 hover:bg-muted/40"
                  onClick={() => handleJump(w)}
                >
                  <td className="w-6 py-1 text-muted-foreground">{i + 1}.</td>
                  <td className="w-24 py-1 font-mono text-xs">{w.itemCode}</td>
                  <td className="py-1">{w.itemName}</td>
                  <td className="w-20 py-1"><BucketBadge bucket={w.bucket} /></td>
                  <td className="w-36 py-1 text-right font-medium">{fmt(w.remainingInvoiceVnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Chế độ xem">
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {MODE_LABELS[m]}
            {m !== "hd" && (
              <span className="ml-1 text-xs opacity-75">
                ({total.ttRowCount}/{total.rowCount})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm vật tư…"
          className="h-8 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        {(Object.keys(BUCKET_LABELS) as CanDoiBucket[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => toggleBucket(b)}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              buckets.has(b) ? BUCKET_STYLES[b] + " border-transparent font-semibold" : "text-muted-foreground"
            }`}
          >
            {BUCKET_LABELS[b]} ({total.bucketCounts[b]})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOverrideOnly((v) => !v)}
          className={`rounded-full border px-2 py-0.5 text-xs ${overrideOnly ? "bg-violet-100 font-semibold text-violet-800" : "text-muted-foreground"}`}
        >
          ✎ Có ghi đè
        </button>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set(data.groups.map((g) => g.categoryId)))}>
          Mở tất cả
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>
          Đóng tất cả
        </Button>
      </div>

      {mode !== "hd" && ttEmpty && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Chưa có số thực tế nào được nhập — chế độ này sẽ tự có số liệu khi bạn nhập cột TT (và SL) trên các dòng ở
          tab Giao Dịch. Các cột so sánh hiển thị &quot;—&quot; cho tới lúc đó.
        </div>
      )}

      <div className="overflow-x-auto rounded border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left">
              <th className="w-28 px-2 py-2">Mã</th>
              <th className="px-2 py-2">Tên vật tư / công việc</th>
              <th className="w-16 px-2 py-2">ĐVT</th>
              <th className="w-20 px-2 py-2">Trạng thái</th>
              {columns.map((c) => (
                <th key={c.header} className={`w-28 px-2 py-2 ${c.className ?? ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map((group) => {
              const isOpen = filterActive || expanded.has(group.categoryId);
              return (
                <GroupSection
                  key={group.categoryId}
                  group={group}
                  mode={mode}
                  columns={columns}
                  colCount={colCount}
                  isOpen={isOpen}
                  onToggle={() => toggleGroup(group.categoryId)}
                  projectId={projectId}
                  canEdit={canEdit}
                  highlightId={highlightId}
                />
              );
            })}
            {filteredGroups.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-2 py-6 text-center text-muted-foreground">
                  Không có dòng nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <SubtotalRow label="TỔNG CỘNG" sub={total} mode={mode} colCount={colCount} strong sticky />
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GroupSection({
  group,
  mode,
  columns,
  colCount,
  isOpen,
  onToggle,
  projectId,
  canEdit,
  highlightId,
}: {
  group: CanDoiGroup;
  mode: Mode;
  columns: ColumnDef[];
  colCount: number;
  isOpen: boolean;
  onToggle: () => void;
  projectId: number;
  canEdit: boolean;
  highlightId: string | null;
}) {
  const sub = group.subtotal;
  return (
    <>
      <tr className="cursor-pointer border-t bg-muted/30 hover:bg-muted/50" onClick={onToggle}>
        <td colSpan={colCount} className="px-2 py-2">
          <div className="flex items-center gap-3">
            <span className="w-4 text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
            <span className="font-semibold">
              {group.code} — {group.name}
            </span>
            <span className="text-xs text-muted-foreground">{sub.rowCount} dòng</span>
            <span className="ml-auto flex items-center gap-3 text-xs">
              <span>DT: {fmt(sub.estimateAdjustedTotalVnd)}</span>
              <span>HĐ: {fmt(sub.invoiceAmountVnd)}</span>
              <span className="font-medium">{pctFmt(sub.pctHdMoney)}</span>
              <span className="inline-block w-24">
                <ProgressBar pct={sub.pctHdMoney} />
              </span>
              <span>Còn: {fmt(sub.remainingInvoiceVnd)}</span>
            </span>
          </div>
        </td>
      </tr>
      {isOpen &&
        group.rows.map((row) => (
          <tr
            key={row.id}
            id={`candoi-${row.id}`}
            className={`border-t hover:bg-muted/20 ${highlightId === row.id ? "bg-amber-50 dark:bg-amber-500/10" : ""}`}
          >
            <td className="px-2 py-1 font-mono text-xs">{row.itemCode}</td>
            <td className="px-2 py-1">
              {row.itemName}
              {row.kind === "invoice-only" && (
                <span
                  className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800"
                  title="Chỉ có hóa đơn, không có dòng dự toán tương ứng"
                >
                  ngoài DT
                </span>
              )}
              {row.unitMismatch && (
                <span
                  className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-800"
                  title="ĐVT hóa đơn khác ĐVT dự toán — chỉ so sánh theo tiền"
                >
                  khác ĐVT
                </span>
              )}
            </td>
            <td className="px-2 py-1">{row.unit}</td>
            <td className="px-2 py-1">
              <BucketBadge bucket={row.bucket} />
            </td>
            {columns.map((c) => (
              <td key={c.header} className={`px-2 py-1 ${c.className ?? ""}`}>
                {c.render(row, { projectId, canEdit })}
              </td>
            ))}
          </tr>
        ))}
      {isOpen && <SubtotalRow label={`Cộng ${group.name}`} sub={sub} mode={mode} colCount={colCount} />}
    </>
  );
}
