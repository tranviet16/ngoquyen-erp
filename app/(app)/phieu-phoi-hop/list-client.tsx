"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { statusLabel, type FormStatus } from "@/lib/coordination-form/state-machine";
import type { FormWithRelations } from "@/lib/coordination-form/coordination-form-service";
import { formatDate } from "@/lib/utils/format";
import { Plus, AlertTriangle } from "lucide-react";

interface DeptRow {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

interface Props {
  data: {
    items: FormWithRelations[];
    total: number;
    page: number;
    pageSize: number;
    pendingDirectorCount: number;
  };
  departments: DeptRow[];
  filter: { status?: FormStatus; scope: "mine" | "all"; page: number };
}

const STATUS_BADGE: Record<FormStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
  pending_leader: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  pending_director: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  revising: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const PRIORITY_LABEL: Record<string, string> = {
  cao: "Cao",
  trung_binh: "Trung bình",
  thap: "Thấp",
};

const FILTERS: { key: string; label: string; status?: FormStatus; scope?: "mine" | "all" }[] = [
  { key: "all", label: "Tất cả", scope: "all" },
  { key: "mine", label: "Của tôi", scope: "mine" },
  { key: "pending_leader", label: "Chờ lãnh đạo", status: "pending_leader" },
  { key: "pending_director", label: "Chờ giám đốc", status: "pending_director" },
  { key: "approved", label: "Đã duyệt", status: "approved" },
  { key: "rejected", label: "Từ chối", status: "rejected" },
  { key: "revising", label: "Đang sửa", status: "revising" },
];

export function ListClient({ data, departments, filter }: Props) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  function setFilter(opts: { status?: FormStatus; scope?: "mine" | "all" }) {
    const sp = new URLSearchParams();
    if (opts.scope === "mine") sp.set("scope", "mine");
    if (opts.status) sp.set("status", opts.status);
    sp.set("page", "1");
    router.replace(`/phieu-phoi-hop?${sp.toString()}`);
  }

  function setPage(p: number) {
    const sp = new URLSearchParams();
    if (filter.scope === "mine") sp.set("scope", "mine");
    if (filter.status) sp.set("status", filter.status);
    sp.set("page", String(p));
    router.replace(`/phieu-phoi-hop?${sp.toString()}`);
  }

  const activeKey =
    filter.scope === "mine" ? "mine" : filter.status ?? "all";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Phiếu phối hợp công việc</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý phiếu phối hợp giữa các phòng ban — quy trình duyệt 3 bước.
          </p>
          {data.pendingDirectorCount > 0 && (
            <p className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 mt-2">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Có {data.pendingDirectorCount} phiếu đang chờ giám đốc duyệt
            </p>
          )}
        </div>
        <Link href="/phieu-phoi-hop/tao-moi">
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            Tạo phiếu mới
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter({ status: f.status, scope: f.scope })}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              activeKey === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent border-border hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-3 py-2 font-semibold">Mã</th>
              <th className="text-left px-3 py-2 font-semibold">Phòng tạo</th>
              <th className="text-left px-3 py-2 font-semibold">Phòng thực hiện</th>
              <th className="text-left px-3 py-2 font-semibold">Nội dung</th>
              <th className="text-left px-3 py-2 font-semibold">Ưu tiên</th>
              <th className="text-left px-3 py-2 font-semibold">Trạng thái</th>
              <th className="text-left px-3 py-2 font-semibold">Ngày tạo</th>
              <th className="text-right px-3 py-2 font-semibold">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  Chưa có phiếu nào
                </td>
              </tr>
            ) : (
              data.items.map((f) => (
                <tr key={f.id} className="border-b last:border-0 even:bg-muted/20 hover:bg-muted/40 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs">{f.code}</td>
                  <td className="px-3 py-2">{f.creatorDept.name}</td>
                  <td className="px-3 py-2">{f.executorDept.name}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={f.content}>
                    {f.content}
                  </td>
                  <td className="px-3 py-2">{PRIORITY_LABEL[f.priority] ?? f.priority}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_BADGE[f.status as FormStatus] ?? "bg-muted"
                      }`}
                    >
                      {statusLabel(f.status as FormStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {formatDate(f.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/phieu-phoi-hop/${f.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Xem
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={data.page <= 1}
            onClick={() => setPage(data.page - 1)}
          >
            Trước
          </Button>
          <span className="text-muted-foreground">
            Trang {data.page}/{totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={data.page >= totalPages}
            onClick={() => setPage(data.page + 1)}
          >
            Sau
          </Button>
        </div>
      )}
      {/* Departments hint not currently rendered — kept for potential filter expansion */}
      <span hidden>{departments.length}</span>
    </div>
  );
}
