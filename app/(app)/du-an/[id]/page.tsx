import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectDashboard } from "@/lib/du-an/dashboard-service";
import { formatVND, formatDate, formatNumber } from "@/lib/utils/format";
import { AlertTriangle } from "lucide-react";
import { requireModuleAccess } from "@/lib/acl/guards";
import { StatCard } from "@/components/du-an/stat-card";
import { loadBookHeadline } from "@/components/du-an/dt-hd-tt/load-report-page";
import { figureDataValue } from "@/components/du-an/dt-hd-tt/tong-quan-view";
import { tongQuanPath } from "@/lib/du-an/dt-hd-tt/overview";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDashboardPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();
  await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  // Công trình dùng sổ DT-HĐ-TT: thẻ "Thực tế" đọc Phần III của sổ (null = công trình không dùng sổ hoặc
  // đọc sổ lỗi → giữ nguyên thẻ cũ).
  const [dash, book] = await Promise.all([getProjectDashboard(projectId), loadBookHeadline(projectId)]);

  const totalTasks = Object.values(dash.schedule).reduce((a, b) => a + b, 0);
  const doneTasks = dash.schedule.done;
  const pctDone = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const variance = dash.transactionTotalTt - dash.estimateTotal;
  const variancePct =
    dash.estimateTotal > 0 ? ((variance / dash.estimateTotal) * 100).toFixed(1) : "0.0";
  const isOverBudget = Number(variancePct) > 0;

  const cdtReceived = dash.cashflow["cdt_to_cty"] ?? 0;
  const paidToDoi = dash.cashflow["cty_to_doi"] ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Tiến độ"
          value={`${pctDone}%`}
          sub={`${doneTasks}/${totalTasks} công việc hoàn thành`}
          tone={pctDone >= 80 ? "success" : pctDone >= 40 ? "info" : "warning"}
        />
        <StatCard label="Dự toán gốc" value={formatVND(dash.estimateTotal)} sub="Tổng dự toán" />
        <StatCard
          label="Hóa đơn đã lấy"
          value={formatVND(dash.transactionTotalHd)}
          sub="Tổng giá trị HĐ đã thu thập"
          tone="info"
        />
        {book ? (
          // Hook cho lệnh đo `dashboard`: data-book-card, data-value (số đồng, cùng dạng với Tổng quan), data-tone.
          <Link
            href={tongQuanPath(projectId)}
            title="Mở Tổng quan Đối chiếu DT-HĐ-TT"
            data-book-card={projectId}
            data-value={figureDataValue(book.actual)}
            data-tone={book.tone}
            className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>div]:h-full hover:[&>div]:border-primary/60"
          >
            <StatCard label={book.label} value={book.value} sub={book.sub} tone={book.tone} />
          </Link>
        ) : (
          <StatCard
            label="Thực tế (đã nhập)"
            value={formatVND(dash.transactionTotalTt)}
            sub={`Biến động: ${isOverBudget ? "+" : ""}${variancePct}%`}
            tone={isOverBudget ? "danger" : "success"}
          />
        )}
        <StatCard
          label="CĐT đã trả"
          value={formatVND(cdtReceived)}
          sub={`Đã trả đội: ${formatVND(paidToDoi)}`}
          tone="info"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Chờ thực hiện" value={formatNumber(dash.schedule.pending)} />
        <StatCard
          label="Đang thực hiện"
          value={formatNumber(dash.schedule.in_progress)}
          tone="info"
        />
        <StatCard label="Hoàn thành" value={formatNumber(dash.schedule.done)} tone="success" />
        <StatCard
          label="Trễ hạn"
          value={formatNumber(dash.schedule.delayed)}
          tone={dash.schedule.delayed > 0 ? "danger" : "default"}
        />
      </div>

      {dash.contractWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5 p-4 space-y-2">
          <p className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200 text-sm">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Cảnh báo: {dash.contractWarnings.length} hợp đồng sắp hết hạn (trong 90 ngày)
          </p>
          <ul className="space-y-1 pl-6 list-disc marker:text-amber-600 dark:marker:text-amber-400">
            {dash.contractWarnings.map(
              (c: {
                id: number;
                docName: string;
                expiryDate: Date | null;
                partyName: string | null;
              }) => (
                <li key={c.id} className="text-sm text-amber-800 dark:text-amber-200">
                  <span className="font-medium">{c.docName}</span> — {c.partyName ?? "N/A"} — hết hạn{" "}
                  {formatDate(c.expiryDate, "?")}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
