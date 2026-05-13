import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getUserContext } from "@/lib/department-rbac";
import { listDepartments } from "@/lib/department-service";
import {
  getEscalatedForms,
  groupByExecutorDept,
} from "@/lib/coordination-form/sla-stats";
import { formatDateTime, formatDate } from "@/lib/utils/format";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : fallback;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; deptId?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const role = session.user.role ?? "viewer";
  const ctx = await getUserContext(session.user.id);
  if (role !== "admin" && !ctx?.isDirector) {
    redirect("/van-hanh/phieu-phoi-hop");
  }

  const sp = await searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const from = parseDate(sp.from, defaultFrom);
  const to = parseDate(sp.to, defaultTo);
  to.setHours(23, 59, 59, 999);
  const deptId = sp.deptId ? Number(sp.deptId) : undefined;

  const [rows, groups, depts] = await Promise.all([
    getEscalatedForms({ from, to, executorDeptId: deptId }),
    groupByExecutorDept({ from, to }),
    listDepartments({ activeOnly: false }),
  ]);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/van-hanh/hieu-suat"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Quay lại Hiệu suất
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Thống kê phiếu quá hạn SLA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phiếu phối hợp bị escalate (TBP không duyệt trong 24h, chuyển Giám đốc).
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 shadow-sm" method="get">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Từ ngày</label>
          <input type="date" name="from" defaultValue={fromStr} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Đến ngày</label>
          <input type="date" name="to" defaultValue={toStr} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Phòng thực hiện</label>
          <select name="deptId" defaultValue={deptId ?? ""} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">Tất cả phòng</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Lọc
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-3 py-2 text-sm font-semibold bg-muted/40">
            Tổng quan ({rows.length} phiếu)
          </div>
          {groups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Không có phiếu nào quá hạn trong khoảng thời gian này.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left px-3 py-2">Phòng thực hiện</th><th className="text-right px-3 py-2">Số phiếu</th></tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.deptId} className="border-t">
                    <td className="px-3 py-2">{g.deptName}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-3 py-2 font-semibold">Mã</th>
              <th className="text-left px-3 py-2 font-semibold">Người tạo</th>
              <th className="text-left px-3 py-2 font-semibold">Phòng thực hiện</th>
              <th className="text-left px-3 py-2 font-semibold">TBP để quá hạn</th>
              <th className="text-left px-3 py-2 font-semibold">Thời điểm escalate</th>
              <th className="text-left px-3 py-2 font-semibold">Trạng thái</th>
              <th className="text-left px-3 py-2 font-semibold">Đóng lúc</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Không có dữ liệu</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 even:bg-muted/20 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link href={`/van-hanh/phieu-phoi-hop/${r.id}`} className="font-mono text-xs text-primary hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.creatorName}</td>
                  <td className="px-3 py-2">{r.executorDeptName}</td>
                  <td className="px-3 py-2">{r.escalatedFromUserName ?? "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDateTime(r.escalatedAt)}</td>
                  <td className="px-3 py-2 text-xs">{r.finalStatus}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{r.finalActionAt ? formatDate(r.finalActionAt) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
