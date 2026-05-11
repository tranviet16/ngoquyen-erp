"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { formatVND } from "@/lib/utils/format";

interface CategoryOpt { id: number; label: string }

interface Row {
  id: number;
  date: string;
  entryType: string;
  costBehavior: string;
  description: string;
  amountVnd: string;
  fromAccount: string | null;
  toAccount: string | null;
  expenseCategoryName: string | null;
}

interface Initial {
  g: string;
  c: string;
  f: string;
  t: string;
  q: string;
  page: number;
}

interface Props {
  initial: Initial;
  categories: CategoryOpt[];
  rows: Row[];
  total: number;
  pageSize: number;
  aggregate: {
    totalAmountVnd: string;
    rowCount: number;
    avgAmountVnd: string;
  };
}

const GROUP_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "thu-fixed", label: "Thu cố định" },
  { value: "thu-variable", label: "Thu biến đổi" },
  { value: "chi-fixed", label: "Chi cố định" },
  { value: "chi-variable", label: "Chi biến đổi" },
  { value: "transfer", label: "Chuyển khoản" },
];

const GROUP_LABEL: Record<string, string> = {
  "thu|fixed": "Thu cố định",
  "thu|variable": "Thu biến đổi",
  "chi|fixed": "Chi cố định",
  "chi|variable": "Chi biến đổi",
  "chuyen_khoan|transfer": "Chuyển khoản",
};

export function ExpenseFilterClient({ initial, categories, rows, total, pageSize, aggregate }: Props) {
  const router = useRouter();
  const [g, setG] = useState(initial.g);
  const [c, setC] = useState(initial.c);
  const [f, setF] = useState(initial.f);
  const [t, setT] = useState(initial.t);
  const [q, setQ] = useState(initial.q);

  const submit = (overridePage?: number) => {
    const sp = new URLSearchParams();
    if (g) sp.set("g", g);
    if (c) sp.set("c", c);
    if (f) sp.set("f", f);
    if (t) sp.set("t", t);
    if (q) sp.set("q", q);
    if (overridePage && overridePage > 1) sp.set("page", String(overridePage));
    router.push(`/tai-chinh/phan-loai-chi-phi${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  const reset = () => {
    setG(""); setC(""); setF(""); setT(""); setQ("");
    router.push("/tai-chinh/phan-loai-chi-phi");
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Phân loại chi phí</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lọc nhật ký theo nhóm (Thu/Chi cố định/biến đổi), phân loại chi phí, ngày và từ khoá.
        </p>
      </div>

      {/* Filter form */}
      <form
        onSubmit={(e) => { e.preventDefault(); submit(1); }}
        className="grid grid-cols-1 md:grid-cols-6 gap-3 rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Nhóm</label>
          <select
            value={g}
            onChange={(e) => setG(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Phân loại chi phí</label>
          <select
            value={c}
            onChange={(e) => setC(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Tất cả</option>
            {categories.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Từ ngày</label>
          <input
            type="date"
            value={f}
            onChange={(e) => setF(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Đến ngày</label>
          <input
            type="date"
            value={t}
            onChange={(e) => setT(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="md:col-span-5">
          <label className="text-xs font-medium text-muted-foreground">Từ khoá (mô tả)</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="vd: lương, BHXH, vật tư..."
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Lọc
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Xoá
          </button>
        </div>
      </form>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Tổng tiền" value={formatVND(Number(aggregate.totalAmountVnd))} />
        <KpiCard label="Số giao dịch" value={aggregate.rowCount.toLocaleString("vi-VN")} />
        <KpiCard label="Trung bình / GD" value={formatVND(Number(aggregate.avgAmountVnd))} />
      </div>

      {/* Result table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted/40">
              <tr>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ngày</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nhóm</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phân loại</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mô tả</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nguồn</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Số tiền</th>
                <th className="border-b px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Không có giao dịch nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const sourceLabel = r.entryType === "chi"
                    ? r.fromAccount
                    : r.entryType === "thu"
                    ? r.toAccount
                    : `${r.fromAccount ?? "?"} → ${r.toAccount ?? "?"}`;
                  return (
                    <tr key={r.id} className="even:bg-muted/20 hover:bg-muted/40 transition-colors">
                      <td className="border-b px-3 py-2 tabular-nums">{r.date}</td>
                      <td className="border-b px-3 py-2">
                        <GroupBadge entryType={r.entryType} costBehavior={r.costBehavior} />
                      </td>
                      <td className="border-b px-3 py-2 text-muted-foreground">{r.expenseCategoryName ?? "—"}</td>
                      <td className="border-b px-3 py-2 font-medium">{r.description}</td>
                      <td className="border-b px-3 py-2 text-muted-foreground">{sourceLabel ?? "—"}</td>
                      <td className={`border-b px-3 py-2 text-right font-semibold tabular-nums ${
                        r.entryType === "chi" ? "text-red-700 dark:text-red-300" :
                        r.entryType === "thu" ? "text-emerald-700 dark:text-emerald-300" : ""
                      }`}>
                        {formatVND(Number(r.amountVnd))}
                      </td>
                      <td className="border-b px-3 py-2 text-center">
                        <Link
                          href={`/tai-chinh/nhat-ky?focus=${r.id}`}
                          className="text-xs text-primary hover:underline"
                          aria-label="Xem chi tiết"
                        >
                          →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Trang {initial.page} / {totalPages} ({total.toLocaleString("vi-VN")} dòng)
          </span>
          <div className="flex gap-2">
            <button
              disabled={initial.page <= 1}
              onClick={() => submit(initial.page - 1)}
              className="rounded-md border bg-background px-3 py-1 disabled:opacity-50 hover:bg-muted"
            >
              ← Trước
            </button>
            <button
              disabled={initial.page >= totalPages}
              onClick={() => submit(initial.page + 1)}
              className="rounded-md border bg-background px-3 py-1 disabled:opacity-50 hover:bg-muted"
            >
              Sau →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function GroupBadge({ entryType, costBehavior }: { entryType: string; costBehavior: string }) {
  const key = `${entryType}|${costBehavior}`;
  const label = GROUP_LABEL[key] ?? `${entryType} ${costBehavior}`;
  const tone =
    entryType === "thu" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" :
    entryType === "chi" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" :
    "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}
